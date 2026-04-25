import { Router, Request, Response } from 'express';
import { getMasterClient } from '../lib/masterSyncService';

const router = Router();

// GET /api/assinatura/contracts/:token/full
// Busca contrato pelo access_token (ultimo segmento da URL publica /assinar/slug/token)
router.get('/contracts/:token/full', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token nao informado' });

    const supabase = getMasterClient();

    // Tenta buscar pelo access_token
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('access_token', token)
      .maybeSingle();

    if (error) {
      console.error('[Assinatura] Erro ao buscar contrato:', error.message);
      return res.status(500).json({ error: 'Erro interno ao buscar contrato' });
    }

    if (!data) {
      // Tenta pelo id como fallback
      const { data: byId, error: idErr } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', token)
        .maybeSingle();

      if (idErr || !byId) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }
      return res.json({ contract: byId });
    }

    return res.json({ contract: data });
  } catch (err: any) {
    console.error('[Assinatura] Excecao:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/assinatura/public/contracts/:id/finalize
// Finaliza assinatura (rota publica - sem auth)
router.post('/public/contracts/:id/finalize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { selfie_photo, document_photo, signed_contract_html, status } = req.body;

    if (!id) return res.status(400).json({ error: 'ID nao informado' });

    const supabase = getMasterClient();

    // Verifica se contrato existe
    const { data: existing, error: fetchErr } = await supabase
      .from('contracts')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[Assinatura] Erro ao buscar contrato para finalize:', fetchErr.message);
      return res.status(500).json({ error: 'Erro interno' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Contrato nao encontrado' });
    }

    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status: status || 'signed',
      signed_at: now,
      updated_at: now,
    };

    if (signed_contract_html) updatePayload.signed_contract_html = signed_contract_html;
    if (selfie_photo) updatePayload.selfie_photo = selfie_photo;
    if (document_photo) updatePayload.document_photo = document_photo;

    const { data: updated, error: updateErr } = await supabase
      .from('contracts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error('[Assinatura] Erro ao atualizar contrato:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao salvar assinatura' });
    }

    console.log('[Assinatura] Contrato finalizado:', id);
    return res.json({ success: true, contract: updated });
  } catch (err: any) {
    console.error('[Assinatura] Excecao no finalize:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
