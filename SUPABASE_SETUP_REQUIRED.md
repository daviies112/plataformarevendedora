# ⚠️ CONFIGURAÇÃO DO SUPABASE NECESSÁRIA

## 🚨 Ação Requerida

Para que a plataforma Nexus Intelligence funcione completamente, você precisa configurar as credenciais do Supabase.

**IMPORTANTE:** O sistema busca credenciais em 2 lugares (por ordem de prioridade):
1. **Banco de dados** (tabela `supabase_config`) ← RECOMENDADO
2. **Replit Secrets** (fallback)

### Opção 1: Configurar no Banco de Dados (RECOMENDADO)

Configure através da interface da aplicação em **/settings** ou diretamente no banco:

```sql
INSERT INTO supabase_config (supabase_url, supabase_anon_key)
VALUES ('sua-url-aqui', 'sua-chave-aqui');
```

### Opção 2: Configurar via Replit Secrets (Fallback)

Secrets faltando:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

---

## 📋 Passo a Passo para Configurar

### 1. Obter as Credenciais do Supabase

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto (ou crie um novo)
3. Vá em **Settings** > **API**
4. Copie:
   - **Project URL** → Use para `REACT_APP_SUPABASE_URL`
   - **anon/public key** → Use para `REACT_APP_SUPABASE_ANON_KEY`

### 2. Configurar no Replit

1. No Replit, clique no ícone de **🔒 Secrets** (cadeado) na barra lateral esquerda
2. Adicione os seguintes secrets:

**Secret 1:**
```
Key: REACT_APP_SUPABASE_URL
Value: https://seu-projeto.supabase.co
```

**Secret 2:**
```
Key: REACT_APP_SUPABASE_ANON_KEY
Value: sua-chave-anon-aqui
```

3. Clique em **Save** para cada secret

### 3. Reiniciar o Servidor

Após configurar os secrets, reinicie o workflow `dev-server` para que as mudanças tenham efeito.

**O sistema irá detectar automaticamente e conectar nas 12 tabelas do Supabase!**

---

## 📊 O Que Será Conectado Automaticamente

Quando você configurar os secrets, o sistema irá:

✅ **Workspace (3 tabelas):**
- workspace_pages
- workspace_databases  
- workspace_boards

✅ **Formulários (2 tabelas):**
- forms
- form_submissions

✅ **Produto (5 tabelas):**
- products
- suppliers
- resellers
- categories
- print_queue

✅ **Faturamento (1 tabela):**
- files

✅ **Dashboard (1 tabela):**
- dashboard_completo_v5_base

**Total: 12 tabelas conectadas automaticamente!**

---

## 📚 Documentação Adicional

- `SUPABASE_AUTO_SETUP.md` - Guia do sistema automático
- `SUPABASE_TABLES_MAPPING.md` - Detalhes de cada tabela
- `supabase-complete-schema.sql` - Scripts SQL para criar as tabelas
- `CONFIGURACAO_SUPABASE_COMPLETA.md` - Guia completo em português

---

## 🎯 Resultado Esperado

Após configurar, você verá no console do servidor:

```
╔════════════════════════════════════════╗
║  📊 SUPABASE AUTO-CONNECT - RESUMO   ║
╚════════════════════════════════════════╝
🌐 URL: https://seu-projeto.supabase.co
📊 Tabelas conectadas: 12/12

✅ Workspace: 3/3 tabelas
✅ Formulários: 2/2 tabelas
✅ Produto: 5/5 tabelas
✅ Faturamento: 1/1 tabelas
✅ Dashboard: 1/1 tabelas
```

---

**💡 Dica:** Este arquivo será removido automaticamente assim que você configurar os secrets!
