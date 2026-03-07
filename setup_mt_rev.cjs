const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:230723Davi%23@103.199.187.145:5432/semijoias?sslmode=disable',
  ssl: false,
  connectionTimeoutMillis: 10000
});

async function main() {
  const client = await pool.connect();
  try {
    // 1. Ver tabelas com revendedor
    const tabelas = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%revend%' ORDER BY table_name"
    );
    console.log('TABELAS revendedora:', tabelas.rows.map(x => x.table_name).join(', '));

    // 2. Ver colunas da tabela revendedoras
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='revendedoras' ORDER BY ordinal_position"
    );
    console.log('\nColunas em revendedoras:');
    cols.rows.forEach(r => console.log('  -', r.column_name, ':', r.data_type));

    // 3. Adicionar tenant_id se não existir
    const hasTenant = cols.rows.some(r => r.column_name === 'tenant_id');
    if (!hasTenant) {
      await client.query('ALTER TABLE revendedoras ADD COLUMN IF NOT EXISTS tenant_id TEXT');
      console.log('\n✅ Coluna tenant_id adicionada!');
    } else {
      console.log('\n✅ Coluna tenant_id já existe');
    }

    // 4. Ver dados das revendedoras
    const revs = await client.query(
      'SELECT id, nome, email, cpf, admin_id, tenant_id, status FROM revendedoras ORDER BY created_at DESC LIMIT 20'
    );
    console.log('\nRevendedoras (primeiras 20):');
    revs.rows.forEach(r => {
      console.log(`  [${r.status}] ${r.nome} | email: ${r.email} | admin_id: ${r.admin_id} | tenant_id: ${r.tenant_id || 'VAZIO'}`);
    });

    // 5. Preencher tenant_id usando admin_id (pois admin_users está no Supabase, não aqui)
    // Neste banco local (PostgreSQL), usamos admin_id como tenant_id
    const update = await client.query(
      "UPDATE revendedoras SET tenant_id = admin_id WHERE (tenant_id IS NULL OR tenant_id = '') AND admin_id IS NOT NULL"
    );
    console.log('\n✅ Atualizado tenant_id =', update.rowCount, 'revendedoras com admin_id');

    // 6. Criar índices
    await client.query('CREATE INDEX IF NOT EXISTS idx_revend_tenant ON revendedoras(tenant_id)').catch(e => console.warn('idx:', e.message));
    await client.query('CREATE INDEX IF NOT EXISTS idx_revend_tenant_cpf ON revendedoras(tenant_id, cpf)').catch(e => console.warn('idx2:', e.message));
    console.log('✅ Índices criados');

    // 7. Verificar duplicatas no mesmo tenant
    const dups = await client.query(`
      SELECT tenant_id, regexp_replace(cpf, '[^0-9]', '', 'g') as cpf_clean, COUNT(*) as n
      FROM revendedoras WHERE cpf IS NOT NULL AND tenant_id IS NOT NULL
      GROUP BY tenant_id, regexp_replace(cpf, '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
    `);
    if (dups.rows.length > 0) {
      console.log('\n⚠️ CPFs duplicados no mesmo tenant:');
      dups.rows.forEach(d => console.log('  tenant:', d.tenant_id, 'cpf:', d.cpf_clean, 'x', d.n));
    } else {
      console.log('\n✅ Sem CPFs duplicados no mesmo tenant — isolamento OK!');
    }

    // 8. Resumo final
    const resumo = await client.query(
      'SELECT tenant_id, COUNT(*) as total FROM revendedoras GROUP BY tenant_id ORDER BY total DESC'
    );
    console.log('\n📊 Revendedoras por tenant_id:');
    resumo.rows.forEach(r => console.log('  tenant:', r.tenant_id, '->', r.total, 'revendedoras'));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
