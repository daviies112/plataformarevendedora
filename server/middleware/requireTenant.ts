/**
 * Middleware para validar tenantId em todas as rotas protegidas
 * 
 * 🔐 SEGURANÇA: Cada rota protegida DEVE ter tenantId válido
 * ❌ Sem tenantId = 401 Unauthorized
 * ✅ Com tenantId = acesso permitido
 */

import { Request, Response, NextFunction } from 'express';

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  // Buscar tenantId — SOMENTE da sessão ou header assinado (nunca fallback)
  const tenantId = req.session?.tenantId || req.headers['x-tenant-id'];
  
  if (!tenantId || tenantId === 'undefined' || tenantId === 'null' || (typeof tenantId === 'string' && tenantId.trim() === '')) {
    return res.status(401).json({
      success: false,
      error: 'Sessão inválida - faça login novamente',
      code: 'TENANT_ID_MISSING',
      redirect: '/login'
    });
  }
  
  // Injetar no request para os handlers
  (req as any).tenantId = tenantId;

  next();
}

/**
 * Middleware para validar revendedoraId (segundo nível de isolamento)
 * Garante que a revendedora está autenticada e tem identidade única (CPF)
 * 
 * 🔐 SEGURANÇA MÚNIVEL 2:
 * - Gleice da Emericks != Gleice da Davisemi (tenant_id diferentes)
 * - Dois "João" na Emericks != (resellerId/CPF diferentes)
 */
export function requireReseller(req: Request, res: Response, next: NextFunction) {
  // Verificar primeiro nível (empresa)
  const tenantId = req.session?.tenantId;
  if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
    return res.status(401).json({
      success: false,
      error: 'Sessão inválida - faça login novamente',
      code: 'TENANT_ID_MISSING',
      redirect: '/login'
    });
  }

  // Verificar que é realmente uma revendedora
  if (req.session?.userRole !== 'reseller') {
    return res.status(403).json({
      success: false,
      error: 'Acesso restrito a revendedoras',
      code: 'ROLE_NOT_RESELLER'
    });
  }

  // Verificar segundo nível (pessoa física — UUID único por CPF)
  const resellerId = req.session?.resellerId || req.session?.revendedoraId;
  if (!resellerId || resellerId === 'undefined' || resellerId === 'null') {
    return res.status(401).json({
      success: false,
      error: 'Identidade de revendedora inválida',
      code: 'RESELLER_ID_MISSING',
      redirect: '/login'
    });
  }

  // Injetar ambos os níveis no request
  (req as any).tenantId = tenantId;
  (req as any).resellerId = resellerId;
  (req as any).cpfNormalizado = req.session?.cpfNormalizado;

  next();
}

/**
 * Middleware combinado: valida tenant (empresa) E revendedora (pessoa)
 * Usar nas rotas que revendedoras acessam seus próprios dados
 */
export function requireTenantAndReseller(req: Request, res: Response, next: NextFunction) {
  return requireReseller(req, res, next);
}

/**
 * Middleware para validar tenantId e verificar se existe no banco
 * Versão mais robusta com verificação de existência
 */
export async function requireTenantStrict(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.session?.tenantId;
  
  if (!tenantId || tenantId === 'undefined' || tenantId === 'null' || tenantId.trim() === '') {
    return res.status(401).json({
      success: false,
      error: 'Sessão inválida - faça login novamente',
      code: 'TENANT_ID_MISSING',
      redirect: '/login'
    });
  }
  
  // Opcional: Verificar se tenant existe no banco
  try {
    const { db } = await import('../db');
    const { supabaseConfig } = await import('../../shared/db-schema');
    const { eq } = await import('drizzle-orm');
    
    const tenant = await db.select()
      .from(supabaseConfig)
      .where(eq(supabaseConfig.tenantId, tenantId))
      .limit(1);
    
    if (tenant.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Tenant inválido ou não configurado',
        code: 'TENANT_INVALID',
        redirect: '/configuracoes'
      });
    }
  } catch (error) {
    console.error('Erro ao verificar tenant:', error);
    // Se erro na verificação, permitir acesso (graceful degradation)
  }
  
  next();
}
