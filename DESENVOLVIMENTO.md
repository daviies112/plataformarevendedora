# Guia de Desenvolvimento - ExecutiveAI Pro

## Stack Tecnológico

### Frontend
- React 18 + TypeScript + Vite
- TailwindCSS + shadcn/ui + Radix UI
- TanStack Query + Zustand (state management)
- React Router para navegação

### Backend
- Express.js + TypeScript
- PostgreSQL (Replit/Neon) com Drizzle ORM
- JWT Authentication
- Background jobs (FormPoller, CPFPoller, etc.)

### Integrations (Opcionais)
- Supabase (formulários avançados)
- BigDataCorp (validação CPF)
- Evolution API (WhatsApp Business)
- Upstash Redis (cache)
- Sentry (error tracking)
- 100ms (video conferencing)

## Estrutura do Projeto

```
src/
  ├── components/          # UI components reutilizáveis
  ├── features/           # Feature modules (formulários, kanban, etc.)
  ├── contexts/           # React contexts
  ├── hooks/              # Custom hooks
  ├── lib/                # Utilities e helpers
  ├── platforms/          # Desktop/mobile routing
  └── App.tsx            # Root component

server/
  ├── routes/            # API endpoints
  ├── lib/               # Services e utilities
  ├── middleware/        # Express middleware
  ├── services/          # Business logic
  └── index.ts          # Entry point

shared/
  └── db-schema.ts       # Drizzle ORM schema
```

## Iniciando o Projeto

```bash
# Instalar dependências
npm install

# Setup database
npm run db:push

# Desenvolvimento
npm run dev

# Build produção
npm run build
npm run start
```

## Configurações Necessárias

### Secrets (Replit)
- `JWT_SECRET` - Autenticação JWT
- `SESSION_SECRET` - Sessão de usuário
- `DATABASE_URL` - Conexão PostgreSQL

### Opcionais
- `SUPABASE_*` - Credenciais Supabase
- `BIGDATACORP_*` - API BigDataCorp
- `REDIS_URL` - Cache Redis
- `EVOLUTION_API_*` - WhatsApp Business
- `SENTRY_DSN` - Error tracking

## Deployment

Configurado para autoscale com:
- Build: `npm run build`
- Run: `npm run start`
- Port: 5000

## Próximas Otimizações

1. Code splitting automático (Vite já faz)
2. Image optimization (usar next/image ou sharp)
3. Database query optimization
4. CSS purging (TailwindCSS)
5. Bundle analysis com `npm run build -- --analyze`
