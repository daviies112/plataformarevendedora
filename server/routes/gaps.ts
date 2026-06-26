import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwtSecret';

// Middleware leve de autenticação para gaps.ts (JWT Bearer ou sessão)
function requireGapsAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const session = (req as any).session;

  // 1. Sessão válida
  if (session?.tenantId && (session?.userId || session?.resellerId || session?.revendedoraId)) {
    (req as any).gapsTenantId = session.tenantId;
    (req as any).gapsResellerId = session.resellerId || session.revendedoraId || session.userId;
    return next();
  }

  // 2. JWT Bearer
  if (authHeader.startsWith('Bearer ')) {
    try {
      const secret = getJwtSecret();
      const payload = jwt.verify(authHeader.slice(7), secret) as any;
      if (payload.tenantId) {
        (req as any).gapsTenantId = payload.tenantId;
        (req as any).gapsResellerId = payload.resellerId || payload.userId;
        return next();
      }
    } catch (_) {}
  }

  return res.status(401).json({ error: 'Nao autenticado' });
}

const router = Router();

// Pool direto no banco local — mesma DATABASE_URL usada pelo resto do servidor
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// ─────────────────────────────────────────────────────────
// HELPER: buscar config do Melhor Envio por tenant
// ─────────────────────────────────────────────────────────
async function getMelhorEnvioConfig(tenantId: string) {
  const res = await pool.query(
    `SELECT * FROM melhor_envios_config WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  return res.rows[0] || null;
}

// ─────────────────────────────────────────────────────────
// POST /api/gaps/logistica/etiqueta-devolucao
// Chamado pelo n8n quando revendedora solicita devolução.
// Gera etiqueta no Melhor Envio e retorna URL + order_id + valor_frete.
// ─────────────────────────────────────────────────────────
router.post('/logistica/etiqueta-devolucao', requireGapsAuth, async (req: Request, res: Response) => {
  try {
    const { maleta_id, tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id obrigatorio' });
    }

    const config = await getMelhorEnvioConfig(tenant_id);

    if (!config) {
      return res.status(404).json({ error: 'Configuracao Melhor Envio nao encontrada para este tenant' });
    }

    const meToken = process.env.MELHOR_ENVIO_TOKEN;
    const isSandbox = config.sandbox_mode;
    const baseUrl = isSandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';

    if (!meToken) {
      // Sem token configurado — retorna placeholder para nao travar o fluxo
      console.warn('[GAPS] MELHOR_ENVIO_TOKEN nao configurado — retornando placeholder');
      return res.json({
        ok: true,
        sandbox: true,
        etiqueta_url: 'https://sandbox.melhorenvio.com.br/etiqueta/PENDENTE',
        order_id: null,
        valor_frete: 0,
        aviso: 'Token Melhor Envio nao configurado — configure MELHOR_ENVIO_TOKEN no .env',
      });
    }

    // Monta payload de envio de devolucao (servico reverso)
    const payload = {
      from: {
        name: config.from_name,
        phone: config.from_phone,
        email: config.from_email,
        document: config.from_document,
        address: config.from_address,
        number: config.from_number,
        complement: config.from_complement || '',
        district: config.from_district,
        city: config.from_city,
        state_abbr: config.from_state_abbr,
        postal_code: config.from_postal_code,
        country_id: 'BR',
      },
      to: {
        // Devolucao: revendedora envia DE volta PARA a empresa
        // "from" acima eh o destino (empresa), "to" eh a origem (usamos dados da maleta se tiver)
        name: config.from_name,
        phone: config.from_phone,
        email: config.from_email,
        document: config.from_document,
        address: config.from_address,
        number: config.from_number,
        complement: config.from_complement || '',
        district: config.from_district,
        city: config.from_city,
        state_abbr: config.from_state_abbr,
        postal_code: config.from_postal_code,
        country_id: 'BR',
      },
      service: config.service_id_default || 3,
      agency: null,
      options: {
        insurance_value: config.devolucao_valor_declarado || 100,
        receipt: false,
        own_hand: false,
        collect: false,
        non_commercial: config.non_commercial || true,
        invoice: { key: '' },
      },
      products: [
        {
          name: 'Maleta de joias',
          quantity: 1,
          unitary_value: config.devolucao_valor_declarado || 100,
          weight: config.devolucao_peso || 1,
        },
      ],
      volumes: [
        {
          height: config.devolucao_altura || 10,
          width: config.devolucao_largura || 20,
          length: config.devolucao_comprimento || 30,
          weight: config.devolucao_peso || 1,
        },
      ],
    };

    // 1. Adicionar ao carrinho
    const cartRes = await fetch(`${baseUrl}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NexusEmiJoias/1.0 (daviemericko@gmail.com)',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const cartData: any = await cartRes.json();

    if (!cartRes.ok || cartData.errors) {
      console.error('[GAPS] Erro ao adicionar no carrinho ME:', cartData);
      return res.status(502).json({
        error: 'Erro ao criar etiqueta no Melhor Envio',
        detail: cartData,
      });
    }

    const orderId = cartData.id;

    // 2. Checkout do carrinho
    const checkoutRes = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NexusEmiJoias/1.0 (daviemericko@gmail.com)',
        Accept: 'application/json',
      },
      body: JSON.stringify({ orders: [orderId] }),
    });

    if (!checkoutRes.ok) {
      const checkoutData: any = await checkoutRes.json();
      console.error('[GAPS] Erro no checkout ME:', checkoutData);
      // Nao falha — retorna order_id sem URL ainda (etiqueta pode ser gerada depois)
      return res.json({
        ok: true,
        sandbox: isSandbox,
        order_id: orderId,
        etiqueta_url: `${baseUrl}/etiqueta/${orderId}`,
        valor_frete: cartData.price || 0,
        aviso: 'Checkout pendente — saldo insuficiente ou etiqueta precisa ser gerada manualmente',
      });
    }

    return res.json({
      ok: true,
      sandbox: isSandbox,
      order_id: orderId,
      etiqueta_url: `${baseUrl}/etiqueta/${orderId}`,
      valor_frete: cartData.price || 0,
    });

  } catch (err: any) {
    console.error('[GAPS] etiqueta-devolucao erro:', err);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/gaps/montador/gerar-maleta-auto
// Cria nova maleta_sessoes para a revendedora com token de 30 dias,
// copiando os produtos da maleta anterior (ajuste_perfil = true).
// ─────────────────────────────────────────────────────────
router.post('/montador/gerar-maleta-auto', requireGapsAuth, async (req: Request, res: Response) => {
  try {
    const { revendedora_id, maleta_anterior_id, tenant_id, ajuste_perfil } = req.body;

    if (!revendedora_id || !tenant_id) {
      return res.status(400).json({ error: 'revendedora_id e tenant_id sao obrigatorios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Gera token unico
      const tokenRes = await client.query(`SELECT md5(random()::text || clock_timestamp()::text) AS token`);
      const token = tokenRes.rows[0].token;

      // Busca numero sequencial da proxima maleta
      const numRes = await client.query(
        `SELECT COALESCE(MAX(numero_maleta), 0) + 1 AS proximo
         FROM maleta_sessoes
         WHERE revendedora_id = $1 AND tenant_id = $2`,
        [revendedora_id, tenant_id]
      );
      const numeroMaleta = numRes.rows[0].proximo;

      // Cria a nova sessao de maleta (validade 30 dias)
      const novaRes = await client.query(
        `INSERT INTO maleta_sessoes
           (token, revendedora_id, maleta_id, tenant_id, expires_at, status,
            numero_maleta, maleta_anterior_id, gerada_automaticamente)
         VALUES ($1, $2, gen_random_uuid(), $3, NOW() + INTERVAL '30 days',
                 'ativa', $4, $5, true)
         RETURNING id, token, maleta_id, numero_maleta, expires_at`,
        [
          token,
          revendedora_id,
          tenant_id,
          numeroMaleta,
          maleta_anterior_id || null,
        ]
      );

      const novaMaleta = novaRes.rows[0];

      // Se ajuste_perfil, copia itens da maleta anterior para a nova
      if (ajuste_perfil && maleta_anterior_id) {
        // Busca id da sessao anterior
        const sessaoAnteriorRes = await client.query(
          `SELECT id FROM maleta_sessoes WHERE id = $1 LIMIT 1`,
          [maleta_anterior_id]
        );

        if (sessaoAnteriorRes.rows.length > 0) {
          // Copia os maleta_items da sessao anterior para a nova
          await client.query(
            `INSERT INTO maleta_items
               (maleta_id, product_id, quantity, tenant_id, status)
             SELECT $1, product_id, quantity, tenant_id, 'ativo'
             FROM maleta_items
             WHERE maleta_id = $2
               AND status != 'devolvido'`,
            [novaMaleta.maleta_id, maleta_anterior_id]
          );
        }
      }

      await client.query('COMMIT');

      const appDomain = process.env.APP_DOMAIN || 'localhost:5001';
      return res.json({
        ok: true,
        maleta_id: novaMaleta.maleta_id,
        sessao_id: novaMaleta.id,
        token: novaMaleta.token,
        numero_maleta: novaMaleta.numero_maleta,
        expires_at: novaMaleta.expires_at,
        url_maleta: `https://${appDomain}/maleta/${tenant_id}/${novaMaleta.token}`,
      });

    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

  } catch (err: any) {
    console.error('[GAPS] gerar-maleta-auto erro:', err);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/gaps/expedicao/notificar-fila
// Registra/atualiza dados de expedicao na maleta_sessoes
// e retorna confirmacao. Usado pelo Auto: flow do n8n.
// ─────────────────────────────────────────────────────────
router.post('/expedicao/notificar-fila', requireGapsAuth, async (req: Request, res: Response) => {
  try {
    const {
      maleta_id,
      revendedora_id,
      tenant_id,
      etiqueta_url,
      rastreio,
      order_id_me,
      aviso,
    } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id obrigatorio' });
    }

    // Atualiza maleta_sessoes com dados de expedicao (se maleta_id informado)
    if (maleta_id) {
      await pool.query(
        `UPDATE maleta_sessoes
         SET etiqueta_url          = COALESCE($1, etiqueta_url),
             codigo_rastreio       = COALESCE($2, codigo_rastreio),
             melhorenvio_order_id  = COALESCE($3, melhorenvio_order_id),
             na_fila_em            = NOW(),
             updated_at            = NOW()
         WHERE id = $4 OR maleta_id = $4::uuid
           AND tenant_id = $5`,
        [etiqueta_url || null, rastreio || null, order_id_me || null, maleta_id, tenant_id]
      );
    }

    console.log(`[GAPS] expedicao/notificar-fila: maleta=${maleta_id} tenant=${tenant_id}${aviso ? ' AVISO: ' + aviso : ''}`);

    return res.json({
      ok: true,
      maleta_id: maleta_id || null,
      rastreio: rastreio || null,
      etiqueta_url: etiqueta_url || null,
      aviso: aviso || null,
    });

  } catch (err: any) {
    console.error('[GAPS] expedicao/notificar-fila erro:', err);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});


// ─────────────────────────────────────────────────────────
// GET /api/gaps/maleta-atual
// Retorna a maleta ativa da revendedora autenticada (via JWT Bearer)
// Resposta: { sessao: {...} | null, items: [...] }
// ─────────────────────────────────────────────────────────
router.get('/maleta-atual', async (req: Request, res: Response) => {
  try {
    // Extrai reseller_id e tenant_id do JWT Bearer
    const authHeader = req.headers.authorization || '';
    let resellerId: string | null = null;
    let tenantId: string | null = null;

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const jwt = await import('jsonwebtoken');
        const secret = getJwtSecret();
        const payload = jwt.default.verify(token, secret) as any;
        resellerId = payload.userId || payload.resellerId || null;  // FIX: JWT usa userId
        tenantId = payload.tenantId || null;
      } catch (_) {}
    }

    // Fallback: session
    if (!resellerId && (req as any).session?.resellerId) {
      resellerId = (req as any).session.resellerId;
      tenantId = (req as any).session.tenantId;
    }

    if (!resellerId) {
      return res.status(401).json({ error: 'Nao autenticado' });
    }

    // Busca sessao ativa em maleta_sessoes (status ativa/em_transito)
    // FIX: tenant_id e character varying, nao uuid — usar $2::text para evitar erro de cast
    // FIX: status inclui 'ativa' (nao apenas 'enviada')
    const sessaoRes = await pool.query(
      `SELECT * FROM maleta_sessoes
       WHERE revendedora_id = $1
         AND ($2::text IS NULL OR tenant_id = $2::text)
         AND status IN ('ativa', 'em_transito', 'enviada', 'montada')
       ORDER BY created_at DESC
       LIMIT 1`,
      [resellerId, tenantId]
    );
    let sessao = sessaoRes.rows[0] || null;

    // Fallback: buscar via tabela envios se nao encontrou em maleta_sessoes
    let envioId: string | null = sessao?.id || null;
    if (!sessao) {
      const envioRes = await pool.query(
        `SELECT e.id, e.revendedora_id, e.tenant_id, e.etiqueta_url, e.codigo_rastreio,
                e.status, e.created_at, e.nivel as nivel_maleta
         FROM envios e
         WHERE e.revendedora_id = $1
           AND ($2::text IS NULL OR e.tenant_id = $2::text)
           AND e.status IN ('montada', 'em_transito', 'ativa')
         ORDER BY e.created_at DESC
         LIMIT 1`,
        [resellerId, tenantId]
      );
      if (envioRes.rows[0]) {
        // Retornar envio como objeto sessao compativel com o frontend
        const envio = envioRes.rows[0];
        sessao = {
          id: envio.id,
          maleta_id: envio.id,
          revendedora_id: envio.revendedora_id,
          tenant_id: envio.tenant_id,
          etiqueta_url: envio.etiqueta_url,
          codigo_rastreio: envio.codigo_rastreio,
          status: 'ativa',
          nivel_maleta: envio.nivel_maleta,
          created_at: envio.created_at,
        };
        envioId = envio.id;
      }
    }

    if (!sessao) {
      return res.json({ sessao: null, items: [] });
    }

    // Busca itens da maleta via envio_id (coluna real) ou maleta_id como fallback
    // FIX: maleta_items usa envio_id, nao maleta_id
    const itemsRes = await pool.query(
      `SELECT mi.*,
              COALESCE(p.nome, p.description, p.descricao, mi.descricao_snapshot) as product_name,
              p.price,
              p.barcode,
              COALESCE(p.image, p.imagem_url) as image_url,
              p.category,
              p.preco_venda,
              p.reference
       FROM maleta_items mi
       LEFT JOIN products p ON p.id = mi.product_id
       WHERE (mi.envio_id = $1 OR mi.maleta_id = $1)
       ORDER BY mi.created_at ASC`,
      [envioId]
    );

    return res.json({
      sessao,
      items: itemsRes.rows,
    });

  } catch (err: any) {
    console.error('[GAPS] maleta-atual erro:', err);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

export default router;
