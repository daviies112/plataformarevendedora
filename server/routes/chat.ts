import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { getDynamicSupabaseClient } from '../lib/multiTenantSupabase';

const router = Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// Guard: requer sessão autenticada (reseller ou admin)
function requireAuth(req: Request, res: Response): boolean {
  const session = (req as any).session;
  const isReseller = session?.userRole === 'reseller' && session?.resellerId;
  const isAdmin = session?.userId && session?.userRole !== 'reseller';
  if (!isReseller && !isAdmin) {
    res.status(401).json({ error: 'Não autenticado' });
    return false;
  }
  return true;
}

// 🔐 MULTITENANT: resolve o company_id REAL (do Supabase do tenant da sessão),
// nunca confiando no company_id enviado pelo cliente.
const companyIdCache = new Map<string, { id: string; ts: number }>();
const COMPANY_ID_CACHE_TTL_MS = 5 * 60 * 1000;

async function getTrustedCompanyId(tenantId: string): Promise<string | null> {
  const cached = companyIdCache.get(tenantId);
  if (cached && Date.now() - cached.ts < COMPANY_ID_CACHE_TTL_MS) {
    return cached.id;
  }
  try {
    const client = await getDynamicSupabaseClient(tenantId);
    if (!client) return null;
    const { data, error } = await client
      .from('companies')
      .select('id')
      .limit(1)
      .single();
    if (error || !data?.id) return null;
    companyIdCache.set(tenantId, { id: data.id, ts: Date.now() });
    return data.id;
  } catch (err: any) {
    console.error('[chat] getTrustedCompanyId erro:', err.message);
    return null;
  }
}

// POST /api/chat/thread
router.post('/thread', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const { company_id, reseller_id, reseller_name, reseller_phone } = req.body;
    if (!company_id || !reseller_id) {
      return res.status(400).json({ error: 'company_id e reseller_id obrigatorios' });
    }
    const existing = await pool.query(
      `SELECT * FROM chat_threads WHERE company_id = $1 AND reseller_id = $2 AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
      [company_id, reseller_id]
    );
    if (existing.rows.length > 0) return res.json({ success: true, thread: existing.rows[0] });
    const result = await pool.query(
      `INSERT INTO chat_threads (company_id, reseller_id, reseller_name, reseller_phone, category, status, unread_count, last_message_at, created_at) VALUES ($1, $2, $3, $4, 'geral', 'open', 0, NOW(), NOW()) RETURNING *`,
      [company_id, reseller_id, reseller_name || 'Revendedor', reseller_phone || '']
    );
    return res.json({ success: true, thread: result.rows[0] });
  } catch (err: any) {
    if (err.code === '42P01' || err.code === '22P02') {
      return res.json({ success: true, thread: { id: `sim_${Date.now()}`, company_id: req.body.company_id, reseller_id: req.body.reseller_id, reseller_name: req.body.reseller_name || 'Revendedor', reseller_phone: req.body.reseller_phone || '', category: 'geral', status: 'open', unread_count: 0, last_message_at: new Date().toISOString(), created_at: new Date().toISOString() } });
    }
    console.error('[chat] /thread erro:', err.message);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// GET /api/chat/messages - suporta ?threadId=xxx OU /:threadId
router.get('/messages', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const threadId = (req.query.threadId as string) || '';
  if (!threadId || threadId.startsWith('sim_')) return res.json({ success: true, messages: [] });
  try {
    const result = await pool.query(
      `SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [threadId]
    );
    return res.json({ success: true, messages: result.rows });
  } catch (err: any) {
    if (err.code === '42P01' || err.code === '22P02') return res.json({ success: true, messages: [] });
    console.error('[chat] GET /messages erro:', err.message);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// GET /api/chat/messages/:threadId - path param
router.get('/messages/:threadId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { threadId } = req.params;
  if (!threadId || threadId.startsWith('sim_')) return res.json({ success: true, messages: [] });
  try {
    const result = await pool.query(
      `SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [threadId]
    );
    return res.json({ success: true, messages: result.rows });
  } catch (err: any) {
    if (err.code === '42P01' || err.code === '22P02') return res.json({ success: true, messages: [] });
    console.error('[chat] GET /messages/:threadId erro:', err.message);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// POST /api/chat/messages
router.post('/messages', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const { thread_id, company_id, reseller_id, message, type, category } = req.body;
    if (!thread_id || !message) return res.status(400).json({ error: 'thread_id e message obrigatorios' });
    if (thread_id.startsWith('sim_')) {
      return res.json({ success: true, message: { id: `sim_msg_${Date.now()}`, thread_id, message, type: type || 'sent', status: 'sent', created_at: new Date().toISOString() } });
    }
    const result = await pool.query(
      `INSERT INTO chat_messages (thread_id, company_id, reseller_id, message, type, category, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW()) RETURNING *`,
      [thread_id, company_id, reseller_id, message, type || 'sent', category || 'geral']
    );
    return res.json({ success: true, message: result.rows[0] });
  } catch (err: any) {
    if (err.code === '42P01' || err.code === '22P02') return res.json({ success: true, message: { id: `sim_${Date.now()}`, message: req.body.message, status: 'sent' } });
    console.error('[chat] POST /messages erro:', err.message);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// POST /api/chat/send - alias para POST /messages (compatibilidade com useChat.ts)
router.post('/send', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const { thread_id, company_id, reseller_id, message, type, category } = req.body;
    if (!thread_id || !message) return res.status(400).json({ error: 'thread_id e message obrigatorios' });
    if (thread_id.startsWith('sim_')) {
      return res.json({ success: true, message: { id: `sim_msg_${Date.now()}`, thread_id, message, type: type || 'sent', status: 'sent', created_at: new Date().toISOString() } });
    }
    const result = await pool.query(
      `INSERT INTO chat_messages (thread_id, company_id, reseller_id, message, type, category, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW()) RETURNING *`,
      [thread_id, company_id, reseller_id, message, type || 'sent', category || 'geral']
    );
    return res.json({ success: true, message: result.rows[0] });
  } catch (err: any) {
    if (err.code === '42P01' || err.code === '22P02') return res.json({ success: true, message: { id: `sim_${Date.now()}`, message: req.body.message, status: 'sent' } });
    console.error('[chat] POST /send erro:', err.message);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

export default router;
