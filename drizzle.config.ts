import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './shared/db-schema.ts',
  out: './migrations',
  tablesFilter: ["!admins", "!sessoes", "!logs_acesso"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
