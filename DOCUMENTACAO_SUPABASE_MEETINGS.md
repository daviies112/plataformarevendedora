# Documentação Técnica: Sincronização Multi-tenant com Supabase (Reuniões)

Este documento detalha a arquitetura e implementação do sistema de sincronização de agendamentos de reuniões entre o banco de dados local (PostgreSQL) e instâncias externas do Supabase em um ambiente multi-tenant.

## 1. Visão Geral da Arquitetura

O sistema utiliza uma abordagem de **Dual-Write** e **Sincronização por Demanda**. Isso garante que os dados estejam disponíveis localmente para performance e integridade, enquanto são replicados para o Supabase do cliente para transparência e integrações externas.

### Componentes Principais:
- **Frontend (React)**: Captura as credenciais do Supabase do `localStorage` e as injeta em headers HTTP customizados.
- **Middleware (Backend)**: Identifica o tenant e prepara o cliente Supabase dinâmico.
- **Serviço de Sincronização**: Gerencia a lógica de persistência em ambos os bancos.

---

## 2. Implementação no Frontend

O frontend atua como o provedor de contexto de credenciais. Sem a necessidade de uma aba de configuração específica na página de reuniões, ele utiliza as configurações globais do tenant.

### Injeção de Headers (`useReuniao.ts`):
Toda chamada para a API de reuniões inclui headers que informam ao backend qual instância do Supabase deve ser consultada.

```typescript
// Exemplo de implementação no hook de API
async function apiRequest(method: string, url: string, data?: unknown) {
  const headers: Record<string, string> = {};
  
  // Recupera credenciais do tenant salvas no navegador
  const supabaseUrl = localStorage.getItem('supabase_url');
  const supabaseKey = localStorage.getItem('supabase_key');

  if (supabaseUrl) headers["x-supabase-url"] = supabaseUrl;
  if (supabaseKey) headers["x-supabase-key"] = supabaseKey;
  
  return fetch(url, { method, headers, ... });
}
```

---

## 3. Implementação no Backend (Node.js/Express)

O backend é responsável por orquestrar a busca e salvamento dos dados.

### Busca de Dados com Fallback (`server/routes/meetings.ts`):
Ao listar reuniões, o servidor tenta primeiro o Supabase. Se falhar ou não estiver configurado, ele retorna os dados do banco local.

```typescript
router.get('/', async (req, res) => {
  const tenantId = req.user.tenantId;
  const { 'x-supabase-url': url, 'x-supabase-key': key } = req.headers;

  try {
    const supabase = await getDynamicSupabaseClient(tenantId, { url, key });
    if (supabase) {
      const { data } = await supabase.from('reunioes').select('*');
      if (data) return res.json({ success: true, data: normalize(data) });
    }
  } catch (err) {
    // Fallback para banco local
    const meetings = await db.select().from(reunioes).where(eq(reunioes.tenantId, tenantId));
    res.json({ success: true, data: meetings });
  }
});
```

### Salvamento e Sincronização (Dual-Write):
Ao criar uma reunião, o sistema salva no banco local e tenta uma inserção imediata no Supabase.

```typescript
router.post('/', async (req, res) => {
  // 1. Salva no banco local (Autoritativo)
  const [newMeeting] = await db.insert(reunioes).values(meetingData).returning();

  // 2. Sincroniza com Supabase em segundo plano
  try {
    const supabase = await getDynamicSupabaseClient(tenantId);
    if (supabase) {
      await supabase.from('reunioes').insert(formatForSupabase(newMeeting));
    }
  } catch (syncErr) {
    console.error('Falha na sincronização, mas dado salvo localmente');
  }
  
  res.status(201).json({ success: true, data: newMeeting });
});
```

---

## 4. Guia para Outras Plataformas (Melhores Práticas)

Para replicar esta funcionalidade em outras plataformas, siga estes 5 passos exaustivos:

### Passo 1: Padronização de Schema
Certifique-se de que a tabela `reunioes` no Supabase tenha colunas compatíveis com seu banco local. Use campos de `metadata` (JSONB) para armazenar configurações de design e logs de auditoria.

### Passo 2: Cliente Supabase Dinâmico
Não utilize uma única chave de API. Crie uma factory que gere clientes Supabase baseados no `tenant_id`. Isso isola os dados de diferentes clientes.

### Passo 3: Headers de Contexto
Utilize headers customizados (ex: `x-tenant-id`, `x-supabase-url`) em vez de passar credenciais no corpo da requisição (POST). Isso permite que métodos GET também sejam autenticados dinamicamente.

### Passo 4: Estratégia de Cache e Fallback
Sempre trate o banco de dados do cliente (Supabase) como um espelho. Se o Supabase estiver fora do ar, sua plataforma deve continuar funcionando com os dados locais.

### Passo 5: Normalização de Dados
Crie uma camada de mapeamento entre o banco local e o Supabase. Nomes de colunas no Supabase costumam usar `snake_case`, enquanto no código Node.js usamos `camelCase`. Um mapeador robusto evita erros de tipos.

---

## 5. Conclusão
Esta implementação remove a fricção do usuário ao automatizar a conexão. O sistema "aprende" as credenciais do tenant através do fluxo global e as aplica de forma transparente no módulo de reuniões, garantindo que o agendamento seja salvo e exibido instantaneamente em ambos os ambientes.