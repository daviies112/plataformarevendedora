/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  MEETING ROUTES - INCLUDES PERFORMANCE-CRITICAL PUBLIC ENDPOINTS          ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  PUBLIC ENDPOINTS WITH CACHING (do not remove cache!):                    ║
 * ║  - GET /:meetingId/public - Meeting data with 2 min cache                 ║
 * ║  - GET /:meetingId/room-design-public - Room design with 2 min cache      ║
 * ║  - GET /:meetingId/full-public - Combined endpoint (1 request vs 2)       ║
 * ║                                                                           ║
 * ║  Cache functions from publicCache.ts:                                     ║
 * ║  - getCachedMeeting / setCachedMeeting                                    ║
 * ║  - getCachedRoomDesign / setCachedRoomDesign                              ║
 * ║  - getCachedMeetingFull / setCachedMeetingFull                            ║
 * ║                                                                           ║
 * ║  📖 Documentation: docs/PUBLIC_FORM_PERFORMANCE_FIX.md                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { db } from "../db";
import { reunioes, gravacoes, hms100msConfig, formSubmissions, leads, meetingTenants } from "../../shared/db-schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { decrypt } from "../lib/credentialsManager";
import { gerarTokenParticipante, criarSala, obterSala, iniciarGravacao, pararGravacao, obterGravacao, listarGravacoesSala, obterUrlPresignadaAsset } from "../services/meetings/hms100ms";
import { getClientSupabaseClient, getClientSupabaseClientStrict } from "../lib/multiTenantSupabase";
import { getJwtSecret } from '../config/jwtSecret';
import { nanoid } from "nanoid";
import { z } from "zod";
import { cache } from "../lib/cache";
import { getCachedMeeting, setCachedMeeting, getCachedRoomDesign, setCachedRoomDesign, getCachedMeetingFull, setCachedMeetingFull, invalidateAllMeetingDesignCaches } from "../lib/publicCache";
import { getCompanySlug } from '../lib/tenantSlug';
import fs from 'fs';
import { startBotRecording, stopBotRecording, transcribeRecording } from '../services/recorder';

export const meetingsRouter = Router();
export const publicRoomDesignRouter = Router();

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Helper function to sync recording to Supabase
async function syncRecordingToSupabase(tenantId: string, recording: any) {
  try {
    const supabase = await getClientSupabaseClient(tenantId);
    if (!supabase) {
      console.log(`[Recording Sync] Supabase não configurado para tenant ${tenantId} - gravação apenas local`);
      return;
    }

    const toISOString = (date: Date | string | null | undefined): string | null => {
      if (!date) return null;
      if (date instanceof Date) return date.toISOString();
      if (typeof date === 'string') return date;
      return null;
    };

    const { error } = await supabase
      .from('gravacoes')
      .upsert({
        id: recording.id,
        reuniao_id: recording.reuniaoId,
        tenant_id: recording.tenantId,
        room_id_100ms: recording.roomId100ms || null,
        session_id_100ms: recording.sessionId100ms || null,
        recording_id_100ms: recording.recordingId100ms || null,
        asset_id: recording.assetId || null,
        status: recording.status || 'recording',
        started_at: toISOString(recording.startedAt),
        stopped_at: toISOString(recording.stoppedAt),
        duration: recording.duration || null,
        file_url: recording.fileUrl || null,
        file_size: recording.fileSize || null,
        thumbnail_url: recording.thumbnailUrl || null,
        metadata: recording.metadata ? JSON.parse(JSON.stringify(recording.metadata)) : {},
        created_at: toISOString(recording.createdAt),
        updated_at: toISOString(recording.updatedAt),
      }, { onConflict: 'id' });

    if (error) {
      console.error(`[Recording Sync] Erro ao sincronizar gravação ${recording.id} com Supabase:`, error);
    }
  } catch (err) {
    console.error(`[Recording Sync] Erro inesperado ao sincronizar gravação:`, err);
  }
}

// ===========================================
// PUBLIC ROUTES - Participant Data by participant_id
// ===========================================

// FIX: New endpoint for PublicMeetingRoom.tsx - handles /api/reunioes/public/:companySlug/:roomId
// This returns the full expected structure: { reuniao, tenant, designConfig, roomDesignConfig }
publicRoomDesignRouter.get('/reunioes/public/:companySlug/:roomId', async (req: Request, res: Response) => {
  try {
    const { companySlug, roomId } = req.params;
    const fsid = req.query.fsid as string | undefined;

    console.log(`[PublicMeetingRoom API] Buscando sala - companySlug: ${companySlug}, roomId: ${roomId}, fsid: ${fsid || 'nenhum'}`);

    if (!companySlug || !roomId) {
      return res.status(400).json({ error: 'Company slug e room ID são obrigatórios' });
    }

    // Find meeting by roomId (can be the meeting ID or roomId100ms)
    let [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, roomId as string),
        eq(reunioes.roomId100ms, roomId as string)
      ))
      .limit(1);

    if (!meeting) {
      console.log(`🔍 [PublicMeetingRoom] Tentando fallback para meetingId: ${roomId}`);
      const { pool } = await import('../db');
      const tenantResults = await pool.query('SELECT tenant_id FROM supabase_config');
      const tenants = tenantResults.rows.map((r: any) => r.tenant_id);
      const allTenants = Array.from(new Set([...tenants, 'system', 'local', 'supabase_local']));

      for (const tId of allTenants) {
        try {
          const supabase = await getClientSupabaseClient(tId);
          if (!supabase) continue;
          const { data, error } = await supabase.from('reunioes')
            .select('*').or(`id.eq.${roomId},room_id_100ms.eq.${roomId}`).maybeSingle();
          if (!error && data) {
            meeting = {
              id: data.id, tenantId: tId, titulo: data.titulo,
              roomId100ms: data.room_id_100ms,
              metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata || {}),
              status: data.status, nome: data.nome, email: data.email
            } as any;
            break;
          }
        } catch (e) {}
      }
    }

    if (!meeting) {
      console.log(`[PublicMeetingRoom API] Reunião não encontrada: ${roomId}`);
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    // Find tenant by slug - usa Supabase do tenant (meeting_tenants nao existe no banco principal)
    let tenant = null;
    try {
      const supabaseTenant = await getClientSupabaseClient(meeting.tenantId);
      if (supabaseTenant) {
        const { data: tenantData } = await supabaseTenant.from('tenants')
          .select('id, nome, slug, logo_url, configuracoes')
          .eq('id', meeting.tenantId)
          .maybeSingle();
        if (tenantData) {
          tenant = {
            id: tenantData.id,
            nome: tenantData.nome || tenantData.name || companySlug,
            slug: tenantData.slug || companySlug,
            logoUrl: tenantData.logo_url || null,
            configuracoes: tenantData.configuracoes || {},
            roomDesignConfig: null
          };
        }
      }
    } catch (tenantErr) {
      console.warn('[PublicMeetingRoom API] Nao foi possivel buscar tenant, usando fallback:', tenantErr);
    }

    // Get design config from hms100msConfig (CRITICAL for room design)
    let roomDesignConfig = null;
    let designConfig = null;

    if (meeting.tenantId) {
      const [config] = await db.select().from(hms100msConfig)
        .where(eq(hms100msConfig.tenantId, meeting.tenantId))
        .limit(1);

      if (config?.roomDesignConfig) {
        roomDesignConfig = config.roomDesignConfig;
        console.log(`[PublicMeetingRoom API] roomDesignConfig encontrado do hms100msConfig`);
      }
    }

    // Fallback: check meeting metadata for roomDesignConfig
    if (!roomDesignConfig) {
      const meetingMetadata = meeting.metadata as any;
      if (meetingMetadata?.roomDesignConfig) {
        roomDesignConfig = meetingMetadata.roomDesignConfig;
        console.log(`[PublicMeetingRoom API] roomDesignConfig encontrado do meeting.metadata`);
      }
    }

    // Fallback: check tenant's roomDesignConfig
    if (!roomDesignConfig && tenant?.roomDesignConfig) {
      roomDesignConfig = tenant.roomDesignConfig;
      console.log(`[PublicMeetingRoom API] roomDesignConfig encontrado do tenant`);
    }

    // Build metadata with formSubmissionId (support fsid query param as fallback)
    const meetingMetadata = meeting.metadata as any || {};
    const formSubmissionId = meetingMetadata.formSubmissionId || fsid || null;

    if (fsid && !meetingMetadata.formSubmissionId) {
      console.log(`[PublicMeetingRoom API] Usando fsid da URL como formSubmissionId: ${fsid}`);
    }

    const response = {
      reuniao: {
        id: meeting.id,
        titulo: meeting.titulo,
        descricao: meetingMetadata.descricao || '',
        dataInicio: meeting.dataInicio,
        dataFim: meeting.dataFim,
        duracao: meeting.duracao,
        status: meeting.status,
        roomId100ms: meeting.roomId100ms,
        roomCode100ms: meetingMetadata.roomCode100ms || null,
        linkReuniao: meetingMetadata.linkReuniao || null,
        nome: meeting.nome,
        email: meeting.email,
        metadata: {
          ...meetingMetadata,
          formSubmissionId // Ensure formSubmissionId is included
        }
      },
      tenant: tenant ? {
        id: tenant.id,
        nome: tenant.nome,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl || null
      } : {
        id: meeting.tenantId || 'default',
        nome: 'Empresa',
        slug: companySlug,
        logoUrl: null
      },
      designConfig: designConfig || tenant?.configuracoes || {},
      roomDesignConfig: roomDesignConfig
    };

    console.log(`[PublicMeetingRoom API] Resposta - roomDesignConfig: ${roomDesignConfig ? 'presente' : 'null'}, formSubmissionId: ${formSubmissionId || 'null'}`);

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(response);

  } catch (error: any) {
    console.error('[PublicMeetingRoom API] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar dados da reunião' });
  }
});

// Get participant data by participant_id or form_submission_id (for contract pre-fill)
publicRoomDesignRouter.get('/reunioes/:meetingId/participant-data', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const { pid, fsid } = req.query;

    console.log(`[ParticipantData] Buscando dados para meeting ${meetingId}, pid=${pid || 'nenhum'}, fsid=${fsid || 'nenhum'}`);

    // First, get the meeting to find tenantId
    // FIX: Search by BOTH id and roomId100ms for consistency
    const [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId as string),
        eq(reunioes.roomId100ms, meetingId as string)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    let formSubmission = null;

    // Method 0 (PRIORITY): Use fsid (form_submission_id) directly from URL - MOST RELIABLE
    // This is the best method because each form_submission has a unique ID
    // Works even when multiple participants share the same meeting URL
    if (fsid && typeof fsid === 'string') {
      console.log(`[ParticipantData] Buscando form_submission por fsid (ID direto): ${fsid}`);
      const [sub] = await db.select().from(formSubmissions)
        .where(eq(formSubmissions.id, fsid))
        .limit(1);

      if (sub) {
        formSubmission = sub;
        console.log(`[ParticipantData] ✅ Encontrado por fsid: ${sub.id} - ${sub.contactName}`);
      }
    }

    // Method 1: Use participant_id from URL query parameter
    if (!formSubmission && pid && typeof pid === 'string') {
      console.log(`[ParticipantData] Buscando form_submission por participant_id: ${pid}`);
      const [sub] = await db.select().from(formSubmissions)
        .where(eq(formSubmissions.participantId, pid))
        .limit(1);

      if (sub) {
        formSubmission = sub;
        console.log(`[ParticipantData] Encontrado por participant_id: ${sub.id}`);
      }
    }

    // Method 2: Fallback to meeting's participantId column
    if (!formSubmission && meeting.participantId) {
      console.log(`[ParticipantData] Buscando por meeting.participantId: ${meeting.participantId}`);
      const [sub] = await db.select().from(formSubmissions)
        .where(eq(formSubmissions.participantId, meeting.participantId))
        .limit(1);

      if (sub) {
        formSubmission = sub;
        console.log(`[ParticipantData] Encontrado por meeting.participantId: ${sub.id}`);
      }
    }

    // Method 3: Fallback to metadata.formSubmissionId (legacy)
    if (!formSubmission) {
      const metadata = meeting.metadata as any;
      if (metadata?.formSubmissionId) {
        console.log(`[ParticipantData] Buscando por metadata.formSubmissionId: ${metadata.formSubmissionId}`);
        const [sub] = await db.select().from(formSubmissions)
          .where(eq(formSubmissions.id, metadata.formSubmissionId))
          .limit(1);

        if (sub) {
          formSubmission = sub;
          console.log(`[ParticipantData] Encontrado por formSubmissionId: ${sub.id}`);
        }
      }
    }

    // Method 4: Fallback to matching by phone/email from meeting data
    if (!formSubmission) {
      const normalizedPhone = meeting.telefone?.replace(/\D/g, '') || '';

      if (normalizedPhone && normalizedPhone.length >= 8) {
        console.log(`[ParticipantData] Buscando por telefone: ${normalizedPhone}`);
        const [sub] = await db.select().from(formSubmissions)
          .where(sql`REPLACE(REPLACE(REPLACE(REPLACE(${formSubmissions.contactPhone}, '-', ''), ' ', ''), '(', ''), ')', '') LIKE '%' || ${normalizedPhone} || '%'`)
          .orderBy(desc(formSubmissions.createdAt))
          .limit(1);

        if (sub) {
          formSubmission = sub;
          console.log(`[ParticipantData] Encontrado por telefone: ${sub.id}`);
        }
      }

      if (!formSubmission && meeting.email) {
        console.log(`[ParticipantData] Buscando por email: ${meeting.email}`);
        const [sub] = await db.select().from(formSubmissions)
          .where(sql`LOWER(${formSubmissions.contactEmail}) = LOWER(${meeting.email})`)
          .orderBy(desc(formSubmissions.createdAt))
          .limit(1);

        if (sub) {
          formSubmission = sub;
          console.log(`[ParticipantData] Encontrado por email: ${sub.id}`);
        }
      }
    }

    // Prepare response data
    let responseData: any = null;

    // If we have formSubmission from local DB, check if it has complete data
    if (formSubmission) {
      responseData = {
        nome: formSubmission.contactName,
        email: formSubmission.contactEmail,
        telefone: formSubmission.contactPhone,
        cpf: formSubmission.contactCpf,
        instagram: formSubmission.instagramHandle,
        dataNascimento: formSubmission.birthDate,
        endereco: {
          cep: formSubmission.addressCep,
          logradouro: formSubmission.addressStreet,
          numero: formSubmission.addressNumber,
          complemento: formSubmission.addressComplement,
          bairro: formSubmission.addressNeighborhood,
          cidade: formSubmission.addressCity,
          estado: formSubmission.addressState
        }
      };
    }

    // If local data is incomplete, try to fetch from Supabase tenant
    const hasCompleteData = responseData?.nome && responseData?.cpf;
    if (!hasCompleteData && (fsid || formSubmission?.id)) {
      const submissionId = fsid || formSubmission?.id;
      console.log(`[ParticipantData] Dados locais incompletos, buscando no Supabase do tenant: ${meeting.tenantId}`);

      try {
        const supabase = await getClientSupabaseClient(meeting.tenantId);
        if (supabase) {
          const { data: supabaseSubmission, error } = await supabase
            .from('form_submissions')
            .select('*')
            .eq('id', submissionId)
            .single();

          if (supabaseSubmission && !error) {
            console.log(`[ParticipantData] ✅ Dados encontrados no Supabase: ${supabaseSubmission.contact_name}`);
            responseData = {
              nome: supabaseSubmission.contact_name,
              email: supabaseSubmission.contact_email,
              telefone: supabaseSubmission.contact_phone,
              cpf: supabaseSubmission.contact_cpf,
              instagram: supabaseSubmission.instagram_handle,
              dataNascimento: supabaseSubmission.birth_date,
              endereco: {
                cep: supabaseSubmission.address_cep,
                logradouro: supabaseSubmission.address_street,
                numero: supabaseSubmission.address_number,
                complemento: supabaseSubmission.address_complement,
                bairro: supabaseSubmission.address_neighborhood,
                cidade: supabaseSubmission.address_city,
                estado: supabaseSubmission.address_state
              }
            };

            // Also include the form_submission_id for contract pre-fill
            if (!formSubmission) {
              formSubmission = { id: submissionId } as any;
            }
          } else if (error) {
            console.log(`[ParticipantData] Erro ao buscar no Supabase: ${error.message}`);
          }
        }
      } catch (err) {
        console.log(`[ParticipantData] Erro ao conectar ao Supabase: ${(err as Error).message}`);
      }
    }

    if (!responseData || (!responseData.nome && !responseData.email)) {
      console.log(`[ParticipantData] Nenhum form_submission encontrado`);
      return res.json({
        found: false,
        participantId: pid || meeting.participantId || null,
        meetingInfo: {
          nome: meeting.nome,
          email: meeting.email,
          telefone: meeting.telefone
        }
      });
    }

    // Return participant data
    res.json({
      found: true,
      participantId: formSubmission?.participantId || pid || meeting.participantId,
      formSubmissionId: formSubmission?.id || fsid,
      data: responseData
    });

  } catch (error: any) {
    console.error('[ParticipantData] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do participante' });
  }
});

// Public route to get full meeting data (alias for /info with more data) - WITH CACHE
// FIX: Now includes formSubmissionId from fsid query param as fallback for sign button
publicRoomDesignRouter.get('/reunioes/:meetingId/public', async (req: Request, res: Response) => {
  try {
    const meetingIdParam = req.params.meetingId as string | undefined;
    const meetingId = meetingIdParam?.split('?')[0]?.split('%3F')[0];
    const fsid = req.query.fsid as string | undefined;

    if (!meetingId) {
      return res.status(400).json({ error: 'ID da reunião é obrigatório' });
    }

    // Note: Skip cache if fsid is provided to ensure fresh metadata
    if (!fsid) {
      const cached = getCachedMeeting(meetingId);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json(cached);
      }
    }

    // FIX: Search by BOTH id and roomId100ms to support URLs with either value
    let [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId),
        eq(reunioes.roomId100ms, meetingId)
      ))
      .limit(1);

    if (!meeting) {
       console.log(`🔍 [MeetingPublic] Tentando fallback para meetingId: ${meetingId}`);
       const { pool } = await import('../db');
       const tenantResults = await pool.query('SELECT tenant_id FROM supabase_config');
       const tenants = tenantResults.rows.map((r: any) => r.tenant_id);
       const allTenants = Array.from(new Set([...tenants, 'system', 'local', 'supabase_local']));
       for (const tId of allTenants) {
         try {
           const supabase = await getClientSupabaseClient(tId);
           if (!supabase) continue;
           const { data, error } = await supabase.from('reunioes')
             .select('*').or(`id.eq.${meetingId},room_id_100ms.eq.${meetingId}`).maybeSingle();
           if (!error && data) {
             meeting = {
               id: data.id, tenantId: tId, titulo: data.titulo,
               roomId100ms: data.room_id_100ms,
               metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata || {}),
               status: data.status, nome: data.nome, email: data.email,
               dataInicio: data.data_inicio ? new Date(data.data_inicio) : null,
               dataFim: data.data_fim ? new Date(data.data_fim) : null,
               duracao: data.duracao,
               participantId: data.participant_id
             } as any;
             break;
           }
         } catch (e) {}
       }
    }

    if (!meeting) {
      console.log(`[MeetingPublic] Reunião não encontrada para meetingId: ${meetingId}, fsid: ${fsid || 'none'}`);
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    // FIX: Merge fsid into metadata if provided in query params
    // This is critical for the sign button to work (Meeting100ms.tsx checks metadata.formSubmissionId)
    const originalMetadata = meeting.metadata as any || {};
    const enhancedMetadata = {
      ...originalMetadata,
      formSubmissionId: originalMetadata.formSubmissionId || fsid || null
    };

    if (fsid && !originalMetadata.formSubmissionId) {
      console.log(`[MeetingPublic] ✅ Usando fsid da URL como formSubmissionId: ${fsid}`);
    }

    console.log(`[MeetingPublic] 📦 Resposta para meetingId=${meetingId}: formSubmissionId=${enhancedMetadata.formSubmissionId || 'null'}, fsid=${fsid || 'null'}`);

    const response = {
      id: meeting.id,
      tenantId: meeting.tenantId,
      titulo: meeting.titulo,
      nome: meeting.nome,
      email: meeting.email,
      telefone: meeting.telefone,
      dataInicio: meeting.dataInicio,
      dataFim: meeting.dataFim,
      duracao: meeting.duracao,
      status: meeting.status,
      participantId: meeting.participantId,
      roomId100ms: meeting.roomId100ms,
      metadata: enhancedMetadata
    };

    // Only cache if no fsid was provided (cache is generic)
    if (!fsid) {
      setCachedMeeting(meetingId, response);
    }

    res.setHeader('X-Cache', fsid ? 'SKIP' : 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(response);

  } catch (error: any) {
    console.error('[MeetingPublic] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar informações da reunião' });
  }
});

// Public route to get room design config (alias) - WITH CACHE
publicRoomDesignRouter.get('/reunioes/:meetingId/room-design-public', async (req: Request, res: Response) => {
  try {
    // Clean meetingId - remove any query string that might be URL-encoded in the path
    const meetingIdParam = req.params.meetingId as string | undefined;
    const meetingId = meetingIdParam?.split('?')[0]?.split('%3F')[0];

    if (!meetingId) {
      return res.status(400).json({ error: 'ID da reunião é obrigatório' });
    }

    // Check cache first
    const cached = getCachedRoomDesign(meetingId);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    // FIX: Search by BOTH id and roomId100ms to support URLs with either value
    // This ensures API-created meetings (via n8n) work the same as instant meetings
    const [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId),
        eq(reunioes.roomId100ms, meetingId)
      ))
      .limit(1);

    if (!meeting) {
      console.log(`[RoomDesignPublic] Reunião não encontrada para meetingId: ${meetingId}`);
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    console.log(`[RoomDesignPublic] Reunião encontrada: id=${meeting.id}, tenantId=${meeting.tenantId}`);

    // SEMPRE buscar config atualizada do tenant (prioridade sobre metadata da reunião)
    // Isso garante que mudanças nas cores da página Design sejam aplicadas a todas as reuniões
    let designConfig = null;

    if (meeting.tenantId) {
      const [config] = await db.select().from(hms100msConfig)
        .where(eq(hms100msConfig.tenantId, meeting.tenantId))
        .limit(1);

      if (config?.roomDesignConfig) {
        designConfig = config.roomDesignConfig;
        console.log(`[RoomDesignPublic] ✅ roomDesignConfig encontrado no hms100msConfig para tenant ${meeting.tenantId}`);
      } else {
        console.log(`[RoomDesignPublic] ⚠️ roomDesignConfig NÃO encontrado no hms100msConfig para tenant ${meeting.tenantId}`);
      }
    } else {
      console.log(`[RoomDesignPublic] ⚠️ meeting.tenantId é null/undefined`);
    }

    // Fallback: usar metadata da reunião se tenant não tiver configuração
    if (!designConfig) {
      const metadata = meeting.metadata as any;
      designConfig = metadata?.roomDesignConfig || null;
      if (designConfig) {
        console.log(`[RoomDesignPublic] ✅ roomDesignConfig encontrado no meeting.metadata`);
      } else {
        console.log(`[RoomDesignPublic] ❌ roomDesignConfig NÃO encontrado (nem no hms100msConfig nem no metadata)`);
      }
    }

    const response = {
      roomDesignConfig: designConfig,
      designConfig,
      meetingInfo: {
        id: meeting.id,
        titulo: meeting.titulo,
        status: meeting.status,
        tenantId: meeting.tenantId
      }
    };

    // Cache the result
    setCachedRoomDesign(meetingId, response);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(response);

  } catch (error: any) {
    console.error('[RoomDesignPublic] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração da sala' });
  }
});

// NEW: Combined endpoint for ultra-fast loading (single request instead of 2)
publicRoomDesignRouter.get('/reunioes/:meetingId/full-public', async (req: Request, res: Response) => {
  try {
    const meetingIdParam = req.params.meetingId as string | undefined;
    const meetingId = meetingIdParam?.split('?')[0]?.split('%3F')[0];

    if (!meetingId) {
      return res.status(400).json({ error: 'ID da reunião é obrigatório' });
    }

    // Check cache first
    const cached = getCachedMeetingFull(meetingId);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    // FIX: Search by BOTH id and roomId100ms to support URLs with either value
    let [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId),
        eq(reunioes.roomId100ms, meetingId)
      ))
      .limit(1);

    let foundTenantId = '';

    if (!meeting) {
      console.log(`🔍 [MeetingFullPublic] Reunião não encontrada localmente para meetingId: ${meetingId}. Tentando fallback em tenants...`);
      
      // FALLBACK: Procurar em todos os tenants configurados
      const { pool } = await import('../db');
      const tenantResults = await pool.query('SELECT tenant_id FROM supabase_config');
      const tenants = tenantResults.rows.map((r: any) => r.tenant_id);
      const allTenants = Array.from(new Set([...tenants, 'system', 'local', 'supabase_local']));

      for (const tId of allTenants) {
        try {
          const supabase = await getClientSupabaseClient(tId);
          if (!supabase) continue;

          const { data, error } = await supabase
            .from('reunioes')
            .select('*')
            .or(`id.eq.${meetingId},room_id_100ms.eq.${meetingId}`)
            .maybeSingle();

          if (!error && data) {
            console.log(`✅ [MeetingFullPublic] Reunião encontrada no tenant: ${tId}`);
            // Mapear campos do Supabase para o formato esperado (Drizzle camelCase)
            meeting = {
              id: data.id,
              tenantId: tId,
              titulo: data.titulo,
              nome: data.nome,
              email: data.email,
              telefone: data.telefone,
              dataInicio: data.data_inicio ? new Date(data.data_inicio) : null,
              dataFim: data.data_fim ? new Date(data.data_fim) : null,
              duracao: data.duracao,
              status: data.status,
              participantId: data.participant_id,
              roomId100ms: data.room_id_100ms,
              linkReuniao: data.link_reuniao,
              linkPublico: data.link_publico,
              metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata || {}),
              compareceu: data.compareceu,
              updatedAt: data.updated_at ? new Date(data.updated_at) : new Date()
            } as any;
            foundTenantId = tId;
            break;
          }
        } catch (err) {
          // Ignorar erros de tenant específico para continuar a busca
        }
      }
    }

    if (!meeting) {
      console.log(`❌ [MeetingFullPublic] Reunião não encontrada em nenhum lugar: ${meetingId}`);
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    console.log(`[MeetingFullPublic] Reunião encontrada: id=${meeting.id}, tenantId=${meeting.tenantId || foundTenantId}`);

    // Get design config
    let designConfig = null;
    const meetingTenantId = meeting.tenantId || foundTenantId;

    if (meetingTenantId) {
      // 1. Try local DB first
      const [config] = await db.select().from(hms100msConfig)
        .where(eq(hms100msConfig.tenantId, meetingTenantId))
        .limit(1);

      if (config?.roomDesignConfig) {
        designConfig = config.roomDesignConfig;
      } else if (foundTenantId) {
        // 2. Try remote tenant Supabase if found via fallback
        try {
          const supabase = await getClientSupabaseClient(foundTenantId);
          if (supabase) {
            const { data: remoteConfig } = await supabase
              .from('hms_100ms_config')
              .select('room_design_config')
              .eq('tenant_id', foundTenantId)
              .maybeSingle();
            
            if (remoteConfig?.room_design_config) {
              designConfig = remoteConfig.room_design_config;
              console.log(`✅ [MeetingFullPublic] Design config encontrado remotamente no tenant ${foundTenantId}`);
            }
          }
        } catch (err) {
          console.error(`❌ [MeetingFullPublic] Erro ao buscar design remoto:`, err);
        }
      }
    }

    // Fallback to metadata
    if (!designConfig) {
      const metadata = meeting.metadata as any;
      designConfig = metadata?.roomDesignConfig || null;
    }

    const response = {
      meeting: {
        id: meeting.id,
        tenantId: meeting.tenantId,
        titulo: meeting.titulo,
        nome: meeting.nome,
        email: meeting.email,
        telefone: meeting.telefone,
        dataInicio: meeting.dataInicio,
        dataFim: meeting.dataFim,
        duracao: meeting.duracao,
        status: meeting.status,
        participantId: meeting.participantId,
        roomId100ms: meeting.roomId100ms,
        linkReuniao: meeting.linkReuniao,
        linkPublico: meeting.linkPublico,
        metadata: meeting.metadata
      },
      roomDesignConfig: designConfig,
      designConfig
    };

    // Cache the combined result
    setCachedMeetingFull(meetingId, response);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(response);

  } catch (error: any) {
    console.error('[MeetingFullPublic] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar dados da reunião' });
  }
});

// Public route to get meeting info (limited data)
publicRoomDesignRouter.get('/reunioes/:meetingId/info', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

    // FIX: Search by BOTH id and roomId100ms for consistency
    const [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId as string),
        eq(reunioes.roomId100ms, meetingId as string)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    res.json({
      id: meeting.id,
      titulo: meeting.titulo,
      dataInicio: meeting.dataInicio,
      dataFim: meeting.dataFim,
      status: meeting.status,
      participantId: meeting.participantId,
      roomId100ms: meeting.roomId100ms
    });

  } catch (error: any) {
    console.error('[MeetingInfo] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar informações da reunião' });
  }
});

// Public route to generate 100ms token for guests (no auth required)
publicRoomDesignRouter.post('/reunioes/:meetingId/token-public', async (req: Request, res: Response) => {
  try {
    // Clean meetingId - remove any query string that might be URL-encoded
    const meetingIdParam = req.params.meetingId as string | undefined;
    const meetingId = meetingIdParam?.split('?')[0]?.split('%3F')[0];
    // Accept both participantName and userName for compatibility
    const { participantName, userName, role = 'guest' } = req.body;
    const name = participantName || userName;

    if (!meetingId) {
      return res.status(400).json({ error: 'ID da reunião é obrigatório' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Nome do participante é obrigatório' });
    }

    console.log(`[TokenPublic] Gerando token para reunião ${meetingId}, participante: ${name}, role: ${role}`);

    // FIX: Search by BOTH id and roomId100ms for consistency
    const [meeting] = await db.select().from(reunioes)
      .where(or(
        eq(reunioes.id, meetingId),
        eq(reunioes.roomId100ms, meetingId)
      ))
      .limit(1);

    if (!meeting) {
      console.error(`[TokenPublic] Reunião ${meetingId} não encontrada`);
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    if (!meeting.roomId100ms) {
      console.error(`[TokenPublic] Reunião ${meetingId} sem sala 100ms configurada`);
      return res.status(400).json({ error: 'Reunião sem sala 100ms configurada' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, meeting.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      console.error(`[TokenPublic] Credenciais 100ms não configuradas para tenant ${meeting.tenantId}`);
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    // Generate unique participant ID
    const participantId = `pub_${nanoid(10)}`;

    const token = gerarTokenParticipante(
      meeting.roomId100ms,
      participantId,
      role === 'host' ? 'host' : 'guest',
      appAccessKey,
      appSecret
    );

    console.log(`[TokenPublic] Token gerado com sucesso para ${name} (${participantId})`);

    // Mark meeting as attended
    if (!meeting.compareceu) {
      await db.update(reunioes)
        .set({ compareceu: true, updatedAt: new Date() })
        .where(eq(reunioes.id, meetingId));
    }

    res.json({
      token,
      participantId,
      roomId: meeting.roomId100ms
    });

  } catch (error: any) {
    console.error('[TokenPublic] Erro ao gerar token:', error);
    res.status(500).json({ error: 'Erro ao gerar token de participante' });
  }
});

// ============================================================
// PUBLIC RECORDING ENDPOINTS (for Meeting100ms.tsx frontend)
// These endpoints allow guests to control recording in public meetings
// ============================================================

// Start recording (public - for public meetings)
// Security: This endpoint is for public meetings where participants have browser recording permission
// The 100ms template already restricts browserRecording to specific roles (host, guest)
publicRoomDesignRouter.post('/100ms/recording/start', async (req: Request, res: Response) => {
  try {
    const { roomId, meetingUrl, tenantSlug, meetingId } = req.body;

    console.log('[Recording Public] Iniciando gravação:', { roomId, meetingId, tenantSlug });

    if (!roomId) {
      return res.status(400).json({ error: 'roomId é obrigatório' });
    }

    let meeting: any = null;

    if (meetingId && isValidUUID(meetingId)) {
      meeting = await db.select().from(reunioes)
        .where(eq(reunioes.id, meetingId))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (!meeting && isValidUUID(roomId)) {
      meeting = await db.select().from(reunioes)
        .where(eq(reunioes.id, roomId))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (!meeting) {
      console.log('[Recording Public] Tentando por room_id_100ms:', roomId);
      meeting = await db.select().from(reunioes)
        .where(eq(reunioes.roomId100ms, roomId))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    const tenantId = meeting.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado na reunião' });
    }

    // Guard: impedir starts simultaneos na mesma reuniao
    const existingActive = await db.select().from(gravacoes)
      .where(and(
        eq(gravacoes.reuniaoId, meeting.id),
        eq(gravacoes.status, 'recording')
      ))
      .limit(1)
      .then(rows => rows[0]);

    if (existingActive) {
      console.log('[Recording Public] Ja existe gravacao ativa para esta reuniao:', existingActive.id);
      return res.json({ success: true, recordingId: existingActive.id, status: 'recording', alreadyRecording: true });
    }

    // Montar URL da reuniao automaticamente se nao vier no body
    const BASE_URL = process.env.BASE_URL || `https://nexusemijoias.nexusintelligence.tech`;
    // URL limpa para o bot - sem query params que quebram o React Router
    const finalMeetingUrl = meetingUrl || meeting.linkPublico || `${BASE_URL}/reuniao-publica/${tenantId}/${meeting.id}`;
    console.log('[Recording Public] URL da reuniao para bot:', finalMeetingUrl);

    // Start recording via Bot (Xvfb + Chrome + FFmpeg)
    const [newRecording] = await db.insert(gravacoes).values({
      reuniaoId: meeting.id,
      tenantId: tenantId,
      roomId100ms: meeting.roomId100ms || null,
      status: 'recording',
      startedAt: new Date(),
      metadata: { meetingUrl: finalMeetingUrl }
    }).returning();

    // Start bot recording in background (non-blocking)
    startBotRecording({ meetingUrl: finalMeetingUrl, recordingId: newRecording.id })
      .catch(err => console.error('[Recorder] Erro ao iniciar bot:', err));

    console.log('[Recording Public] Gravação criada:', newRecording.id);

    // Sync to Supabase
    await syncRecordingToSupabase(tenantId, newRecording);

    res.json({
      success: true,
      recordingId: newRecording.id,
      status: 'recording'
    });

  } catch (error: any) {
    console.error('[Recording Public] Erro ao iniciar gravação:', error);
    // 409 = ja existe gravacao em andamento - tratar como sucesso
    if (error?.response?.status === 409 || (error?.message && error.message.includes('409'))) {
      console.log('[Recording Public] Gravacao ja em andamento (409) - retornando sucesso');
      return res.json({ success: true, status: 'recording', alreadyRecording: true });
    }
    res.status(500).json({ error: error.message || 'Erro ao iniciar gravação' });
  }
});

// Stop recording (public - for public meetings)
publicRoomDesignRouter.post('/100ms/recording/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, recordingId, meetingId } = req.body;

    console.log('[Recording Public] Parando gravação:', { roomId, meetingId, recordingId });

    if (!roomId) {
      return res.status(400).json({ error: 'roomId é obrigatório' });
    }

    // Find active recording for this room
    let recording = recordingId
      ? await db.select().from(gravacoes)
        .where(and(
          eq(gravacoes.id, recordingId),
          eq(gravacoes.status, 'recording')
        ))
        .limit(1)
        .then(rows => rows[0])
      : null;

    // Se recordingId foi passado mas nao encontrado, nao fazer fallback - retornar 404
    if (recordingId && !recording) {
      return res.status(404).json({ error: 'Gravacao nao encontrada ou ja finalizada' });
    }

    // If no recording found by ID, find by roomId
    if (!recording) {
      let meeting: any = null;

      if (meetingId && isValidUUID(meetingId)) {
        meeting = await db.select().from(reunioes)
          .where(eq(reunioes.id, meetingId))
          .limit(1)
          .then(rows => rows[0]);
      }

      if (!meeting && isValidUUID(roomId)) {
        meeting = await db.select().from(reunioes)
          .where(eq(reunioes.id, roomId))
          .limit(1)
          .then(rows => rows[0]);
      }

      if (!meeting) {
        meeting = await db.select().from(reunioes)
          .where(eq(reunioes.roomId100ms, roomId))
          .limit(1)
          .then(rows => rows[0]);
      }

      if (meeting) {
        recording = await db.select().from(gravacoes)
          .where(and(
            eq(gravacoes.reuniaoId, meeting.id),
            eq(gravacoes.status, 'recording')
          ))
          .orderBy(desc(gravacoes.startedAt))
          .limit(1)
          .then(rows => rows[0]);
      }
    }

    if (!recording) {
      // Sem registro no banco, tentar parar diretamente via API 100ms pelo roomId
      console.log('[Recording Public] Sem registro no banco, tentando parar via API 100ms diretamente...');
      try {
        // Buscar tenant pelo roomId
        const [reuniaoParaStop] = await db.select().from(reunioes)
          .where(eq(reunioes.roomId100ms, roomId)).limit(1);
        const tenantIdParaStop = reuniaoParaStop?.tenantId;
        const [configParaStop] = tenantIdParaStop
          ? await db.select().from(hms100msConfig).where(eq(hms100msConfig.tenantId, tenantIdParaStop)).limit(1)
          : [null];
        const akStop = configParaStop?.appAccessKey
          ? decrypt(configParaStop.appAccessKey)
          : (process.env.HMS_APP_ACCESS_KEY || '');
        const asStop = configParaStop?.appSecret
          ? decrypt(configParaStop.appSecret)
          : (process.env.HMS_APP_SECRET || '');
        if (akStop && asStop) {
          const { generateManagementToken } = await import('../services/meetings/hms100ms');
          const mgmtTok = generateManagementToken(akStop, asStop);
          const stopResp = await fetch(`https://api.100ms.live/v2/recordings/room/${roomId}/stop`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${mgmtTok}` }
          });
          if (stopResp.ok || stopResp.status === 404) {
            console.log('[Recording Public] Gravacao parada via API direta, status:', stopResp.status);
            return res.json({ success: true, message: 'Gravacao parada via API direta' });
          }
        }
      } catch (directErr: any) {
        console.error('[Recording Public] Erro ao parar via API direta:', directErr.message);
      }
      return res.status(404).json({ error: 'Gravação ativa não encontrada' });
    }

    const tenantId = recording.tenantId;

    // Get 100ms config
    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    // Stop recording via 100ms API
    if (recording.roomId100ms) {
      console.log('[Recording Public] Chamando API 100ms para parar gravação, room:', recording.roomId100ms);
      try {
        // Stop bot recording and get file
      try {
        const { outputFile, duration: botDuration } = await stopBotRecording(recording.id);
        const fileSize = fs.existsSync(outputFile) ? fs.statSync(outputFile).size : null;
        const finalDuration = botDuration > 0 ? botDuration : recording.duration;
        // Update with local file path and duration
        await db.update(gravacoes).set({
          fileUrl: `/gravacoes/${recording.id}.mp4`,
          fileSize: fileSize,
          duration: finalDuration,
          status: 'completed',
          stoppedAt: new Date(),
          updatedAt: new Date()
        }).where(eq(gravacoes.id, recording.id));
        console.log(`[Recording Public] fileUrl salvo: /gravacoes/${recording.id}.mp4 size=${fileSize}b dur=${finalDuration}s`);
      } catch (botErr: any) {
        console.error('[Recorder] Erro ao parar bot:', botErr.message);
        // Mesmo com erro, tentar salvar fileUrl se arquivo existir no disco
        const fallbackFile = `/var/www/plataformacompleta/uploads/gravacoes/${recording.id}.mp4`;
        if (fs.existsSync(fallbackFile)) {
          const fileSize = fs.statSync(fallbackFile).size;
          await db.update(gravacoes).set({
            fileUrl: `/gravacoes/${recording.id}.mp4`,
            fileSize: fileSize,
            status: 'completed',
            stoppedAt: new Date(),
            updatedAt: new Date()
          }).where(eq(gravacoes.id, recording.id));
          console.log(`[Recording Public] fileUrl salvo via fallback: /gravacoes/${recording.id}.mp4 size=${fileSize}b`);
        }
      }
      } catch (stopErr: any) {
        const status = stopErr?.response?.status || stopErr?.status;
        if (status === 404 || status === 409) {
          console.log('[Recording Public] Gravação já parada no 100ms (status:', status, ') - continuando atualização local');
        } else {
          console.error('[Recording Public] Erro ao parar no 100ms:', stopErr?.message || stopErr);
        }
      }
    }

    // Calculate duration
    const startedAt = new Date(recording.startedAt);
    const stoppedAt = new Date();
    const durationSeconds = Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000);

    // Update recording status
    const [updatedRecording] = await db.update(gravacoes)
      .set({
        status: 'completed',
        stoppedAt: stoppedAt,
        duration: durationSeconds,
        updatedAt: new Date()
      })
      .where(eq(gravacoes.id, recording.id))
      .returning();

    console.log('[Recording Public] Gravação parada:', updatedRecording.id, 'duração:', durationSeconds, 'segundos');

    // Sync to Supabase
    await syncRecordingToSupabase(tenantId, updatedRecording);

    res.json({
      success: true,
      recording: updatedRecording
    });

  } catch (error: any) {
    console.error('[Recording Public] Erro ao parar gravação:', error);
    res.status(500).json({ error: error.message || 'Erro ao parar gravação' });
  }
});

// List recordings for a room (public)
publicRoomDesignRouter.get('/100ms/recording/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    let meeting: any = null;

    if (isValidUUID(roomId)) {
      meeting = await db.select().from(reunioes)
        .where(eq(reunioes.id, roomId as string))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (!meeting) {
      meeting = await db.select().from(reunioes)
        .where(eq(reunioes.roomId100ms, roomId))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (!meeting) {
      return res.json([]);
    }

    // Get recordings for this meeting
    const recordings = await db.select().from(gravacoes)
      .where(eq(gravacoes.reuniaoId, meeting.id))
      .orderBy(desc(gravacoes.startedAt));

    res.json(recordings.map(r => ({
      id: r.id,
      status: r.status,
      recordingId100ms: r.recordingId100ms,
      startedAt: r.startedAt,
      stoppedAt: r.stoppedAt,
      duration: r.duration,
      fileUrl: r.fileUrl
    })));

  } catch (error: any) {
    console.error('[Recording Public] Erro ao listar gravações:', error);
    res.status(500).json({ error: 'Erro ao listar gravações' });
  }
});

// ============================================================
// END PUBLIC RECORDING ENDPOINTS
// ============================================================

// Get room design config (public)
publicRoomDesignRouter.get('/room-design/:meetingId', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

    // Check cache first
    const cached = await getCachedMeeting(meetingId);
    if (cached && cached.designConfig) {
      return res.json({
        designConfig: cached.designConfig,
        meetingInfo: cached.meetingInfo,
        fromCache: true
      });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(eq(reunioes.id, meetingId as string))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    // SEMPRE buscar config atualizada do tenant (prioridade sobre metadata da reunião)
    let designConfig = null;

    if (meeting.tenantId) {
      const [config] = await db.select().from(hms100msConfig)
        .where(eq(hms100msConfig.tenantId, meeting.tenantId))
        .limit(1);

      if (config?.roomDesignConfig) {
        designConfig = config.roomDesignConfig;
      }
    }

    // Fallback: usar metadata da reunião
    if (!designConfig) {
      const metadata = meeting.metadata as any;
      designConfig = metadata?.roomDesignConfig || null;
    }

    const result = {
      designConfig,
      meetingInfo: {
        titulo: meeting.titulo,
        nome: meeting.nome,
        dataInicio: meeting.dataInicio,
        status: meeting.status,
        participantId: meeting.participantId
      }
    };

    // Cache the result
    await setCachedMeeting(meetingId as string, result);

    res.json(result);

  } catch (error: any) {
    console.error('[RoomDesign] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração da sala' });
  }
});

// ===========================================
// AUTHENTICATED ROUTES
// ===========================================

// List meetings for current tenant
meetingsRouter.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    // Query local PostgreSQL
    const localMeetings = await db.select().from(reunioes)
      .where(eq(reunioes.tenantId, user.tenantId))
      .orderBy(desc(reunioes.dataInicio))
      .limit(100);

    // Also query Supabase (meetings created externally via n8n/WhatsApp)
    let supabaseMeetings: any[] = [];
    try {
      const supabase = await getClientSupabaseClient(user.tenantId);
      if (supabase) {
        const { data, error } = await supabase
          .from('reunioes')
          .select('*')
          .eq('tenant_id', user.tenantId)
          .order('data_inicio', { ascending: false })
          .limit(100);
        if (!error && data) {
          const localIds = new Set(localMeetings.map((m: any) => m.id));
          supabaseMeetings = data
            .filter((m: any) => !localIds.has(m.id))
            .map((m: any) => ({
              id: m.id,
              tenantId: m.tenant_id,
              nome: m.nome,
              email: m.email,
              telefone: m.telefone,
              titulo: m.titulo,
              descricao: m.descricao,
              dataInicio: m.data_inicio,
              dataFim: m.data_fim,
              duracao: m.duracao,
              roomId100ms: m.room_id_100ms,
              linkReuniao: m.link_reuniao,
              linkPublico: m.link_publico,
              status: m.status,
              participantes: m.participantes,
              compareceu: m.compareceu,
              createdAt: m.created_at,
              updatedAt: m.updated_at,
            }));
        }
      }
    } catch (supabaseErr: any) {
      console.warn('[Meetings] Supabase fetch error (non-fatal):', supabaseErr.message);
    }

    const allMeetings = [...localMeetings, ...supabaseMeetings]
      .sort((a: any, b: any) => new Date(b.dataInicio || 0).getTime() - new Date(a.dataInicio || 0).getTime());

    res.json({ success: true, data: allMeetings });

  } catch (error: any) {
    console.error('[Meetings] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro ao listar reuniões' });
  }
});

// Create a new meeting (instant or scheduled)
meetingsRouter.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const { titulo, descricao, dataInicio, dataFim, duracao, nome, email, telefone, participantes } = req.body;

    if (!titulo || !dataInicio || !dataFim) {
      return res.status(400).json({ error: 'Título, data de início e data de fim são obrigatórios' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas para este tenant' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    if (!appAccessKey || !appSecret) {
      return res.status(400).json({ error: 'Credenciais do 100ms inválidas ou corrompidas' });
    }

    console.log(`[Meetings] Criando sala no 100ms para tenant ${user.tenantId}...`);
    const sala = await criarSala(
      titulo,
      config.templateId || '',
      appAccessKey,
      appSecret
    );
    console.log(`[Meetings] Sala criada no 100ms: ${sala.id}`);

    const startDate = new Date(dataInicio);
    const endDate = new Date(dataFim);
    const calculatedDuration = duracao || Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    const metadata: any = {
      source: 'dashboard',
      createdVia: 'web-app'
    };

    if (config.roomDesignConfig) {
      metadata.roomDesignConfig = config.roomDesignConfig;
      console.log(`[Meetings] roomDesignConfig aplicado do tenant`);
    }

    const [newMeeting] = await db.insert(reunioes).values({
      tenantId: user.tenantId,
      usuarioId: user.id,
      titulo,
      descricao: descricao || '',
      nome: nome || user.name || 'Host',
      email: email || user.email || '',
      telefone: telefone || '',
      dataInicio: startDate,
      dataFim: endDate,
      duracao: calculatedDuration,
      status: 'agendada',
      roomId100ms: sala.id,
      linkReuniao: '',
      metadata: metadata,
      compareceu: false,
      participantes: participantes || [],
    }).returning();

    const baseUrl = process.env.APP_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || req.get('host') || 'localhost:5000';
    const companySlug = await getCompanySlug(user.tenantId);
    const linkReuniao = `https://${baseUrl}/reuniao/${companySlug}/${newMeeting.id}`;
    const linkPublico = `https://${baseUrl}/reuniao-publica/${companySlug}/${newMeeting.id}`;

    await db.update(reunioes)
      .set({ linkReuniao, linkPublico })
      .where(eq(reunioes.id, newMeeting.id));

    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      await supabase.from('reunioes').upsert({
        id: newMeeting.id,
        tenant_id: user.tenantId,
        usuario_id: user.id,
        titulo,
        descricao: descricao || '',
        nome: nome || user.name || 'Host',
        email: email || user.email || '',
        telefone: telefone || '',
        data_inicio: startDate.toISOString(),
        data_fim: endDate.toISOString(),
        duracao: calculatedDuration,
        status: 'agendada',
        room_id_100ms: sala.id,
        link_reuniao: linkReuniao,
        link_publico: linkPublico,
        metadata: metadata,
        compareceu: false,
        participantes: participantes || [],
      }, { onConflict: 'id' });
      console.log(`[Meetings] Reunião sincronizada com Supabase`);
    }

    res.json({
      success: true,
      data: { ...newMeeting, linkReuniao, linkPublico }
    });

  } catch (error: any) {
    console.error('[Meetings] Erro ao criar reunião:', error);
    res.status(500).json({ error: 'Erro ao criar reunião: ' + error.message });
  }
});

// Create an instant meeting (like Google Meet - quick start)
meetingsRouter.post('/instantanea', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant não identificado' });
    }

    const body = req.body || {};
    const { titulo, descricao, nome, email, telefone, duracao = 60 } = body;

    // Get tenant 100ms config
    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({
        success: false,
        error: 'Credenciais 100ms não configuradas',
        message: 'Configure as credenciais do 100ms em Configurações antes de criar reuniões'
      });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    if (!appAccessKey || !appSecret) {
      return res.status(400).json({ success: false, error: 'Credenciais do 100ms inválidas ou corrompidas' });
    }

    // Generate meeting title if not provided
    const now = new Date();
    const meetingTitle = titulo || `Reunião Instantânea - ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    console.log(`[Meetings] Criando reunião instantânea para tenant ${user.tenantId}...`);

    // Create 100ms room
    const sala = await criarSala(
      meetingTitle,
      config.templateId || '',
      appAccessKey,
      appSecret
    );
    console.log(`[Meetings] Sala instantânea criada no 100ms: ${sala.id}`);

    const startDate = now;
    const endDate = new Date(now.getTime() + duracao * 60 * 1000);

    // Build metadata with roomDesignConfig from tenant
    const metadata: any = {
      source: 'dashboard',
      createdVia: 'instant-meeting',
      instant: true
    };

    if (config.roomDesignConfig) {
      metadata.roomDesignConfig = config.roomDesignConfig;
      console.log(`[Meetings] roomDesignConfig aplicado do tenant para reunião instantânea`);
    }

    // Create meeting record
    const [newMeeting] = await db.insert(reunioes).values({
      tenantId: user.tenantId,
      usuarioId: user.id,
      titulo: meetingTitle,
      descricao: descricao || 'Reunião criada instantaneamente',
      nome: nome || user.name || 'Host',
      email: email || user.email || '',
      telefone: telefone || '',
      dataInicio: startDate,
      dataFim: endDate,
      duracao: duracao,
      status: 'em_andamento', // Start immediately
      roomId100ms: sala.id,
      linkReuniao: '',
      metadata: metadata,
      compareceu: false,
      participantes: [],
    }).returning();

    // Generate meeting links
    const baseUrl = process.env.APP_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || req.get('host') || 'localhost:5000';
    const companySlug = await getCompanySlug(user.tenantId);
    const linkReuniao = `https://${baseUrl}/reuniao/${companySlug}/${newMeeting.id}`;
    const linkPublico = `https://${baseUrl}/reuniao-publica/${companySlug}/${newMeeting.id}`;

    await db.update(reunioes)
      .set({ linkReuniao, linkPublico })
      .where(eq(reunioes.id, newMeeting.id));

    // Sync to Supabase asynchronously
    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      supabase.from('reunioes').upsert({
        id: newMeeting.id,
        tenant_id: user.tenantId,
        usuario_id: user.id,
        titulo: meetingTitle,
        descricao: descricao || 'Reunião criada instantaneamente',
        nome: nome || user.name || 'Host',
        email: email || user.email || '',
        telefone: telefone || '',
        data_inicio: startDate.toISOString(),
        data_fim: endDate.toISOString(),
        duracao: duracao,
        status: 'em_andamento',
        room_id_100ms: sala.id,
        link_reuniao: linkReuniao,
        link_publico: linkPublico,
        metadata: metadata,
        compareceu: false,
        participantes: [],
      }, { onConflict: 'id' }).then(
        () => console.log(`[Meetings] Reunião instantânea sincronizada com Supabase`),
        (err: any) => console.error(`[Meetings] Erro ao sincronizar reunião instantânea com Supabase:`, err)
      );
    }

    // Generate host token
    let hostToken = null;
    try {
      hostToken = gerarTokenParticipante(
        sala.id,
        user.name || 'Host',
        'host',
        appAccessKey,
        appSecret
      );
    } catch (tokenErr) {
      console.warn('[Meetings] Erro ao gerar token do host:', tokenErr);
    }

    console.log(`[Meetings] Reunião instantânea criada com sucesso: ${newMeeting.id}`);

    res.status(201).json({
      success: true,
      data: {
        ...newMeeting,
        linkReuniao,
        linkPublico,
        hostToken,
        roomId100ms: sala.id
      }
    });

  } catch (error: any) {
    console.error('[Meetings] Erro ao criar reunião instantânea:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar reunião instantânea',
      message: error.message
    });
  }
});

// Start a meeting
meetingsRouter.post('/:id/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    await db.update(reunioes)
      .set({ status: 'em_andamento', updatedAt: new Date() })
      .where(eq(reunioes.id, id as string));

    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      await supabase.from('reunioes')
        .update({ status: 'em_andamento' })
        .eq('id', id);
    }

    res.json({ success: true, status: 'em_andamento' });

  } catch (error: any) {
    console.error('[Meetings] Erro ao iniciar reunião:', error);
    res.status(500).json({ error: 'Erro ao iniciar reunião' });
  }
});

// End a meeting
meetingsRouter.post('/:id/end', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    await db.update(reunioes)
      .set({ status: 'concluida', updatedAt: new Date() })
      .where(eq(reunioes.id, id as string));

    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      await supabase.from('reunioes')
        .update({ status: 'concluida' })
        .eq('id', id);
    }

    res.json({ success: true, status: 'concluida' });

  } catch (error: any) {
    console.error('[Meetings] Erro ao finalizar reunião:', error);
    res.status(500).json({ error: 'Erro ao finalizar reunião' });
  }
});

// =========================================================
// IMPORTANTE: Rotas específicas DEVEM vir ANTES de rotas com :id
// =========================================================

// Get room design config for current tenant
meetingsRouter.get('/room-design', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (config?.roomDesignConfig) {
      return res.json({
        roomDesignConfig: config.roomDesignConfig,
        tenantId: config.tenantId
      });
    }

    let supabaseDesign = null;
    try {
      const supabase = await getClientSupabaseClient(user.tenantId);
      if (supabase) {
        console.log(`[RoomDesign GET] Dados locais ausentes, tentando Supabase para tenant: ${user.tenantId}`);

        const { data, error } = await supabase
          .from('hms_100ms_config')
          .select('room_design_config')
          .eq('tenant_id', user.tenantId)
          .maybeSingle();

        if (error) {
          console.warn(`[RoomDesign GET] Erro ao buscar do Supabase com tenant filter:`, error.message, error.code);
          if (error.code === 'PGRST116' || error.code === '42P01') {
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('hms_100ms_config')
              .select('room_design_config')
              .limit(1)
              .maybeSingle();

            if (!fallbackError && fallbackData?.room_design_config) {
              supabaseDesign = fallbackData.room_design_config;
              console.log(`[RoomDesign GET] roomDesignConfig encontrado no Supabase (fallback sem tenant)`);
            }
          }
        } else if (data?.room_design_config) {
          supabaseDesign = data.room_design_config;
          console.log(`[RoomDesign GET] roomDesignConfig encontrado no Supabase para tenant: ${user.tenantId}`);
        }
      }
    } catch (sbErr: any) {
      console.error('[RoomDesign GET] Erro ao buscar do Supabase:', sbErr?.message || sbErr);
    }

    res.json({
      roomDesignConfig: supabaseDesign || (config?.roomDesignConfig ?? null),
      tenantId: user.tenantId
    });

  } catch (error: any) {
    console.error('[RoomDesign] Erro ao buscar:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração de design' });
  }
});

// Save room design config for current tenant
meetingsRouter.patch('/room-design', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const { roomDesignConfig } = req.body;
    if (!roomDesignConfig) {
      return res.status(400).json({ error: 'roomDesignConfig é obrigatório' });
    }

    // Salvar no DB local
    const [existingConfig] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (existingConfig) {
      await db.update(hms100msConfig)
        .set({
          roomDesignConfig: roomDesignConfig,
          updatedAt: new Date()
        })
        .where(eq(hms100msConfig.tenantId, user.tenantId));
    } else {
      await db.insert(hms100msConfig).values({
        tenantId: user.tenantId,
        roomDesignConfig: roomDesignConfig,
        appAccessKey: 'placeholder_key',
        appSecret: 'placeholder_secret',
        updatedAt: new Date(),
        apiBaseUrl: 'https://api.100ms.live/v2'
      });
    }

    console.log(`[RoomDesign] Salvo no DB local para tenant ${user.tenantId}`);

    invalidateAllMeetingDesignCaches();
    console.log(`[RoomDesign] Cache de design público invalidado`);

    let supabaseSyncSuccess = false;
    try {
      const supabase = await getClientSupabaseClient(user.tenantId);
      if (supabase) {
        console.log(`[RoomDesign] Sincronizando com Supabase para tenant: ${user.tenantId}`);

        const { data: existingData, error: selectError } = await supabase
          .from('hms_100ms_config')
          .select('id, room_design_config')
          .eq('tenant_id', user.tenantId)
          .maybeSingle();

        if (selectError) {
          console.warn(`[RoomDesign] Erro ao verificar Supabase (table may not exist):`, selectError.message, selectError.code);
          if (selectError.code === 'PGRST116' || selectError.code === '42P01') {
            console.log(`[RoomDesign] Tentando sem filtro de tenant...`);
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('hms_100ms_config')
              .select('id, room_design_config')
              .limit(1)
              .maybeSingle();

            if (!fallbackError && fallbackData) {
              const { error: updateError } = await supabase
                .from('hms_100ms_config')
                .update({
                  room_design_config: roomDesignConfig,
                  updated_at: new Date().toISOString()
                })
                .eq('id', fallbackData.id);

              if (updateError) {
                console.error(`[RoomDesign] Erro ao atualizar no Supabase (fallback):`, updateError.message);
              } else {
                console.log(`[RoomDesign] Sucesso ao sincronizar com Supabase (fallback, sem tenant_id)`);
                supabaseSyncSuccess = true;
              }
            } else if (!fallbackError && !fallbackData) {
              const { error: insertError } = await supabase
                .from('hms_100ms_config')
                .insert({
                  room_design_config: roomDesignConfig,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });

              if (insertError) {
                console.error(`[RoomDesign] Erro ao inserir no Supabase (fallback):`, insertError.message);
              } else {
                console.log(`[RoomDesign] Inserido no Supabase (fallback, sem tenant_id)`);
                supabaseSyncSuccess = true;
              }
            }
          }
        } else if (existingData) {
          console.log(`[RoomDesign] Atualizando registro existente no Supabase para tenant: ${user.tenantId}`);
          const { error: updateError } = await supabase
            .from('hms_100ms_config')
            .update({
              room_design_config: roomDesignConfig,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingData.id);

          if (updateError) {
            console.error(`[RoomDesign] Erro ao atualizar no Supabase:`, updateError.message);
          } else {
            console.log(`[RoomDesign] Sucesso ao sincronizar com Supabase para tenant: ${user.tenantId}`);
            supabaseSyncSuccess = true;
          }
        } else {
          console.log(`[RoomDesign] Criando novo registro no Supabase para tenant: ${user.tenantId}`);
          const { error: insertError } = await supabase
            .from('hms_100ms_config')
            .insert({
              tenant_id: user.tenantId,
              room_design_config: roomDesignConfig,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            console.error(`[RoomDesign] Erro ao inserir no Supabase:`, insertError.message, insertError.code);
            if (insertError.code === '42703' || insertError.message?.includes('tenant_id')) {
              console.log(`[RoomDesign] Tentando inserir sem tenant_id...`);
              const { error: retryError } = await supabase
                .from('hms_100ms_config')
                .insert({
                  room_design_config: roomDesignConfig,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              if (!retryError) {
                console.log(`[RoomDesign] Inserido no Supabase sem tenant_id`);
                supabaseSyncSuccess = true;
              } else {
                console.error(`[RoomDesign] Falhou novamente:`, retryError.message);
              }
            }
          } else {
            console.log(`[RoomDesign] Sucesso ao inserir no Supabase para tenant: ${user.tenantId}`);
            supabaseSyncSuccess = true;
          }
        }
      } else {
        console.warn(`[RoomDesign] Supabase client nao disponivel para tenant: ${user.tenantId}`);
      }
    } catch (sbErr: any) {
      console.error('[RoomDesign] Erro critico ao sincronizar com Supabase:', sbErr?.message || sbErr);
    }

    res.json({
      success: true,
      message: supabaseSyncSuccess
        ? 'Configurações salvas e sincronizadas com Supabase!'
        : 'Configurações salvas no banco local (Supabase indisponível)',
      supabaseSynced: supabaseSyncSuccess
    });
  } catch (error: any) {
    console.error('[RoomDesign] Erro ao salvar:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// =========================================================
// Rotas com parâmetro :id
// =========================================================

// Update a meeting
meetingsRouter.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    const { titulo, descricao, dataInicio, dataFim, duracao, status, participantes } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (titulo !== undefined) updateData.titulo = titulo;
    if (descricao !== undefined) updateData.descricao = descricao;
    if (dataInicio !== undefined) updateData.dataInicio = new Date(dataInicio);
    if (dataFim !== undefined) updateData.dataFim = new Date(dataFim);
    if (duracao !== undefined) updateData.duracao = duracao;
    if (status !== undefined) updateData.status = status;
    if (participantes !== undefined) updateData.participantes = participantes;

    const baseUrl = process.env.APP_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || req.get('host') || 'localhost:5000';
    const companySlug = await getCompanySlug(user.tenantId);
    
    // Se o linkReuniao estiver vazio ou nulo, gerar novos links
    if (!meeting.linkReuniao || !meeting.linkPublico) {
      updateData.linkReuniao = meeting.linkReuniao || `https://${baseUrl}/reuniao/${companySlug}/${meeting.id}`;
      updateData.linkPublico = meeting.linkPublico || `https://${baseUrl}/reuniao-publica/${companySlug}/${meeting.id}`;
    }

    const [updatedMeeting] = await db.update(reunioes)
      .set(updateData)
      .where(eq(reunioes.id, id as string))
      .returning();

    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      const sbUpdate: any = {};
      if (titulo !== undefined) sbUpdate.titulo = titulo;
      if (descricao !== undefined) sbUpdate.descricao = descricao;
      if (dataInicio !== undefined) sbUpdate.data_inicio = new Date(dataInicio).toISOString();
      if (dataFim !== undefined) sbUpdate.data_fim = new Date(dataFim).toISOString();
      if (duracao !== undefined) sbUpdate.duracao = duracao;
      if (status !== undefined) sbUpdate.status = status;
      if (participantes !== undefined) sbUpdate.participantes = participantes;
      
      // Incluir novos links se gerados
      if (updateData.linkReuniao) sbUpdate.link_reuniao = updateData.linkReuniao;
      if (updateData.linkPublico) sbUpdate.link_publico = updateData.linkPublico;

      await supabase.from('reunioes')
        .update(sbUpdate)
        .eq('id', id);
    }

    res.json({ success: true, data: updatedMeeting });

  } catch (error: any) {
    console.error('[Meetings] Erro ao atualizar reunião:', error);
    res.status(500).json({ error: 'Erro ao atualizar reunião' });
  }
});

// Delete a meeting
meetingsRouter.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    await db.delete(reunioes).where(eq(reunioes.id, id as string));

    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      // 🔐 MULTI-TENANT: filtrar por tenant_id para não deletar reuniões de outros tenants
      await supabase.from('reunioes').delete().eq('id', id).eq('tenant_id', user.tenantId);
    }

    res.json({ success: true });

  } catch (error: any) {
    console.error('[Meetings] Erro ao deletar reunião:', error);
    res.status(500).json({ error: 'Erro ao deletar reunião' });
  }
});

// Get single meeting
meetingsRouter.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    res.json({ success: true, data: meeting });

  } catch (error: any) {
    console.error('[Meetings] Erro ao buscar:', error);
    res.status(500).json({ error: 'Erro ao buscar reunião' });
  }
});

// Generate token for authenticated user (POST method - used by frontend)
// This endpoint gives the "host" role to authenticated users
meetingsRouter.post('/:id/token', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userName } = req.body;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    if (!meeting.roomId100ms) {
      return res.status(400).json({ error: 'Reunião sem sala 100ms configurada' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    // Use userName from request body or user.name or default to 'Host'
    const participantName = userName || user.name || 'Host';

    const hostToken = gerarTokenParticipante(
      meeting.roomId100ms,
      participantName,
      'host',
      appAccessKey,
      appSecret
    );

    console.log(`[Meetings] Token de host gerado para ${participantName} na reunião ${id}`);

    res.json({
      token: hostToken,
      role: 'host',
      roomId: meeting.roomId100ms
    });

  } catch (error: any) {
    console.error('[Meetings] Erro ao gerar token:', error);
    res.status(500).json({ error: 'Erro ao gerar token de host' });
  }
});

// Get host token for a meeting
meetingsRouter.get('/:id/host-token', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    if (!meeting.roomId100ms) {
      return res.status(400).json({ error: 'Reunião sem sala 100ms configurada' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    const hostToken = gerarTokenParticipante(
      meeting.roomId100ms,
      user.name || 'Host',
      'host',
      appAccessKey,
      appSecret
    );

    res.json({ token: hostToken });

  } catch (error: any) {
    console.error('[Meetings] Erro ao gerar token:', error);
    res.status(500).json({ error: 'Erro ao gerar token de host' });
  }
});

// Get guest token for a meeting (public access)
meetingsRouter.get('/:id/guest-token', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, pid } = req.query;

    const participantName = (name as string) || 'Participante';
    const participantId = pid as string | undefined;

    const [meeting] = await db.select().from(reunioes)
      .where(eq(reunioes.id, id as string))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    if (!meeting.roomId100ms) {
      return res.status(400).json({ error: 'Reunião sem sala 100ms configurada' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, meeting.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    const guestToken = gerarTokenParticipante(
      meeting.roomId100ms,
      participantName,
      'guest',
      appAccessKey,
      appSecret
    );

    // Mark meeting as attended if not already
    if (!meeting.compareceu) {
      await db.update(reunioes)
        .set({ compareceu: true, updatedAt: new Date() })
        .where(eq(reunioes.id, id as string));

      // Sync to Supabase
      const supabase = await getClientSupabaseClient(meeting.tenantId);
      if (supabase) {
        await supabase.from('reunioes')
          .update({ compareceu: true })
          .eq('id', id);
      }
    }

    res.json({
      token: guestToken,
      participantId: participantId || meeting.participantId || null
    });

  } catch (error: any) {
    console.error('[Meetings] Erro ao gerar token de guest:', error);
    res.status(500).json({ error: 'Erro ao gerar token de participante' });
  }
});

// Update meeting status
meetingsRouter.patch('/:id/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const validStatuses = ['agendada', 'em_andamento', 'concluida', 'cancelada'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    await db.update(reunioes)
      .set({ status, updatedAt: new Date() })
      .where(eq(reunioes.id, id as string));

    // Sync to Supabase
    const supabase = await getClientSupabaseClient(user.tenantId);
    if (supabase) {
      await supabase.from('reunioes')
        .update({ status })
        .eq('id', id);
    }

    res.json({ success: true, status });

  } catch (error: any) {
    console.error('[Meetings] Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status da reunião' });
  }
});

// List recordings for a meeting
meetingsRouter.get('/:id/recordings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    const recordings = await db.select().from(gravacoes)
      .where(eq(gravacoes.reuniaoId, id))
      .orderBy(desc(gravacoes.startedAt));

    res.json(recordings);

  } catch (error: any) {
    console.error('[Meetings] Erro ao listar gravações:', error);
    res.status(500).json({ error: 'Erro ao listar gravações' });
  }
});

// Start recording
meetingsRouter.post('/:id/recordings/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [meeting] = await db.select().from(reunioes)
      .where(and(
        eq(reunioes.id, id as string),
        eq(reunioes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!meeting) {
      return res.status(404).json({ error: 'Reunião não encontrada' });
    }

    if (!meeting.roomId100ms) {
      return res.status(400).json({ error: 'Reunião sem sala 100ms' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    // Insert recording record first
    const [newRecording] = await db.insert(gravacoes).values({
      reuniaoId: id,
      tenantId: user.tenantId,
      roomId100ms: meeting.roomId100ms,
      status: 'recording',
      startedAt: new Date(),
      metadata: {}
    }).returning();

    // Get meeting URL for bot - usar rota PUBLICA para filtrar o tile do bot
    const botSlug = await getCompanySlug(user.tenantId);
    const baseUrlBot = (process.env.BASE_URL || 'https://nexusemijoias.nexusintelligence.tech').replace(/\/$/,'');
    const meetingUrlForBot = `${baseUrlBot}/reuniao-publica/${botSlug}/${meeting.id}`;
    startBotRecording({ meetingUrl: meetingUrlForBot, recordingId: newRecording.id })
      .catch(err => console.error('[Recorder] Erro ao iniciar bot auth:', err));

    // Sync to Supabase
    await syncRecordingToSupabase(user.tenantId, newRecording);

    res.json({ success: true, recording: newRecording });

  } catch (error: any) {
    console.error('[Meetings] Erro ao iniciar gravação:', error);
    res.status(500).json({ error: 'Erro ao iniciar gravação' });
  }
});

// Stop recording
meetingsRouter.post('/:id/recordings/:recordingId/stop', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, recordingId } = req.params;
    const user = (req as any).user;

    if (!user?.tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const [recording] = await db.select().from(gravacoes)
      .where(and(
        eq(gravacoes.id, recordingId),
        eq(gravacoes.reuniaoId, id),
        eq(gravacoes.tenantId, user.tenantId)
      ))
      .limit(1);

    if (!recording) {
      return res.status(404).json({ error: 'Gravação não encontrada' });
    }

    const [config] = await db.select().from(hms100msConfig)
      .where(eq(hms100msConfig.tenantId, user.tenantId))
      .limit(1);

    if (!config || !config.appAccessKey || !config.appSecret) {
      return res.status(400).json({ error: 'Credenciais 100ms não configuradas' });
    }

    const appAccessKey = decrypt(config.appAccessKey);
    const appSecret = decrypt(config.appSecret);

    // Stop bot recording
    let updatedFields: any = { status: 'completed', stoppedAt: new Date(), updatedAt: new Date() };
    try {
      const { outputFile, duration } = await stopBotRecording(recordingId);
      updatedFields.fileUrl = `/gravacoes/${recordingId}.mp4`;
      updatedFields.duration = duration;
      // Transcricao: disponivel via POST /api/gravacoes/:id/transcribe (manual)
    } catch (botErr: any) {
      console.error('[Recorder] Erro ao parar bot auth:', botErr.message);
    }

    const [updatedRecording] = await db.update(gravacoes)
      .set(updatedFields)
      .where(eq(gravacoes.id, recordingId))
      .returning();

    // Sync to Supabase
    await syncRecordingToSupabase(user.tenantId, updatedRecording);

    res.json({ success: true, recording: updatedRecording });

  } catch (error: any) {
    console.error('[Meetings] Erro ao parar gravação:', error);
    res.status(500).json({ error: 'Erro ao parar gravação' });
  }
});


// GET /100ms/active-recordings - Lista gravacoes ativas do tenant (sem auth - sala publica)
publicRoomDesignRouter.get('/100ms/active-recordings', async (req: Request, res: Response) => {
  try {
    const tenantSlug = (req.session as any)?.tenantId || req.query.tenantSlug as string || req.headers['x-tenant-id'] as string || req.body?.tenantSlug;
    if (!tenantSlug) {
      return res.json([]);
    }
    const recordings = await db
      .select({
        id: gravacoes.id,
        reuniaoId: gravacoes.reuniaoId,
        roomId100ms: gravacoes.roomId100ms,
        recordingId100ms: gravacoes.recordingId100ms,
        status: gravacoes.status,
        startedAt: gravacoes.startedAt,
      })
      .from(gravacoes)
      .where(and(eq(gravacoes.tenantId, tenantSlug), eq(gravacoes.status, 'recording')))
      .orderBy(desc(gravacoes.startedAt))
      .limit(10);
    return res.json(recordings);
  } catch (error: any) {
    console.error('[ActiveRecordings Public] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


// GET /gravacoes - Lista gravacoes do tenant (aceita sessao, JWT Bearer ou x-tenant-id)
publicRoomDesignRouter.get('/gravacoes', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.session as any)?.tenantId
      || (() => {
           const auth = req.headers.authorization;
           if (auth && auth.startsWith('Bearer ')) {
             try {
               const jwt = require('jsonwebtoken');
               const secret = getJwtSecret();
               const d = jwt.verify(auth.split(' ')[1], secret) as any;
               return d.tenantId || d.clientId;
             } catch { return null; }
           }
           return null;
         })()
      || req.headers['x-tenant-id'] as string
      || req.query.tenantSlug as string;

    if (!tenantId) {
      return res.status(401).json({ error: 'Não autenticado', redirect: '/login' });
    }

    const rows = await db
      .select({
        id: gravacoes.id,
        reuniaoId: gravacoes.reuniaoId,
        tenantId: gravacoes.tenantId,
        roomId100ms: gravacoes.roomId100ms,
        recordingId100ms: gravacoes.recordingId100ms,
        status: gravacoes.status,
        startedAt: gravacoes.startedAt,
        stoppedAt: gravacoes.stoppedAt,
        duration: gravacoes.duration,
        fileUrl: gravacoes.fileUrl,
        fileSize: gravacoes.fileSize,
        thumbnailUrl: gravacoes.thumbnailUrl,
        createdAt: gravacoes.createdAt,
        updatedAt: gravacoes.updatedAt,
        metadata: gravacoes.metadata,
      })
      .from(gravacoes)
      .where(sql`${gravacoes.tenantId} = ${tenantId} AND ${gravacoes.startedAt} IS NOT NULL`)
      .orderBy(desc(gravacoes.startedAt))
      .limit(100);

    return res.json(rows);
  } catch (error: any) {
    console.error('[Gravacoes] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


// POST /api/gravacoes/:id/transcribe - Transcrever gravacao manualmente (sob demanda)
publicRoomDesignRouter.post('/gravacoes/:id/transcribe', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Usa o banco nexus (mesmo que GET /api/gravacoes e stop recording)
    const { Pool: NexusPool } = await import('pg');
    const nexusPool = new NexusPool({ connectionString: process.env.NEXUS_DATABASE_URL || process.env.DATABASE_URL_NEXUS });

    const result = await nexusPool.query(
      `SELECT id, status, file_url AS "fileUrl", metadata FROM gravacoes WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      await nexusPool.end();
      return res.status(404).json({ error: 'Gravacao nao encontrada' });
    }

    const recording = result.rows[0];

    if (recording.status !== 'completed') {
      await nexusPool.end();
      return res.status(400).json({ error: 'Gravacao nao concluida' });
    }
    if (!recording.fileUrl) {
      await nexusPool.end();
      return res.status(400).json({ error: 'Arquivo de video nao disponivel' });
    }

    // Verificar se ja tem transcricao (cache)
    const meta = recording.metadata || {};
    if (meta.transcript) {
      await nexusPool.end();
      return res.json({ success: true, transcript: meta.transcript, cached: true });
    }

    const videoFile = `/var/www/plataformacompleta/uploads${recording.fileUrl}`;

    // Verifica se arquivo existe no disco
    const fsCheck = await import('fs');
    if (!fsCheck.existsSync(videoFile)) {
      await nexusPool.end();
      return res.status(404).json({ error: `Arquivo de video nao encontrado no disco: ${recording.fileUrl}` });
    }

    // Marcar como transcrevendo
    const updatedMeta = { ...meta, transcribing: true };
    await nexusPool.query(
      `UPDATE gravacoes SET metadata = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedMeta), id]
    );

    res.json({ success: true, status: 'transcribing', message: 'Transcricao iniciada em background' });
    await nexusPool.end();

    // Pipeline correto: extrair audio -> whisper -> salvar no banco
    (async () => {
      const { Pool: BgPool } = await import('pg');
      const bgPool = new BgPool({ connectionString: process.env.NEXUS_DATABASE_URL || process.env.DATABASE_URL_NEXUS });
      try {
        const transcript = await transcribeRecording(videoFile);
        const finalMeta = { ...meta, transcript, transcribing: false, transcribedAt: new Date().toISOString() };
        await bgPool.query(
          `UPDATE gravacoes SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(finalMeta), id]
        );
        console.log(`[Transcribe Manual] Concluido | id=${id} chars=${transcript.length}`);
      } catch (err: any) {
        console.error('[Transcribe Manual] Erro:', err.message);
        const errMeta = { ...meta, transcribing: false, transcribeError: err.message };
        await bgPool.query(
          `UPDATE gravacoes SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(errMeta), id]
        ).catch(() => {});
      } finally {
        await bgPool.end().catch(() => {});
      }
    })();

  } catch (error: any) {
    console.error('[Transcribe Manual] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default meetingsRouter;
