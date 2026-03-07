-- ============================================================
-- MULTITENANT DOIS NÍVEIS: plataformarevendedora-main
-- Nível 1: tenant_id (empresa/admin) 
-- Nível 2: revendedora_id (pessoa única por CPF)
-- ============================================================

-- 1. Garantir que a tabela revendedoras tem tenant_id canônico
-- O tenant_id deve ser igual ao admin_users.tenant_id da plataformacompleta
ALTER TABLE revendedoras ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE revendedoras ADD COLUMN IF NOT EXISTS company_slug TEXT;

-- 2. Preencher tenant_id vazio usando admin_users da tabela admin_users
-- (join pelo admin_id da revendedora com id/tenant_id do admin_users)
UPDATE revendedoras r
SET tenant_id = au.tenant_id
FROM admin_users au
WHERE r.admin_id = au.id::text
  AND (r.tenant_id IS NULL OR r.tenant_id = '');

-- Fallback: se ainda está nulo, usar admin_id como tenant_id
UPDATE revendedoras
SET tenant_id = admin_id
WHERE tenant_id IS NULL OR tenant_id = '';

-- 3. Criar índice para busca eficiente por tenant + cpf
CREATE INDEX IF NOT EXISTS idx_revendedoras_tenant_id ON revendedoras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revendedoras_tenant_cpf ON revendedoras(tenant_id, cpf);
CREATE INDEX IF NOT EXISTS idx_revendedoras_admin_tenant ON revendedoras(admin_id, tenant_id);

-- 4. Garantir unicidade: mesmo CPF não pode ter dois registros na mesma empresa
-- ATENÇÃO: dois CPFs iguais em empresas diferentes são PERMITIDOS (isolamento correto)
-- Mas o mesmo CPF em dois registros da mesma empresa é erro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_cpf_per_tenant'
  ) THEN
    -- Normalizar CPFs antes de criar a constraint
    UPDATE revendedoras SET cpf = regexp_replace(cpf, '[^0-9]', '', 'g') WHERE cpf IS NOT NULL;
    
    ALTER TABLE revendedoras 
    ADD CONSTRAINT unique_cpf_per_tenant UNIQUE (tenant_id, cpf);
    
    RAISE NOTICE '✅ Constraint unique_cpf_per_tenant criada';
  ELSE
    RAISE NOTICE '✅ Constraint unique_cpf_per_tenant já existe';
  END IF;
EXCEPTION WHEN others THEN
  RAISE WARNING '⚠️ Não foi possível criar constraint (pode haver CPFs duplicados): %', SQLERRM;
END;
$$;

-- 5. Tabelas de dados das revendedoras — garantir ambas as colunas
-- Exemplo: wallet_transactions (se existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_transactions') THEN
    ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS revendedora_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_tenant_reseller 
      ON wallet_transactions(tenant_id, revendedora_id);
    RAISE NOTICE '✅ wallet_transactions atualizada';
  END IF;
END;
$$;

-- 6. Tabela de pedidos — garantir ambas as colunas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS revendedora_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_reseller 
      ON orders(tenant_id, revendedora_id);
    RAISE NOTICE '✅ orders atualizada';
  END IF;
END;
$$;

-- 7. Tabela commissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commissions') THEN
    ALTER TABLE commissions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    ALTER TABLE commissions ADD COLUMN IF NOT EXISTS revendedora_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_commissions_tenant_reseller 
      ON commissions(tenant_id, revendedora_id);
    RAISE NOTICE '✅ commissions atualizada';
  END IF;
END;
$$;

-- 8. Verificar situação final
SELECT 
  'RESUMO: Revendedoras por tenant' as info,
  tenant_id,
  COUNT(*) as total,
  COUNT(DISTINCT cpf) as cpfs_unicos
FROM revendedoras
GROUP BY tenant_id
ORDER BY total DESC;

-- 9. Verificar se há CPFs duplicados no mesmo tenant (não deveria haver)
SELECT 
  tenant_id,
  cpf,
  COUNT(*) as ocorrencias
FROM revendedoras
WHERE cpf IS NOT NULL AND cpf != ''
GROUP BY tenant_id, cpf
HAVING COUNT(*) > 1;
