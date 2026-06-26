import { Request } from 'express';

/**
 * Resolve o tenant_id a partir da requisicao, seguindo a mesma
 * estrategia multitenant usada em /api/public/branding:
 *
 * 1. Query param: ?tenant=emerick
 * 2. Header: x-tenant-id
 * 3. Hostname/subdominio: emerick.nexusintelligence.tech -> 'emerick'
 *    (ignora hosts fixos como nexusemijoias / nexusemijoiasrevendedoras / localhost)
 *
 * Retorna '' (string vazia) se nao conseguir resolver.
 */
export function resolveTenantFromRequest(req: Request): string {
  // 1. Query param
  if (req.query.tenant && typeof req.query.tenant === 'string') {
    return req.query.tenant.trim();
  }

  // 2. Header x-tenant-id
  if (req.headers['x-tenant-id']) {
    return String(req.headers['x-tenant-id']).trim();
  }

  // 3. Subdominio do Host header
  const hostname = req.headers.host || '';
  const subdomain = hostname.split('.')[0];
  const FIXED_HOSTS = ['nexusemijoias', 'nexusemijoiasrevendedoras', 'localhost'];

  if (subdomain && !FIXED_HOSTS.includes(subdomain)) {
    return subdomain;
  }

  return '';
}
