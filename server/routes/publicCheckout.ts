import { Router, Request, Response } from 'express';
import { Pool as PgPool } from 'pg';
import { AsaasService, AsaasSplit } from '../services/asaas';
import { createClient } from '@supabase/supabase-js';
import { calculateResellerCommission, CommissionResult } from '../services/commission';

const router = Router();

// --- Supabase helper (usa env vars, igual ao publicStore.ts) ---
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_MASTER_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_OWNER_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// --- Pool dedicado para maleta_items/maletas (banco da plataformacompleta em 172.19.0.12) ---
const storePool = new PgPool({
  connectionString: process.env.STORE_DB_URL || 'postgresql://postgres:your-super-secret-and-long-postgres-password@172.19.0.12:5432/postgres?sslmode=disable',
  connectionTimeoutMillis: 8000,
  max: 5,
});

// --- Asaas service (usa env var ASAAS_API_KEY ou tabela payment_providers) ---
async function getAsaasService(): Promise<AsaasService> {
  // Tenta primeiro a tabela payment_providers no Supabase
  try {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('payment_providers').select('asaas_api_key').eq('ativo', true).limit(1).single();
      if (data?.asaas_api_key) return new AsaasService(data.asaas_api_key);
    }
  } catch (_) {}
  // Fallback para env var
  return new AsaasService(process.env.ASAAS_API_KEY);
}

// --- Busca reseller_id pelo storeId (UUID store_slug ou reseller_id direto) ---
async function resolveResellerId(storeId: string): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    if (sb) {
      // Tenta por store_slug
      const { data: bySlug } = await sb.from('reseller_stores').select('reseller_id').eq('store_slug', storeId).single();
      if (bySlug?.reseller_id) return bySlug.reseller_id;
      // Tenta por reseller_id direto
      const { data: byId } = await sb.from('reseller_stores').select('reseller_id').eq('reseller_id', storeId).single();
      if (byId?.reseller_id) return byId.reseller_id;
      // Tenta como UUID direto de revendedoras
      const { data: rev } = await sb.from('revendedoras').select('id').eq('id', storeId).single();
      if (rev?.id) return rev.id;
    }
    // Tenta pelo id direto da tabela reseller_stores no PostgreSQL local (storePool)
    try {
      const pgStore = await storePool.query(
        'SELECT reseller_id FROM reseller_stores WHERE id = $1::uuid LIMIT 1',
        [storeId]
      );
      if (pgStore.rows.length > 0 && pgStore.rows[0].reseller_id) {
        console.log('[Checkout 5002] storeId resolvido via reseller_stores PG:', pgStore.rows[0].reseller_id);
        return pgStore.rows[0].reseller_id;
      }
    } catch (pgErr: any) {
      console.log('[Checkout 5002] reseller_stores PG lookup error:', pgErr.message);
    }
    // Fallback final: storeId como UUID direto de revendedora (maleta_items.revendedora_id)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(storeId)) {
      // Verifica se existe algum item de maleta com este revendedora_id
      const check = await storePool.query(
        'SELECT revendedora_id FROM maleta_items WHERE revendedora_id = $1 LIMIT 1',
        [storeId]
      );
      if (check.rows.length > 0) {
        console.log('[Checkout 5002] storeId tratado como revendedora_id direto:', storeId);
        return storeId;
      }
    }
    return null;
  } catch (err: any) {
    console.error('[Checkout 5002] resolveResellerId error:', err.message);
    return null;
  }
}

// --- Valida produto: busca no PostgreSQL (store_products) e Supabase (products) ---
async function validateProduct(storeId: string, productId: string, quantity: number) {
  try {
    const resellerId = await resolveResellerId(storeId);
    if (!resellerId) return { valid: false, error: 'Loja não encontrada' };

    // Verifica se o produto está na maleta da revendedora (PostgreSQL)
    const bagResult = await storePool.query(
      `SELECT product_id FROM maleta_items
       WHERE revendedora_id = $1
         AND product_id = $2::uuid
         AND status NOT IN ('devolvido', 'perdido', 'ausente')
       LIMIT 1`,
      [resellerId, productId]
    );

    // Se não está na maleta, verifica se está nos product_ids do Supabase
    if (bagResult.rows.length === 0) {
      const sb = getSupabaseClient();
      if (sb) {
        const { data: store } = await sb.from('reseller_stores').select('product_ids').eq('reseller_id', resellerId).single();
        if (!store?.product_ids?.includes(productId)) {
          return { valid: false, error: 'Produto não encontrado na loja desta revendedora' };
        }
      } else {
        return { valid: false, error: 'Produto não está na maleta desta revendedora' };
      }
    }

    // Busca dados do produto: primeiro em store_products (PostgreSQL), fallback em products (Supabase)
    let product: any = null;
    try {
      const prodResult = await storePool.query(
        `SELECT id, name AS description, price, sku AS reference, stock_quantity AS stock
         FROM store_products WHERE id = $1::uuid LIMIT 1`,
        [productId]
      );
      if (prodResult.rows.length > 0) product = prodResult.rows[0];
    } catch (pgErr: any) { console.log('[Checkout 5002] store_products query error:', pgErr.message); }

    if (!product) {
      const sb = getSupabaseClient();
      if (sb) {
        const { data: supaProduct } = await sb.from('products').select('id, description, price').eq('id', productId).single();
        if (supaProduct) product = supaProduct;
      }
    }

    if (!product) return { valid: false, error: 'Produto não encontrado' };

    const serverAmount = Math.round(Number(product.price) * 100 * quantity);
    console.log(`[Checkout 5002] Produto validado: ${product.description}, R$${product.price}, resellerId: ${resellerId}`);
    return { valid: true, product: { ...product, name: product.description }, serverAmount, resellerId };
  } catch (err: any) {
    console.error('[Checkout 5002] validateProduct error:', err.message);
    return { valid: false, error: 'Erro ao validar produto' };
  }
}

// --- Split Asaas baseado na comissão da revendedora ---
async function buildSplit(resellerId: string, totalAmountCents?: number) {
  try {
    const commission = await calculateResellerCommission(resellerId);
    const sb = getSupabaseClient();
    if (!sb) return { split: null, commission };
    const { data: rev } = await sb.from('revendedoras').select('asaas_wallet_id').eq('id', resellerId).single();
    if (!rev?.asaas_wallet_id) {
      console.log('[Split 5002] Revendedora sem asaas_wallet_id - split desabilitado');
      return { split: null, commission };
    }
    // Calcular fixedValue em reais (Asaas walletId requer fixedValue, nao percentualValue)
    // Guard: se commission.resellerPercentage vier undefined (config Supabase mal formatada), usar 65% padrao
    const resellerPct = (typeof commission.resellerPercentage === 'number' && !isNaN(commission.resellerPercentage))
      ? commission.resellerPercentage : 65;
    let split: AsaasSplit[] | null = null;
    if (totalAmountCents && totalAmountCents > 0) {
      const resellerAmountReais = parseFloat(((totalAmountCents * resellerPct / 100) / 100).toFixed(2));
      split = [{ walletId: rev.asaas_wallet_id, fixedValue: resellerAmountReais }];
      console.log(`[Split 5002] ${commission.tierName ?? 'Iniciante'} ${resellerPct}% | wallet: ${rev.asaas_wallet_id} | fixedValue: R$${resellerAmountReais}`);
    } else {
      // fallback: percentualValue se nao tiver o total (Asaas pode rejeitar, mas tentamos)
      split = [{ walletId: rev.asaas_wallet_id, percentualValue: resellerPct }];
      console.log(`[Split 5002] ${commission.tierName ?? 'Iniciante'} ${resellerPct}% (percentual) | wallet: ${rev.asaas_wallet_id}`);
    }
    return { split, commission };
  } catch (err: any) {
    console.error('[Split 5002] buildSplit error:', err.message);
    return { split: null, commission: null };
  }
}

// --- Salva venda no Supabase ---
async function saveSale(data: {
  productId: string; resellerId: string; paymentMethod: string;
  totalAmount: number; quantity: number;
  customerName?: string; customerEmail?: string; customerDocument?: string;
  asaasPaymentId: string; status: string; commission?: CommissionResult | null;
}) {
  try {
    const sb = getSupabaseClient();
    if (!sb) return;
    const amountReais = data.totalAmount / 100;
    const pct = data.commission?.resellerPercentage ?? 70;
    const paidStatuses = ['CONFIRMED', 'RECEIVED', 'paid'];
    const isPaid = paidStatuses.includes(data.status);
    // 🔐 MULTITENANT: buscar tenant_id da revendedora para isolar a venda
    let tenantId: string | null = null;
    try {
      const { data: rev } = await sb.from('revendedoras').select('tenant_id').eq('id', data.resellerId).single();
      tenantId = rev?.tenant_id || null;
    } catch (_) {}
    await sb.from('sales_with_split').insert({
      product_id: data.productId, reseller_id: data.resellerId,
      payment_method: data.paymentMethod, status: isPaid ? 'confirmada' : 'aguardando_pagamento',
      total_amount: amountReais, reseller_amount: amountReais * (pct / 100),
      company_amount: amountReais * ((100 - pct) / 100), commission_percentage: pct,
      quantity: data.quantity, paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null,
      pagarme_order_id: data.asaasPaymentId, pagarme_charge_id: data.asaasPaymentId,
      customer_name: data.customerName, customer_email: data.customerEmail,
      customer_document: data.customerDocument, created_at: new Date().toISOString(),
      tenant_id: tenantId,
    });
    console.log(`[Checkout 5002] Venda salva: ${data.asaasPaymentId}`);
  } catch (err: any) {
    console.error('[Checkout 5002] saveSale error:', err.message);
  }
}

// --- Validação de cliente ---
function validateCustomer(c: any): string | null {
  if (!c?.name || c.name.trim().length < 2) return 'Nome do cliente obrigatório (mín. 2 caracteres)';
  if (!c?.email || !c.email.includes('@')) return 'Email do cliente inválido';
  if (!c?.document) return 'CPF do cliente obrigatório';
  const cpf = c.document.replace(/\D/g, '');
  if (cpf.length !== 11 && cpf.length !== 14) return 'CPF/CNPJ inválido';
  if (!c?.phone) return 'Telefone do cliente obrigatório';
  const tel = c.phone.replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) return 'Telefone inválido (DDD + número)';
  return null;
}

// ===== POST /pix =====
router.post('/pix', async (req: Request, res: Response) => {
  try {
    const { customer, items, storeId, productId, quantity } = req.body;
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' }) as any;
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' }) as any;
    const custErr = validateCustomer(customer);
    if (custErr) return res.status(400).json({ error: custErr }) as any;
    if (!items?.length) return res.status(400).json({ error: 'items obrigatório' }) as any;

    const pv = await validateProduct(storeId, productId, quantity || 1);
    if (!pv.valid) return res.status(400).json({ error: pv.error }) as any;

    const clientAmount = items.reduce((s: number, i: any) => s + (i.amount * (i.quantity || 1)), 0);
    if (clientAmount !== pv.serverAmount) {
      return res.status(400).json({ error: 'Valor do produto não confere. Atualize a página e tente novamente.' }) as any;
    }

    const { split, commission } = await buildSplit(pv.resellerId!, pv.serverAmount);
    const svc = await getAsaasService();
    const customerId = await svc.getOrCreateCustomer(customer.name, customer.document, customer.email);
    const dueDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const valueReais = pv.serverAmount! / 100;
    const payment = await svc.createPixPayment({
      customerId, value: valueReais, dueDate,
      description: pv.product!.name || 'Compra na loja',
      externalReference: `STORE_${storeId}_${productId}`,
      split: split || undefined,
    });
    const qr = await svc.getPixQrCode(payment.id);
    console.log(`[Checkout 5002] PIX criado: ${payment.id}`);

    await saveSale({ productId, resellerId: pv.resellerId!, paymentMethod: 'pix',
      totalAmount: pv.serverAmount!, quantity: quantity || 1,
      customerName: customer.name, customerEmail: customer.email, customerDocument: customer.document,
      asaasPaymentId: payment.id, status: payment.status, commission });

    return res.json({
      success: true, orderId: payment.id, orderCode: payment.id,
      status: payment.status, chargeId: payment.id, chargeStatus: payment.status,
      pix: { qrCode: qr.payload, qrCodeUrl: qr.encodedImage, expiresAt: qr.expirationDate },
      amount: pv.serverAmount, createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Checkout 5002] PIX error:', err.message);
    return res.status(500).json({ error: err.message || 'Erro ao criar PIX' });
  }
});

// ===== POST /tokenize =====
router.post('/tokenize', async (req: Request, res: Response) => {
  try {
    const { card } = req.body;
    if (!card) return res.status(400).json({ error: 'Dados do cartão obrigatórios' }) as any;
    const num = card.number?.replace(/\D/g, '');
    if (!num || num.length < 13 || num.length > 19) return res.status(400).json({ error: 'Número do cartão inválido' }) as any;
    if (!card.holder_name?.trim() || card.holder_name.trim().length < 2) return res.status(400).json({ error: 'Nome do titular obrigatório' }) as any;
    if (!card.exp_month || card.exp_month < 1 || card.exp_month > 12) return res.status(400).json({ error: 'Mês de validade inválido' }) as any;
    const yr = new Date().getFullYear();
    if (!card.exp_year || card.exp_year < yr || card.exp_year > yr + 20) return res.status(400).json({ error: 'Ano de validade inválido' }) as any;
    const cvv = card.cvv?.replace(/\D/g, '');
    if (!cvv || cvv.length < 3 || cvv.length > 4) return res.status(400).json({ error: 'CVV inválido' }) as any;

    const svc = await getAsaasService();
    const customerId = await svc.getOrCreateCustomer('Titular', card.holder_document || '00000000000', undefined);
    const result = await svc.tokenizeCreditCard({
      customerId, holderName: card.holder_name.trim(), number: num,
      expiryMonth: String(card.exp_month).padStart(2, '0'),
      expiryYear: String(card.exp_year), ccv: cvv,
      remoteIp: req.ip || '127.0.0.1',
      cpfCnpj: card.holder_document,
      email: card.holder_email,
      phone: card.holder_phone,
      postalCode: card.holder_postal_code,
      addressNumber: card.holder_address_number,
    });
    console.log('[Checkout 5002] Cartão tokenizado');
    return res.json({ success: true, tokenId: result.creditCardToken, type: 'card' });
  } catch (err: any) {
    console.error('[Checkout 5002] Tokenize error:', err.message);
    return res.status(500).json({ error: err.message || 'Erro ao tokenizar cartão' });
  }
});

// ===== POST /card =====
router.post('/card', async (req: Request, res: Response) => {
  try {
    const { customer, items, cardToken, installments, storeId, productId, quantity } = req.body;
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' }) as any;
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' }) as any;
    if (!cardToken) return res.status(400).json({ error: 'cardToken obrigatório' }) as any;
    const custErr = validateCustomer(customer);
    if (custErr) return res.status(400).json({ error: custErr }) as any;
    if (!items?.length) return res.status(400).json({ error: 'items obrigatório' }) as any;

    const pv = await validateProduct(storeId, productId, quantity || 1);
    if (!pv.valid) return res.status(400).json({ error: pv.error }) as any;

    const clientAmount = items.reduce((s: number, i: any) => s + (i.amount * (i.quantity || 1)), 0);
    if (clientAmount !== pv.serverAmount) {
      return res.status(400).json({ error: 'Valor do produto não confere. Atualize a página e tente novamente.' }) as any;
    }

    const { split, commission } = await buildSplit(pv.resellerId!, pv.serverAmount);
    const svc = await getAsaasService();
    const customerId = await svc.getOrCreateCustomer(customer.name, customer.document, customer.email);
    const dueDate = new Date().toISOString().split('T')[0];
    const valueReais = pv.serverAmount! / 100;
    const payment = await svc.createCreditCardPayment({
      customerId, value: valueReais, dueDate,
      description: pv.product!.name || 'Compra na loja',
      externalReference: `STORE_${storeId}_${productId}`,
      creditCardToken: cardToken,
      installmentCount: installments || 1,
      split: split || undefined,
    });
    console.log(`[Checkout 5002] Cartão criado: ${payment.id}, status: ${payment.status}`);

    await saveSale({ productId, resellerId: pv.resellerId!, paymentMethod: 'cartao',
      totalAmount: pv.serverAmount!, quantity: quantity || 1,
      customerName: customer.name, customerEmail: customer.email, customerDocument: customer.document,
      asaasPaymentId: payment.id, status: payment.status, commission });

    const paidStatuses = ['CONFIRMED', 'RECEIVED'];
    return res.json({
      success: true, paymentSuccess: paidStatuses.includes(payment.status),
      orderId: payment.id, orderCode: payment.id,
      status: payment.status, chargeId: payment.id, chargeStatus: payment.status,
      amount: pv.serverAmount, createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Checkout 5002] Card error:', err.message);
    return res.status(500).json({ error: err.message || 'Erro ao processar cartão' });
  }
});

// ===== GET /status/:orderId =====
router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    if (!orderId || orderId.length < 5) return res.status(400).json({ error: 'orderId inválido' }) as any;
    const svc = await getAsaasService();
    const payment = await svc.getPayment(orderId);
    return res.json({
      success: true,
      order: {
        id: payment.id, code: payment.id, status: payment.status,
        amount: Math.round((payment.value || 0) * 100),
        charges: [{ id: payment.id, status: payment.status, paymentMethod: payment.billingType, amount: Math.round((payment.value || 0) * 100) }],
        createdAt: payment.dateCreated,
      },
    });
  } catch (err: any) {
    console.error('[Checkout 5002] Status error:', err.message);
    return res.status(500).json({ error: err.message || 'Erro ao buscar pedido' });
  }
});

export default router;
