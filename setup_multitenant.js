// Script para aplicar multitenant de dois níveis no banco da revendedora
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:230723Davi%23@103.199.187.145:5432/semijoias?sslmode=disable',
  ssl: false,
  connectionTimeoutMillis: 10000
});

async function run() {
  const client = await pool.connect();
  
  try {
    console.log('🔌 Conectado ao banco de dados...\n');

    // 1. Ver estado atual das revendedoras
    const check = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(tenant_id) as com_tenant_id,
        COUNT(DISTINCT admin_id) as admins_distintos
      FROM revendedoras
    `).catch(() => null);

    if (!check) {
      console.log('❌ Tabela revendedoras não acessível via query direta');
    } else {
      console.log('📊 Estado atual da tabela revendedoras:');
      console.log(check.rows[0]);
    }

    // 2. Ver colunas existentes
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'revendedoras'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Colunas da tabela revendedoras:');
    cols.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

    // 3. Verificar se tenant_id já existe
    const hasTenantId = cols.rows.some(r => r.column_name === 'tenant_id');

    if (!hasTenantId) {
      console.log('\n➕ Adicionando coluna tenant_id...');
      await client.query(`ALTER TABLE revendedoras ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
      console.log('✅ Coluna tenant_id adicionada!');
    } else {
      console.log('\n✅ Coluna tenant_id já existe');
    }

    // 4. Ver admin_users para mapear tenant_ids
    const admins = await client.query(`
      SELECT id, email, tenant_id, company_name 
      FROM admin_users 
      WHERE is_active = true
    `);
    
    console.log('\n👤 Admin users com tenant_id:');
    admins.rows.forEach(a => {
      console.log(`  - ${a.email}: tenant_id="${a.tenant_id || 'AUSENTE'}" id="${a.id}"`);
    });

    // 5. Preencher tenant_id nas revendedoras via JOIN com admin_users
    const updateResult = await client.query(`
      UPDATE revendedoras r
      SET tenant_id = au.tenant_id
      FROM admin_users au
      WHERE r.admin_id = au.id::text
        AND au.tenant_id IS NOT NULL
        AND au.tenant_id != ''
        AND (r.tenant_id IS NULL OR r.tenant_id = '')
    `);
    console.log(`\n✅ ${updateResult.rowCount} revendedoras atualizadas com tenant_id do admin`);

    // 6. Fallback: usar admin_id como tenant_id se ainda nulo
    const fallback = await client.query(`
      UPDATE revendedoras
      SET tenant_id = admin_id
      WHERE (tenant_id IS NULL OR tenant_id = '')
        AND admin_id IS NOT NULL
    `);
    console.log(`✅ ${fallback.rowCount} revendedoras com tenant_id = admin_id (fallback)`);

    // 7. Criar índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_revendedoras_tenant_id ON revendedoras(tenant_id)
    `).catch(e => console.warn('⚠️ Índice tenant_id:', e.message));
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_revendedoras_tenant_cpf ON revendedoras(tenant_id, cpf)
    `).catch(e => console.warn('⚠️ Índice tenant_cpf:', e.message));

    console.log('\n✅ Índices criados');

    // 8. Verificar resultado final
    const final = await client.query(`
      SELECT 
        r.tenant_id,
        r.admin_id,
        COUNT(*) as revendedoras,
        COUNT(DISTINCT regexp_replace(r.cpf, '[^0-9]', '', 'g')) as cpfs_unicos,
        au.company_name
      FROM revendedoras r
      LEFT JOIN admin_users au ON r.admin_id = au.id::text
      GROUP BY r.tenant_id, r.admin_id, au.company_name
      ORDER BY revendedoras DESC
    `);
    
    console.log('\n📊 RESULTADO FINAL — Revendedoras por tenant:');
    final.rows.forEach(r => {
      console.log(`  🏢 tenant_id: "${r.tenant_id}" (${r.company_name || 'empresa sem nome'})`);
      console.log(`     → ${r.revendedoras} revendedoras, ${r.cpfs_unicos} CPFs únicos`);
    });

    // 9. Verificar CPFs duplicados no mesmo tenant
    const dups = await client.query(`
      SELECT 
        tenant_id,
        regexp_replace(cpf, '[^0-9]', '', 'g') as cpf_normalizado,
        COUNT(*) as ocorrencias
      FROM revendedoras
      WHERE cpf IS NOT NULL AND cpf != '' AND tenant_id IS NOT NULL
      GROUP BY tenant_id, regexp_replace(cpf, '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
    `);
    
    if (dups.rows.length > 0) {
      console.log('\n⚠️ CPFs DUPLICADOS NO MESMO TENANT (problema de dados):');
      dups.rows.forEach(d => console.log(`  - tenant: ${d.tenant_id}, CPF: ${d.cpf_normalizado}, ocorrências: ${d.ocorrencias}`));
    } else {
      console.log('\n✅ Nenhum CPF duplicado no mesmo tenant — isolamento perfeito!');
    }

    console.log('\n🎉 Setup de multitenant dois níveis concluído!');
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.detail || '');
  } finally {
    client.release();
    pool.end();
  }
}

run();
