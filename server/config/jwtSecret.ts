/**
 * Helper centralizado para obter o JWT secret.
 * Falha rapido (throw) se JWT_SECRET/SESSION_SECRET nao estiverem configurados,
 * em vez de degradar silenciosamente para uma chave vazia/previsivel.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET (ou SESSION_SECRET) nao configurado nas variaveis de ambiente');
  }
  return secret;
}
