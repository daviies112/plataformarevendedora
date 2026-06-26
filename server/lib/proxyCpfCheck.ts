/**
 * proxyCpfCheck.ts
 * Proxy para consulta de CPF — delega TODA a lógica de análise para a
 * plataformacompleta (localhost:5001), que é a única com acesso direto
 * à BigDataCorp e ao engine completo (Motor1 + TrustScoreV2 + manual_review).
 *
 * A plataformarevendedora (5002) NÃO executa análise de CPF localmente.
 * Este arquivo substitui todas as chamadas diretas a checkCompliance().
 *
 * Backup pré-mudança em:
 *   /var/www/plataformarevendedora/BACKUPS/pre_compliance_removal_20260529_185330/
 */

const PLATAFORMA_COMPLETA_URL = 'http://localhost:5001';
const PROXY_TIMEOUT_MS = 30_000;

export interface ProxyCpfCheckOptions {
  tenantId?: string;
  leadId?: string;
  submissionId?: string;
  createdBy?: string;
  personName?: string;
  personPhone?: string;
  forceRefresh?: boolean;
  forceNewRecord?: boolean;
  userId?: string;
}

export interface ProxyCpfCheckResult {
  status: string;
  riskScore: number;
  checkId?: string;
  fromCache?: boolean;
  fromProxy: true;
  error?: string;
  [key: string]: any;
}

/**
 * Delega a consulta de CPF para a plataformacompleta via HTTP interno.
 * Retorna o resultado completo exatamente como a plataformacompleta retorna.
 * Em caso de falha de rede, lança erro para que o chamador possa logar e tratar.
 */
export async function proxyCpfCheck(
  cpf: string,
  options: ProxyCpfCheckOptions = {}
): Promise<ProxyCpfCheckResult> {
  const url = `${PLATAFORMA_COMPLETA_URL}/api/compliance/check`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, ...options }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await response.json() as any;

    if (!response.ok) {
      const msg = data?.error || `HTTP ${response.status} da plataformacompleta`;
      throw new Error(`[proxyCpfCheck] ${msg}`);
    }

    return { ...data, fromProxy: true };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`[proxyCpfCheck] Timeout após ${PROXY_TIMEOUT_MS}ms ao consultar plataformacompleta`);
    }
    throw err;
  }
}
