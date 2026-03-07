// Script via REST API do Supabase para configurar multitenant dois níveis
const https = require('https');

const SUPABASE_URL = 'https://semijoias-supabase.y98g1d.easypanel.host';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

async function supabaseQuery(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function supabaseRpc(fn, params = {}) {
  return supabaseQuery(`/rest/v1/rpc/${fn}`, 'POST', params);
}

async function main() {
  console.log('🔌 Consultando Supabase...\n');

  // 1. Ver admin_users
  const admins = await supabaseQuery('/rest/v1/admin_users?select=id,email,tenant_id,company_name&is_active=eq.true');
  console.log('👤 Admin users:');
  if (Array.isArray(admins.data)) {
    admins.data.forEach(a => {
      console.log(`  - ${a.email}: tenant_id="${a.tenant_id || 'NÃO DEFINIDO'}" id="${a.id}"`);
    });
  } else {
    console.log('  Resposta:', JSON.stringify(admins.data));
  }

  // 2. Ver revendedoras
  const revends = await supabaseQuery('/rest/v1/revendedoras?select=id,nome,email,cpf,admin_id,tenant_id,status&limit=20');
  console.log('\n📋 Revendedoras (primeiras 20):');
  if (Array.isArray(revends.data)) {
    revends.data.forEach(r => {
      console.log(`  [${r.status}] ${r.nome} | admin_id: ${r.admin_id} | tenant_id: ${r.tenant_id || 'VAZIO'}`);
    });
  } else {
    console.log('  Resposta:', JSON.stringify(revends.data));
    
    // Tentar via RPC
    const rpcTest = await supabaseRpc('list_tables');
    console.log('  RPC test:', rpcTest.status, JSON.stringify(rpcTest.data).substring(0, 200));
  }

  // 3. Verificar se tenant_id existe via SQL RPC
  const sqlCheck = await supabaseRpc('exec_sql', {
    query: "SELECT column_name FROM information_schema.columns WHERE table_name='revendedoras' ORDER BY ordinal_position"
  }).catch(() => null);
  console.log('\n📊 SQL check result:', sqlCheck?.status, JSON.stringify(sqlCheck?.data)?.substring(0, 300));

  // 4. Verificar se a tabela tem a coluna tenant_id diretamente
  const testTenant = await supabaseQuery('/rest/v1/revendedoras?select=id,tenant_id&limit=1');
  console.log('\n🔍 Teste coluna tenant_id:', testTenant.status, JSON.stringify(testTenant.data));
}

main().catch(e => { console.error('ERRO:', e.message); });
