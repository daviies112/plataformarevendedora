# ExecutiveAI Pro - Multi-Tenant SaaS Platform

Plataforma completa de gestão de leads, formulários, conformidade CPF e WhatsApp Business.

## ⚡ Quick Start

```bash
npm install          # Instalar dependências
npm run db:push      # Sincronizar banco de dados
npm run dev          # Iniciar servidor (porta 5000)
```

**Login:** admin@example.com (senha gerada automaticamente nos logs)



## 🚀 Otimização de Export (Economize Créditos!)

**Problema:** Este projeto gasta ~500 créditos ao exportar sem otimização.

**Solução:** Com otimização, gasta apenas ~25 créditos (economia de 95%).

### Como Exportar

```bash
# ANTES de exportar
npm run export:clean

# Depois, no novo Replit
npm install
npm run db:push
npm run dev
```

Veja [DESENVOLVIMENTO.md](./DESENVOLVIMENTO.md) para guia completo.

---

## ✨ Recursos Principais

- 🎯 **Dashboard Executivo** - Métricas em tempo real
- 📝 **Formulários Públicos** - Criar e distribuir formulários customizados
- 🔐 **Validação CPF** - Conformidade e verificação em tempo real
- 💬 **WhatsApp Business** - Integração com Evolution API
- 📹 **Video Conferencing** - Reuniões via 100ms
- 🏷️ **Label Designer** - Criador de etiquetas estilo Canva
- 📊 **Workspace Notion** - Editor rico e databases
- 🌙 **UI Premium** - Dark theme com glassmorphism

---

## 🏗️ Tech Stack

**Frontend:**
- React 18 + TypeScript + Vite
- Tailwind CSS + Radix UI + Shadcn/ui
- React Query (TanStack)
- Wouter (routing)

**Backend:**
- Express.js + TypeScript
- PostgreSQL + Drizzle ORM
- JWT + Sessions
- Multi-tenant support

**Integrações (opcionais):**
- Pluggy.ai, Supabase, Google Calendar
- Evolution API (WhatsApp), N8N, Sentry, Resend

---

## 📁 Estrutura

```
src/              # Frontend React (components, hooks, pages)
server/           # Backend Express (routes, services, lib)
shared/           # Schema Drizzle ORM
public/           # Arquivos estáticos
package.json      # Dependências
```

---

## 🔧 Desenvolvimento

```bash
npm run dev              # Inicia servidor
npm run db:push          # Sincroniza schema
npm run build            # Build produção
npm start                # Inicia produção
```

---

## 📖 Documentação

Veja [DESENVOLVIMENTO.md](./DESENVOLVIMENTO.md) para guia técnico completo.

---

**Status:** ✅ Produção | **Port:** 5000 | **Database:** PostgreSQL
