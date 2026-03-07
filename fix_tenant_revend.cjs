// Script para corrigir tenant_id nas revendedoras do Supabase
const https = require('https');

const SUPABASE_URL = 'https://semijoias-supabase.y98g1d.easypanel.host';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

async function supabaseReq(path, method = 'GET', body = null, extra = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': bodyStr ? Buffer.byteLength(bodyStr) : 0,
        ...extra
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  // 1. Buscar todos admin_users com seus tenant_ids
  const admins = await supabaseReq('/rest/v1/admin_users?select=id,email,tenant_id,company_name&is_active=eq.true');
  const adminMap = {}; // id -> tenant_id
  const adminNames = {}; // id -> company_name
  
  console.log('👤 Admins encontrados:');
  if (Array.isArray(admins.data)) {
    admins.data.forEach(a => {
      adminMap[a.id] = a.tenant_id || a.id;
      adminNames[a.id] = a.company_name || a.email;
      console.log(`  ${a.email}: tenant_id="${adminMap[a.id]}" company="${adminNames[a.id]}"`);
    });
  } else {
    console.error('❌ Erro ao buscar admins:', admins.status, admins.data);
  }

  // 2. Buscar TODAS as revendedoras
  const revend = await supabaseReq('/rest/v1/revendedoras?select=id,nome,email,cpf,admin_id,tenant_id,status&order=created_at.desc');
  
  if (!Array.isArray(revend.data)) {
    console.error('❌ Erro ao buscar revendedoras:', revend.status, JSON.stringify(revend.data));
    return;
  }

  console.log(`\n📋 ${revend.data.length} revendedoras encontradas:`);
  revend.data.forEach(r => {
    const expectedTenant = adminMap[r.admin_id] || r.admin_id;
    const correct = r.tenant_id === expectedTenant;
    console.log(`  [${correct ? '✅' : '❌'}] ${r.nome || r.email} | admin: ${r.admin_id?.substring(0,8)}... | tenant_atual: "${r.tenant_id}" | tenant_correto: "${expectedTenant}"`);
  });

  // 3. Corrigir revendedoras com tenant_id errado
  const toFix = revend.data.filter(r => {
    const expectedTenant = adminMap[r.admin_id] || r.admin_id;
    return r.tenant_id !== expectedTenant;
  });

  console.log(`\n🔧 ${toFix.length} revendedoras precisam de correção de tenant_id`);

  if (toFix.length > 0) {
    for (const r of toFix) {
      const correctTenant = adminMap[r.admin_id] || r.admin_id;
      if (!correctTenant) {
        console.log(`  ⚠️ Sem tenant para ${r.nome} (admin_id: ${r.admin_id})`);
        continue;
      }
      
      const result = await supabaseReq(
        `/rest/v1/revendedoras?id=eq.${r.id}`,
        'PATCH',
        { tenant_id: correctTenant }
      );
      
      if (result.status >= 200 && result.status < 300) {
        console.log(`  ✅ ${r.nome}: tenant_id corrigido para "${correctTenant}"`);
      } else {
        console.log(`  ❌ ${r.nome}: erro ao corrigir: ${result.status} ${JSON.stringify(result.data)}`);
      }
    }
  }

  // 4. Verificar resultado final
  const after = await supabaseReq('/rest/v1/revendedoras?select=id,nome,email,cpf,admin_id,tenant_id,status');
  if (Array.isArray(after.data)) {
    console.log('\n📊 ESTADO FINAL — Revendedoras por tenant_id:');
    const byTenant = {};
    after.data.forEach(r => {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = [];
      byTenant[r.tenant_id].push(r);
    });
    Object.entries(byTenant).forEach(([tid, revs]) => {
      const adminEntry = Object.entries(adminMap).find(([aid, tid2]) => tid2 === tid);
      const empresa = adminEntry ? adminNames[adminEntry[0]] : 'Empresa desconhecida';
      console.log(`\n  🏢 tenant_id: "${tid}" (${empresa})`);
      console.log(`     ${revs.length} revendedoras:`);
      revs.forEach(r => {
        const cpfClean = (r.cpf || '').replace(/\D/g, '');
        console.log(`       - ${r.nome} | CPF: ${cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')} | status: ${r.status}`);
      });
    });

    // Verificar CPFs duplicados
    const cpfMap = {};
    after.data.forEach(r => {
      const key = `${r.tenant_id}:${(r.cpf || '').replace(/\D/g, '')}`;
      if (!cpfMap[key]) cpfMap[key] = [];
      cpfMap[key].push(r.nome);
    });
    const dups = Object.entries(cpfMap).filter(([, names]) => names.length > 1);
    if (dups.length > 0) {
      console.log('\n⚠️ CPFs DUPLICADOS NO MESMO TENANT:');
      dups.forEach(([key, names]) => console.log(`  ${key}: ${names.join(', ')}`));
    } else {
      console.log('\n✅ Nenhum CPF duplicado no mesmo tenant — isolamento perfeito!');
    }
  }

  console.log('\n🎉 Configuração de multitenant dois níveis concluída!');
}

main().catch(e => { console.error('ERRO FATAL:', e.message, e.stack); });
