# 🚀 Guia Rápido - Página de Gravações

## ⏱️ Configuração em 5 Minutos

Viu a página `/gravacoes` mas ela está vazia? **Apenas 3 passos**:

### Passo 1: Supabase Credentials
Adicione nos **Replit Secrets** (cadeado):

```
REACT_APP_SUPABASE_URL = https://seu-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY = sua-chave-anonima
```

Como obter:
- Ir para https://supabase.com → Seu Projeto → Settings → API

### Passo 2: Sincronizar Banco
```bash
npm run db:push
```

### Passo 3: Reiniciar
- Workflow reiniciará automaticamente
- **Pronto!** Página funcionará

---

## 📖 Documentação Completa

Leia os arquivos na raiz do projeto:

| Arquivo | Para Quem? | O Quê? |
|---------|-----------|--------|
| **`GRAVACOES_IMPLEMENTATION.md`** | Desenvolvedores | Arquitetura completa, código, endpoints |
| **`GRAVACOES_EXPORT_CHECKLIST.md`** | Equipe de DevOps | Checklist de exportação e validação |
| **`GRAVACOES_SETUP.md`** | Você agora | Este guia rápido |

---

## ✨ O Que a Página Faz

```
┌────────────────────────────────┐
│ 📹 Página de Gravações         │
├────────────────────────────────┤
│                                │
│ ✅ Lista todas as gravações    │
│ ✅ Mostra data/hora/duração    │
│ ✅ Player para assistir        │
│ ✅ Download de vídeos          │
│ ✅ Deletar gravações           │
│                                │
│ 🔗 Conecta ao Supabase         │
│ 🔑 Multi-tenant automático     │
│                                │
└────────────────────────────────┘
```

---

## 🛠️ Troubleshooting

### "Não aparece nada na página"
```
1. Verificar se credenciais estão nos Secrets
2. Rodar: npm run db:push
3. Fazer login no sistema
4. Aguardar 30 segundos
5. Recarregar página (F5)
```

### "Erro 401"
```
Significa: Não autenticado
Solução: Faça login primeiro
```

### "RemotePath is missing"
```
Significa: Banco não sincronizado
Solução: npm run db:push --force
```

---

## 📝 Estrutura

A página é feita por:

1. **Hook** (`useGravacoes.ts`) - Busca dados do Supabase
2. **Página** (`Gravacoes.tsx`) - Renderiza tabela
3. **Backend** (`meetings.ts`) - 3 endpoints REST
4. **Banco** (tabela `gravacoes`) - Armazena dados

Tudo conectado e funcionando! ✅

---

## 🔄 Fluxo de Dados

```
Usuário acessa /gravacoes
        ↓
useGravacoes() busca do Supabase
        ↓
Tabela renderiza com dados
        ↓
Usuário clica "Assistir" → Video abre
Usuário clica "Deletar" → Confirmação → Remove
```

---

## 📱 Para Exportar Depois

Quando exportar/reimportar, leia:
- `GRAVACOES_EXPORT_CHECKLIST.md` - Garante nada será perdido

Ele tem checklist de todos os arquivos e passos.

---

## ✅ Verificação Rápida

Rodou tudo? Abra no navegador:
- http://localhost:5000/gravacoes

Deve mostrar:
- ✅ Página carrega sem erro
- ✅ Tabela aparece (vazia ou com dados)
- ✅ Botões funcionam

**Pronto!** 🎉

---

**Próximos passos?** Leia `GRAVACOES_IMPLEMENTATION.md` para entender a arquitetura completa.
