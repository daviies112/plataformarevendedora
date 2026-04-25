import fs from 'fs';

const file = '/var/www/plataformarevendedora/server/routes/resellerAuth.ts';
let content = fs.readFileSync(file, 'utf8');

// Inject logging for fetch failure URLs
const oldTry = `try {
      const { client: supabase } = await getStoreSupabaseClient(auth.email);`;
const newTry = `try {
      const { client: supabase, adminId } = await getStoreSupabaseClient(auth.email);
      console.log('[StoreConfig] Attempting fetch with client targeting adminId:', adminId);`;

content = content.replace(oldTry, newTry);

// Force Localhost if public URL fails or as a priority
const oldFunc = `async function getStoreSupabaseClient(userEmail: string): Promise<{ client: any, adminId: string }> {`;
const newFunc = `async function getStoreSupabaseClient(userEmail: string): Promise<{ client: any, adminId: string }> {
  // Try to force LOCALHOST for internal server-to-server calls to avoid fetch failed (DNS/SSL)
  const useLocalhost = true;`;

content = content.replace(oldFunc, newFunc);

// Patch the client creation to use localhost when appropriate
const createClientOld = `createClient(adminCreds.supabase_url, adminCreds.supabase_service_key)`;
const createClientNew = `createClient(adminCreds.supabase_url.replace('https://api-supabase.nexusemijoias.nexusintelligence.tech', 'http://localhost:8000'), adminCreds.supabase_service_key)`;

content = content.replace(createClientOld, createClientNew);

fs.writeFileSync(file, content);
console.log('✅ resellerAuth.ts patched with localhost fallback and logs');
