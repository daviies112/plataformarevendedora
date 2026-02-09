# ✅ Checklist de Exportação - Página de Gravações

## 🎯 Para Fazer Download/Exportação do Projeto

Quando você fizer o download para usar em outro lugar ou reimportar, **este checklist garante que nada será perdido**.

---

## 📋 Arquivos Essenciais a Verificar

### Frontend Components
- [x] `src/pages/Gravacoes.tsx` - Página principal de gravações
  - Componente React que renderiza tabela de gravações
  - Gerencia dialogs de playback
  - Integrado com useGravacoes hook
  - Status: ✅ CRIADO E FUNCIONANDO

- [x] `src/features/reuniao-platform/hooks/useGravacoes.ts` - Hook de dados
  - Conecta ao backend via TanStack React Query
  - Gerencia estado de gravações
  - Implementa delete e playback URLs
  - Padrão igual a useReuniao
  - Status: ✅ CRIADO E FUNCIONANDO

### Rotas e Navegação
- [x] `src/platforms/desktop/DesktopApp.tsx` - Rota registrada
  - Procure pela linha com `<Route path="/gravacoes"`
  - Deve estar importado: `import Gravacoes from "@/pages/Gravacoes"`
  - Deve estar no Switch de rotas
  - Status: ✅ REGISTRADO

### Backend Endpoints
- [x] `server/routes/meetings.ts` - Endpoints REST
  - Endpoint 1: `GET /api/reunioes/gravacoes/list` ✅
    - Busca todas as gravações com JOIN de reunioes
    - Filtra por tenant_id
    - Retorna lista com dados completos
  
  - Endpoint 2: `GET /api/reunioes/gravacoes/:id/url` ✅
    - Retorna presigned URL para playback
    - Valida status da gravação
    - Busca URL do 100ms se necessário
  
  - Endpoint 3: `DELETE /api/reunioes/gravacoes/:id` ✅
    - Deleta gravação do banco
    - Valida proprietário (tenant_id)
    - Invalida cache React Query

### Database Schema
- [x] `server/schema/schema.ts` - Tabela gravacoes
  - Campos obrigatórios:
    - `id` (UUID primary key)
    - `reuniao_id` (FK para reunioes)
    - `tenant_id` (FK para tenants)
    - `room_id_100ms`, `session_id_100ms`, `recording_id_100ms`
    - `status` (pending, processing, completed, failed)
    - `started_at`, `stopped_at`
    - `duration`, `file_url`, `file_size`
  - Status: ✅ CRIADO

- [x] `server/schema/schema.ts` - Tabela reunioes
  - Necessária para JOIN na query de gravações
  - Campos necessários: id, titulo, nome, email, dataInicio, dataFim
  - Status: ✅ JÁ EXISTE

### Documentação
- [x] `GRAVACOES_IMPLEMENTATION.md` - Documentação completa
  - Visão geral da arquitetura
  - Tabelas de banco e schema SQL
  - Implementação frontend com hook
  - Implementação backend com endpoints
  - Configuração Supabase
  - Fluxo completo de funcionamento
  - Status: ✅ CRIADO

- [x] `GRAVACOES_EXPORT_CHECKLIST.md` - Este arquivo
  - Checklist de exportação
  - Instruções de setup
  - Verificação de arquivos
  - Status: ✅ CRIADO

---

## 🔧 Credenciais Obrigatórias (Replit Secrets)

Sem estas, a página NÃO funcionará!

```
✅ REACT_APP_SUPABASE_URL
   - Exemplo: https://seu-projeto.supabase.co
   - Obter em: https://supabase.com → Project → Settings → API

✅ REACT_APP_SUPABASE_ANON_KEY
   - Exemplo: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   - Obter em: https://supabase.com → Project → Settings → API
```

**Como adicionar no Replit**:
1. Clique em "Secrets" (cadeado) no painel lateral
2. Clique em "Create Secret"
3. Nome: `REACT_APP_SUPABASE_URL`
4. Valor: `https://seu-projeto.supabase.co`
5. Salve
6. Repita para `REACT_APP_SUPABASE_ANON_KEY`
7. Reinicie o workflow

---

## 🗄️ Verificação de Banco de Dados

Ao importar em um novo lugar:

```bash
# 1. Verificar e criar tabelas
npm run db:push

# 2. Se tiver conflitos, forçar sincronização
npm run db:push --force

# 3. Verificar status
npm run db:check
```

---

## 🚀 Pós-Importação: Passos Obrigatórios

### Passo 1: Verificar Arquivos
```
[ ] src/pages/Gravacoes.tsx existe?
[ ] src/features/reuniao-platform/hooks/useGravacoes.ts existe?
[ ] server/routes/meetings.ts contém /gravacoes/list endpoint?
[ ] src/platforms/desktop/DesktopApp.tsx registra rota /gravacoes?
```

### Passo 2: Configurar Supabase
```
[ ] Você tem projeto Supabase criado?
[ ] REACT_APP_SUPABASE_URL está em Replit Secrets?
[ ] REACT_APP_SUPABASE_ANON_KEY está em Replit Secrets?
```

### Passo 3: Preparar Banco
```
[ ] Rodou npm run db:push?
[ ] Tabela gravacoes foi criada?
[ ] Tabela reunioes já existe?
```

### Passo 4: Testar
```
[ ] Workflow iniciou sem erros?
[ ] Página http://localhost:5000/gravacoes carrega?
[ ] Mostra "Nenhuma gravação encontrada" (estado correto)?
[ ] Consegue fazer login?
```

---

## 📱 Testes de Funcionalidade

Após setup completo, teste:

```
TESTE 1: Carregar Página
  [ ] Acesse /gravacoes
  [ ] Página carrega sem erros
  [ ] Mostra "Nenhuma gravação encontrada" (correto se sem dados)

TESTE 2: Listar Gravações (se houver dados)
  [ ] Tabela renderiza com gravações
  [ ] Campos visíveis: Reunião, Data/Hora, Status, Duração, Tamanho
  [ ] Botões aparecem: Assistir, Download (se disponível), Deletar

TESTE 3: Playback
  [ ] Clique em "Assistir"
  [ ] Dialog abre com video player
  [ ] URL presignada é gerada corretamente
  [ ] Vídeo exibe (ou mostra erro apropriado)

TESTE 4: Delete
  [ ] Clique em "Deletar"
  [ ] Confirmação aparece
  [ ] Clique em "Excluir"
  [ ] Gravação é removida da tabela
  [ ] React Query invalida cache
```

---

## 🔍 Como Verificar Se Está Tudo Correto

### Verificação 1: Arquivos Existem
```bash
# No terminal do Replit, rodar:
ls -la src/pages/Gravacoes.tsx
ls -la src/features/reuniao-platform/hooks/useGravacoes.ts
ls -la server/routes/meetings.ts
```

Deve retornar caminhos dos arquivos sem "No such file" error.

### Verificação 2: Endpoints Existem
```bash
# Grep para verificar endpoints
grep -n "gravacoes/list" server/routes/meetings.ts
grep -n "gravacoes/:id/url" server/routes/meetings.ts
grep -n "DELETE.*gravacoes" server/routes/meetings.ts
```

Deve retornar linhas com os endpoints.

### Verificação 3: Rota Registrada
```bash
# Verificar se rota foi registrada
grep -n "Gravacoes" src/platforms/desktop/DesktopApp.tsx
grep -n "/gravacoes" src/platforms/desktop/DesktopApp.tsx
```

Deve retornar linhas com a rota.

### Verificação 4: Schema Existe
```bash
# Verificar tabela gravacoes no schema
grep -n "gravacoes.*defineTable\|export const gravacoes" server/schema/schema.ts
```

Deve retornar definição da tabela.

---

## 📦 Estrutura Esperada Após Importação

```
projeto/
├── src/
│   ├── pages/
│   │   ├── Gravacoes.tsx                    ✅ DEVE EXISTIR
│   │   ├── Home.tsx
│   │   ├── Reuniao.tsx
│   │   └── ...
│   ├── features/
│   │   └── reuniao-platform/
│   │       ├── hooks/
│   │       │   ├── useGravacoes.ts          ✅ DEVE EXISTIR
│   │       │   ├── useReuniao.ts
│   │       │   └── ...
│   │       └── ...
│   ├── platforms/
│   │   └── desktop/
│   │       └── DesktopApp.tsx               ✅ DEVE CONTER ROTA /gravacoes
│   └── ...
├── server/
│   ├── routes/
│   │   ├── meetings.ts                      ✅ DEVE CONTER 3 ENDPOINTS
│   │   └── ...
│   ├── schema/
│   │   ├── schema.ts                        ✅ DEVE CONTER TABELA gravacoes
│   │   └── ...
│   └── ...
├── GRAVACOES_IMPLEMENTATION.md              ✅ DOCUMENTAÇÃO COMPLETA
├── GRAVACOES_EXPORT_CHECKLIST.md            ✅ ESTE ARQUIVO
└── ...
```

---

## ⚠️ Problemas Comuns e Soluções

### Problema: "Página não encontrada (404)"
**Causa**: Rota não registrada em DesktopApp
**Solução**:
```typescript
// Em src/platforms/desktop/DesktopApp.tsx, adicione:
import Gravacoes from "@/pages/Gravacoes";

// No Switch de rotas:
<Route path="/gravacoes" component={Gravacoes} />
```

### Problema: "Cannot find module '@/features/reuniao-platform/hooks/useGravacoes'"
**Causa**: Arquivo useGravacoes.ts não foi criado
**Solução**: Copiar arquivo de outro projeto ou criar do zero usando código no GRAVACOES_IMPLEMENTATION.md

### Problema: "Gravações não carregam (lista vazia com erro 401)"
**Causa**: Usuário não autenticado
**Solução**: Fazer login primeiro na plataforma

### Problema: "RemotePath is missing"
**Causa**: Banco de dados não foi sincronizado
**Solução**: Rodar `npm run db:push --force`

### Problema: "Supabase credentials not found"
**Causa**: Secrets não foram configurados
**Solução**: Adicionar REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY nos Replit Secrets

---

## 📞 Verificação Rápida (5 minutos)

Se tiver dúvida se está tudo certo, execute:

```bash
#!/bin/bash
echo "🔍 Verificando implementação de Gravações..."

echo "1️⃣ Verificando arquivos..."
[ -f src/pages/Gravacoes.tsx ] && echo "   ✅ Gravacoes.tsx" || echo "   ❌ Gravacoes.tsx"
[ -f src/features/reuniao-platform/hooks/useGravacoes.ts ] && echo "   ✅ useGravacoes.ts" || echo "   ❌ useGravacoes.ts"

echo "2️⃣ Verificando endpoints..."
grep -q "gravacoes/list" server/routes/meetings.ts && echo "   ✅ GET /gravacoes/list" || echo "   ❌ GET /gravacoes/list"
grep -q "gravacoes/:id/url" server/routes/meetings.ts && echo "   ✅ GET /gravacoes/:id/url" || echo "   ❌ GET /gravacoes/:id/url"
grep -q "DELETE.*gravacoes" server/routes/meetings.ts && echo "   ✅ DELETE /gravacoes/:id" || echo "   ❌ DELETE /gravacoes/:id"

echo "3️⃣ Verificando rota..."
grep -q "Gravacoes" src/platforms/desktop/DesktopApp.tsx && echo "   ✅ Rota registrada" || echo "   ❌ Rota não registrada"

echo "4️⃣ Verificando schema..."
grep -q "gravacoes" server/schema/schema.ts && echo "   ✅ Tabela gravacoes" || echo "   ❌ Tabela gravacoes"

echo "✅ Verificação completa!"
```

---

## 🎓 Resumo para Próximas Exportações

**Lembrete**: Esta funcionalidade é COMPLETE e INDEPENDENTE. Ao exportar:

1. **Incluir estes arquivos** (SEMPRE):
   - `GRAVACOES_IMPLEMENTATION.md`
   - `GRAVACOES_EXPORT_CHECKLIST.md` (este)

2. **Verificar se existem** (os principais):
   - `src/pages/Gravacoes.tsx`
   - `src/features/reuniao-platform/hooks/useGravacoes.ts`

3. **Validar backend** (sempre):
   - `server/routes/meetings.ts` contém endpoints
   - `server/schema/schema.ts` contém tabela

4. **Configurar no novo local**:
   - Supabase credentials
   - Rodar `npm run db:push`
   - Reiniciar workflow

**Pronto!** A página funcionará imediatamente.

---

**Versão**: 1.0  
**Data**: Dezembro 2024  
**Status**: ✅ Checklist Completo e Pronto para Exportação
