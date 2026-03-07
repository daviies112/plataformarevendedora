import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    clientId: string;
    tenantId: string;
    // ===== MULTITENANT NÍVEL 2 (Revendedoras) =====
    role?: 'admin' | 'reseller';
    resellerId?: string;  // UUID único da revendedora (chave: CPF)
    cpfNormalizado?: string;
    comissao?: number;
  };
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    console.error('[auth] ❌ CRÍTICO: JWT_SECRET não configurado!');
  }
  return secret || '';
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  // Verificar se tem sessão válida (funciona em dev e prod)
  const sessionTenantId = req.session?.tenantId;
  const sessionUserId = req.session?.userId;
  const sessionEmail = req.session?.userEmail;
  const sessionRole = req.session?.userRole;
  const sessionComissao = req.session?.comissao;
  const sessionResellerId = req.session?.resellerId || req.session?.revendedoraId;
  const sessionCpf = req.session?.cpfNormalizado;
  
  if (sessionTenantId && sessionUserId) {
    req.user = {
      userId: sessionUserId,
      email: sessionEmail || '',
      clientId: sessionTenantId,
      tenantId: sessionTenantId,
      role: sessionRole || 'admin',
      resellerId: sessionResellerId,
      cpfNormalizado: sessionCpf,
      comissao: sessionComissao
    };
    return next();
  }
  
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      email: string;
      clientId: string;
      tenantId: string;
      resellerId?: string;
      cpfNormalizado?: string;
    };
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}
