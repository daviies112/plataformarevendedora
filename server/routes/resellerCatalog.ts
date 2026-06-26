import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDynamicSupabaseClient } from '../lib/multiTenantSupabase';
import { supabaseOwner, SUPABASE_CONFIGURED } from '../config/supabaseOwner';

const router = express.Router();

// GET /api/reseller/products - Catalogo de produtos para revendedora
router.get('/products', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.session?.userRole !== 'reseller') {
      return res.status(403).json({ error: 'Acesso restrito a revendedoras' });
    }

    const tenantId = req.user?.tenantId || req.session?.tenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Sessao invalida' });
    }

    const client = await getDynamicSupabaseClient(tenantId);
    
    if (!client) {
      return res.status(500).json({
        error: 'Banco de dados nao configurado para este tenant',
        tenantId
      });
    }

    const { data, error } = await client
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar produtos:', error);
      return res.status(500).json({ error: 'Erro ao buscar produtos' });
    }

    res.json({
      success: true,
      products: data || [],
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('Erro no endpoint products:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/reseller/my-sales - Vendas da revendedora
router.get('/my-sales', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.session?.userRole !== 'reseller') {
      return res.status(403).json({ error: 'Acesso restrito a revendedoras' });
    }

    if (!SUPABASE_CONFIGURED || !supabaseOwner) {
      return res.status(503).json({ error: 'Sistema nao configurado' });
    }

    const revendedoraId = req.user?.userId || req.session?.userId;
    const adminId = req.user?.tenantId || req.session?.tenantId;

    // 🔐 VALIDAÇÃO: Garantir que temos IDs válidos para isolamento
    if (!revendedoraId || !adminId) {
      console.error('[NEXUS] Sessão inválida - revendedoraId ou adminId ausente');
      return res.status(401).json({ error: 'Sessão inválida - faça login novamente' });
    }

    // 🔐 ISOLAMENTO: Filtra por revendedora_id E admin_id para garantir que só veja vendas do seu tenant
    const { data, error } = await supabaseOwner
      .from('vendas_revendedora')
      .select('*')
      .eq('revendedora_id', revendedoraId)
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar vendas:', error);
      return res.status(500).json({ error: 'Erro ao buscar vendas' });
    }

    const vendas = data || [];
    const totalComissao = vendas.reduce((sum, v) => sum + Number(v.valor_comissao || 0), 0);
    const totalVendas = vendas.reduce((sum, v) => sum + Number(v.valor_total || 0), 0);

    res.json({
      success: true,
      vendas,
      resumo: {
        totalTransacoes: vendas.length,
        totalVendas,
        totalComissao,
        pendente: vendas.filter(v => v.status_pagamento === 'pendente').length
      }
    });
    
  } catch (error) {
    console.error('Erro no endpoint my-sales:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/reseller/dashboard-stats - Estatisticas do dashboard da revendedora
router.get('/dashboard-stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.session?.userRole !== 'reseller') {
      return res.status(403).json({ error: 'Acesso restrito a revendedoras' });
    }

    if (!SUPABASE_CONFIGURED || !supabaseOwner) {
      return res.status(503).json({ error: 'Sistema nao configurado' });
    }

    const revendedoraId = req.user?.userId || req.session?.userId;
    const adminId = req.user?.tenantId || req.session?.tenantId;

    // 🔐 VALIDAÇÃO: Garantir que temos IDs válidos para isolamento
    if (!revendedoraId || !adminId) {
      console.error('[NEXUS] Sessão inválida - revendedoraId ou adminId ausente');
      return res.status(401).json({ error: 'Sessão inválida - faça login novamente' });
    }

    // 🔐 ISOLAMENTO: Filtra por revendedora_id E admin_id para garantir isolamento de dados
    const { data: vendas } = await supabaseOwner
      .from('vendas_revendedora')
      .select('*')
      .eq('revendedora_id', revendedoraId)
      .eq('admin_id', adminId);

    const vendasList = vendas || [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Calcular metricas
    const vendasHoje = vendasList.filter(v => new Date(v.created_at) >= hoje);
    const totalComissaoHoje = vendasHoje.reduce((sum, v) => sum + Number(v.valor_comissao || 0), 0);
    const totalVendasHoje = vendasHoje.reduce((sum, v) => sum + Number(v.valor_total || 0), 0);

    const totalComissao = vendasList.reduce((sum, v) => sum + Number(v.valor_comissao || 0), 0);
    const totalVendas = vendasList.reduce((sum, v) => sum + Number(v.valor_total || 0), 0);

    const pendentes = vendasList.filter(v => v.status_pagamento === 'pendente');
    const comissaoPendente = pendentes.reduce((sum, v) => sum + Number(v.valor_comissao || 0), 0);

    res.json({
      success: true,
      stats: {
        hoje: {
          vendas: vendasHoje.length,
          valorTotal: totalVendasHoje,
          comissao: totalComissaoHoje
        },
        total: {
          vendas: vendasList.length,
          valorTotal: totalVendas,
          comissao: totalComissao
        },
        pendente: {
          vendas: pendentes.length,
          comissao: comissaoPendente
        }
      }
    });

  } catch (error) {
    console.error('Erro no endpoint dashboard-stats:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/reseller/create-sale - Criar venda (usado pelo checkout)
// 🔐 SEGURANÇA: O admin_id é derivado da revendedora, NÃO aceito do body para evitar injeção
router.post('/create-sale', async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED || !supabaseOwner) {
      return res.status(503).json({ error: 'Sistema nao configurado' });
    }

    const { 
      revendedoraId, 
      produtoId,
      produtoNome,
      valorTotal,
      valorComissao,
      valorEmpresa,
      clienteNome,
      clienteTelefone,
      paymentId, // New neutral name
      stripePaymentId, // Legacy: kept for backward compatibility with existing clients
      maletaItemId // Opcional: id do item da maleta sendo vendido
    } = req.body;

    if (!revendedoraId || !valorTotal) {
      return res.status(400).json({ error: 'Dados incompletos: revendedoraId e valorTotal são obrigatórios' });
    }

    const { data: revendedora, error: lookupError } = await supabaseOwner
      .from('revendedoras')
      .select('admin_id, comissao_padrao, tenant_id')
      .eq('id', revendedoraId)
      .single();

    if (lookupError || !revendedora) {
      console.error('[NEXUS] Revendedora não encontrada:', revendedoraId);
      return res.status(404).json({ error: 'Revendedora não encontrada' });
    }

    const adminIdVerificado = revendedora.admin_id;
    const tenantIdVerificado = revendedora.tenant_id;
    
    // Calcular comissão se não foi informada
    const comissaoCalculada = valorComissao ?? (valorTotal * (Number(revendedora.comissao_padrao) / 100));
    const empresaCalculada = valorEmpresa ?? (valorTotal - comissaoCalculada);

    const { data, error } = await supabaseOwner
      .from('vendas_revendedora')
      .insert({
        revendedora_id: revendedoraId,
        admin_id: adminIdVerificado, // 🔐 Derivado da revendedora, não do body
        tenant_id: tenantIdVerificado, // 🚀 MULTI-TENANT: Slug do tenant associado à revendedora
        produto_id: produtoId || null,
        produto_nome: produtoNome || null,
        valor_total: valorTotal,
        valor_comissao: comissaoCalculada,
        valor_empresa: empresaCalculada,
        status_pagamento: 'pendente',
        stripe_payment_id: paymentId || stripePaymentId || null, // Accepts both new and legacy field names
        cliente_nome: clienteNome || null,
        cliente_telefone: clienteTelefone || null,
        maleta_item_id: maletaItemId || null
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar venda:', error);
      return res.status(500).json({ error: 'Erro ao registrar venda' });
    }

    // 🚀 MALETA: Se veio maletaItemId, baixar o item da maleta (status = vendido)
    if (maletaItemId) {
      const { error: maletaUpdateError } = await supabaseOwner
        .from('maleta_items')
        .update({
          status: 'vendido',
          quantidade_vendida: 1,
          data_ultima_venda: new Date().toISOString(),
          vendido_por: revendedoraId
        })
        .eq('id', maletaItemId)
        .eq('tenant_id', tenantIdVerificado); // segurança: só atualiza do tenant correto
      if (maletaUpdateError) {
        console.warn('[NEXUS] Aviso: nao conseguiu baixar item da maleta:', maletaUpdateError.message);
      } else {
        console.log(`✅ [NEXUS] Item da maleta baixado: ${maletaItemId} -> vendido`);
      }
    }

    console.log(`✅ [NEXUS] Venda criada: revendedora=${revendedoraId}, admin=${adminIdVerificado}, valor=${valorTotal}`);

    res.json({
      success: true,
      venda: data,
      maletaItemBaixado: !!maletaItemId
    });

  } catch (error) {
    console.error('Erro ao criar venda:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;

// GET /api/reseller/maleta-items - Itens da maleta da revendedora (somente leitura, definido pelo admin)
router.get('/maleta-items', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.session?.userRole !== 'reseller') {
      return res.status(403).json({ error: 'Acesso restrito a revendedoras' });
    }

    const tenantId = req.user?.tenantId || req.session?.tenantId;
    const revendedoraId = req.user?.userId || req.session?.userId;

    if (!tenantId || !revendedoraId) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const client = await getDynamicSupabaseClient(tenantId);
    if (!client) {
      return res.status(500).json({ error: 'Banco de dados não configurado para este tenant' });
    }

    // Buscar itens da maleta mais recente desta revendedora
    const { data: maletaItems, error: maletaError } = await client
      .from('maleta_items')
      .select('*')
      .eq('revendedora_id', revendedoraId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (maletaError) {
      console.error('[maleta-items] Erro ao buscar itens:', maletaError);
      return res.status(500).json({ error: 'Erro ao buscar itens da maleta' });
    }

    // Se tiver itens, buscar dados completos dos produtos
    const items = maletaItems || [];
    if (items.length === 0) {
      return res.json({ success: true, items: [], produtos: [] });
    }

    // Campo no banco e product_id (nao produto_id)
    const produtoIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))];
    const { data: produtos } = await client
      .from('products')
      .select('*')
      .in('id', produtoIds);

    const produtosMap: Record<string, any> = {};
    (produtos || []).forEach((p: any) => { produtosMap[p.id] = p; });

    const itemsComProduto = items.map((item: any) => {
      const prod = produtosMap[item.product_id] || null;
      return {
        ...item,
        // Aliases para compatibilidade com o frontend (que usa produto_id, produto_nome, etc)
        produto_id: item.product_id,
        produto_nome: item.descricao_snapshot || prod?.description || prod?.nome || '',
        preco_unitario: item.preco_snapshot || item.preco_atual_referencia || prod?.price || 0,
        quantidade: item.quantidade_enviada || 1,
        categoria: prod?.category || '',
        produto: prod,
      };
    });

    // Buscar sessao ativa da revendedora para o frontend ter maletaSessao.id
    let sessao = null;
    try {
      const { data: sessaoData } = await client
        .from('maleta_sessoes')
        .select('id, status, etiqueta_url, codigo_rastreio, token, created_at, revendedora_id')
        .eq('revendedora_id', revendedoraId)
        .eq('tenant_id', tenantId)
        .in('status', ['ativa', 'enviada', 'na_fila_expedicao'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sessao = sessaoData || null;
    } catch (sErr: any) {
      console.warn('[maleta-items] sessao fetch nao critico:', sErr.message);
    }

    res.json({ success: true, items: itemsComProduto, total: items.length, sessao });

  } catch (error) {
    console.error('[maleta-items] Erro interno:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});
