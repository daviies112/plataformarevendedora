# 📹 Implementação Completa - Página de Gravações (Recordings)

## 🎯 Visão Geral

A página **Gravações** é uma funcionalidade integrada da plataforma Nexus Intelligence que permite visualizar, gerenciar, assistir e baixar todas as gravações de reuniões. A página se conecta automaticamente ao Supabase e sincroniza dados da tabela `reunioes`, funcionando com o mesmo padrão das páginas Home, Calendário e Design.

### Arquitetura:
- **Frontend**: React com hooks customizados (useGravacoes)
- **Backend**: Express.js com endpoints REST
- **Banco de Dados**: Supabase PostgreSQL
- **State Management**: TanStack React Query v5
- **UI Components**: Shadcn UI

---

## 📊 Tabelas de Banco de Dados Envolvidas

### 1. Tabela: `gravacoes`
Armazena metadados de gravações de reuniões.

```sql
CREATE TABLE gravacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id UUID NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id_100ms VARCHAR NOT NULL,
  session_id_100ms VARCHAR NOT NULL,
  recording_id_100ms VARCHAR NOT NULL,
  asset_id VARCHAR,
  status VARCHAR DEFAULT 'pending' -- 'pending', 'processing', 'completed', 'failed'
  started_at TIMESTAMP NOT NULL,
  stopped_at TIMESTAMP,
  duration INTEGER, -- em segundos
  file_url VARCHAR, -- URL do arquivo gravado
  file_size BIGINT, -- tamanho em bytes
  thumbnail_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Tabela: `reunioes` (referenciada)
Contém informações sobre as reuniões que foram gravadas.

```sql
-- Campos relevantes usados pela página de Gravações:
CREATE TABLE reunioes (
  id UUID PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  nome VARCHAR, -- nome do participante/contato
  email VARCHAR,
  dataInicio TIMESTAMP,
  dataFim TIMESTAMP,
  tenant_id VARCHAR,
  -- ... outros campos
);
```

---

## 🔧 Implementação Frontend

### 1. Hook: `useGravacoes()`
**Localização**: `src/features/reuniao-platform/hooks/useGravacoes.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const API_BASE = "/api/reunioes";

async function apiRequest(method: string, url: string, data?: unknown) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {};
  
  // Headers dinâmicos do Supabase (para multi-tenant)
  const supabaseUrl = localStorage.getItem('supabase_url');
  const supabaseKey = localStorage.getItem('supabase_key');

  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (supabaseUrl) headers["x-supabase-url"] = supabaseUrl;
  if (supabaseKey) headers["x-supabase-key"] = supabaseKey;
  
  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }

  return response.json();
}

export function useGravacoes() {
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Busca o tenant ID do localStorage quando o componente monta
  useEffect(() => {
    const stored = localStorage.getItem('tenant_id');
    if (stored) {
      setTenantId(stored);
    }
  }, []);

  // 📌 Busca todas as gravações do tenant via API
  const { data: gravacoesList = [], isLoading, error, refetch } = useQuery({
    queryKey: [API_BASE, 'gravacoes', tenantId],
    queryFn: () => apiRequest("GET", `${API_BASE}/gravacoes/list`),
    enabled: !!tenantId,
    staleTime: 30 * 1000, // 30 segundos
  });

  // Mutation para deletar gravação
  const deleteGravacao = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${API_BASE}/gravacoes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_BASE, 'gravacoes'] });
    },
  });

  // Mutation para obter URL de playback
  const getPlaybackUrl = useMutation({
    mutationFn: (id: string) => apiRequest("GET", `${API_BASE}/gravacoes/${id}/url`),
  });

  return {
    gravacoes: gravacoesList,
    isLoading,
    error,
    refetch,
    deleteGravacao: deleteGravacao.mutate,
    getPlaybackUrl: getPlaybackUrl.mutate,
    isDeleting: deleteGravacao.isPending,
    isFetchingUrl: getPlaybackUrl.isPending,
  };
}
```

**Funcionalidades**:
- ✅ Busca todas as gravações do tenant
- ✅ Gerencia estado de carregamento
- ✅ Suporta delete de gravações
- ✅ Obtém URL de playback com presigned URLs
- ✅ Integrado com React Query para cache e invalidação

---

### 2. Página: `Gravações`
**Localização**: `src/pages/Gravacoes.tsx`

A página exibe uma tabela com todas as gravações, mostrando:
- **Título da Reunião** (da tabela reunioes)
- **Data e Hora** de início
- **Status** (pending, processing, completed, failed)
- **Duração** em minutos
- **Tamanho do arquivo**
- **Ações**: Assistir, Download, Deletar

**Estrutura da Interface**:
```
┌─────────────────────────────────────────────────────┐
│ Gravações                                           │
│ Visualize e gerencie as gravações das suas reuniões │
└─────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ Tabela de Gravações                                    │
├──────────────────────────────────────────────────────┤
│ Reunião │ Data/Hora │ Status │ Duração │ Tamanho │ Ações│
├──────────────────────────────────────────────────────┤
│ Reunião 1 │ 25/12/2024 14:30 │ ✓ │ 45 min │ 250 MB │ ... │
│ Reunião 2 │ 24/12/2024 10:15 │ ✓ │ 30 min │ 180 MB │ ... │
└──────────────────────────────────────────────────────┘

┌──────────────────────────┐
│ Dialog de Playback       │
│ [Video Player aqui]      │
│ [Controles de vídeo]     │
└──────────────────────────┘
```

**Fluxo de Dados**:
1. Componente monta → useGravacoes() é chamado
2. Hook busca tenant_id do localStorage
3. useQuery faz GET `/api/reunioes/gravacoes/list`
4. Backend retorna gravações com JOIN de reunioes
5. Página renderiza tabela com dados
6. Usuário clica "Assistir" → getPlaybackUrl() obtém URL
7. URL exibida em Dialog com Video Player

---

## 🖥️ Implementação Backend

### 1. Endpoints REST
**Localização**: `server/routes/meetings.ts`

#### `GET /api/reunioes/gravacoes/list`
Busca todas as gravações do tenant com informações da reunião.

```typescript
router.get('/gravacoes/list', async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const recordings = await db
      .select({
        id: gravacoes.id,
        reuniao_id: gravacoes.reuniao_id,
        tenant_id: gravacoes.tenant_id,
        room_id_100ms: gravacoes.room_id_100ms,
        session_id_100ms: gravacoes.session_id_100ms,
        recording_id_100ms: gravacoes.recording_id_100ms,
        status: gravacoes.status,
        started_at: gravacoes.started_at,
        stopped_at: gravacoes.stopped_at,
        duration: gravacoes.duration,
        file_url: gravacoes.file_url,
        file_size: gravacoes.file_size,
        thumbnail_url: gravacoes.thumbnail_url,
        created_at: gravacoes.created_at,
        reuniao: {
          id: reunioes.id,
          titulo: reunioes.titulo,
          nome: reunioes.nome,
          email: reunioes.email,
          dataInicio: reunioes.dataInicio,
          dataFim: reunioes.dataFim,
        },
      })
      .from(gravacoes)
      .leftJoin(reunioes, eq(gravacoes.reuniao_id, reunioes.id))
      .where(eq(gravacoes.tenant_id, tenantId))
      .orderBy(desc(gravacoes.created_at));

    return res.json({
      success: true,
      data: recordings,
    });
  } catch (error: any) {
    console.error('Error fetching recordings:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

#### `GET /api/reunioes/gravacoes/:id/url`
Retorna URL presignada para playback da gravação.

```typescript
router.get('/gravacoes/:id/url', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const recording = await db
      .select()
      .from(gravacoes)
      .where(
        and(
          eq(gravacoes.id, id),
          eq(gravacoes.tenant_id, tenantId)
        )
      )
      .limit(1);

    if (!recording.length) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    const rec = recording[0];
    
    if (rec.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'This recording failed and is not available for playback',
        status: 'failed',
      });
    }

    if (rec.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Recording is still processing',
        status: rec.status,
      });
    }

    // Se tiver URL direta, retornar
    if (rec.file_url) {
      return res.json({
        success: true,
        url: rec.file_url,
      });
    }

    // Caso contrário, gerar presigned URL do 100ms
    const { recordings } = await hmsManager.getRecordings(rec.session_id_100ms);
    const recordingData = recordings.find(r => r.id === rec.recording_id_100ms);

    if (!recordingData?.download_url) {
      return res.status(404).json({
        success: false,
        error: 'Recording download URL not found',
      });
    }

    return res.json({
      success: true,
      url: recordingData.download_url,
    });
  } catch (error: any) {
    console.error('Error getting recording URL:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

#### `DELETE /api/reunioes/gravacoes/:id`
Deleta uma gravação (soft delete ou hard delete conforme implementado).

```typescript
router.delete('/gravacoes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const recording = await db
      .select()
      .from(gravacoes)
      .where(
        and(
          eq(gravacoes.id, id),
          eq(gravacoes.tenant_id, tenantId)
        )
      )
      .limit(1);

    if (!recording.length) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    await db.delete(gravacoes).where(eq(gravacoes.id, id));

    return res.json({
      success: true,
      message: 'Recording deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting recording:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

---

## 🔐 Configuração Supabase (Essencial)

### Credenciais Necessárias

Para que a página funcione, as seguintes variáveis **devem estar configuradas no Replit Secrets**:

```
REACT_APP_SUPABASE_URL = "https://seu-projeto.supabase.co"
REACT_APP_SUPABASE_ANON_KEY = "sua-chave-anonima"
```

### Passo a Passo de Configuração

1. **Criar projeto no Supabase** (se não tiver)
   - Ir para https://supabase.com
   - Criar novo projeto
   - Aguardar inicialização

2. **Copiar credenciais**
   - Ir para "Settings" → "API"
   - Copiar "Project URL"
   - Copiar "anon public" key

3. **Adicionar ao Replit Secrets**
   - Clicar em "Secrets" no painel lateral
   - Adicionar:
     - `REACT_APP_SUPABASE_URL` = `https://seu-projeto.supabase.co`
     - `REACT_APP_SUPABASE_ANON_KEY` = `sua-chave-anonima`

4. **Executar migrações do banco**
   ```bash
   npm run db:push
   ```

5. **Reiniciar a aplicação**
   - Workflow será reiniciado automaticamente
   - Agora a página de Gravações funcionará

---

## 🗂️ Estrutura de Arquivos

```
projeto-raiz/
├── src/
│   ├── features/
│   │   └── reuniao-platform/
│   │       ├── hooks/
│   │       │   ├── useReuniao.ts       (hook para reuniões)
│   │       │   └── useGravacoes.ts     ✅ NOVO - hook para gravações
│   │       ├── pages/
│   │       │   ├── ReuniaoHubPage.tsx
│   │       │   ├── ReuniaoDashboardPage.tsx
│   │       │   └── ...
│   │       └── types/
│   │           └── index.ts
│   ├── pages/
│   │   ├── Reuniao.tsx
│   │   ├── Gravacoes.tsx              ✅ NOVA página
│   │   ├── Home.tsx
│   │   ├── RoomDesignSettings.tsx
│   │   └── ...
│   ├── platforms/
│   │   └── desktop/
│   │       └── DesktopApp.tsx          ✅ Contém rota para /gravacoes
│   └── ...
├── server/
│   ├── routes/
│   │   ├── meetings.ts                ✅ Contém endpoints de gravações
│   │   └── ...
│   ├── schema/
│   │   └── schema.ts                  ✅ Contém tabela gravacoes
│   └── ...
├── GRAVACOES_IMPLEMENTATION.md         ✅ Este arquivo de documentação
└── ...
```

---

## 📋 Checklist de Integração para Exportação Futura

Ao exportar o projeto, certifique-se de incluir:

- [ ] **Hook** `src/features/reuniao-platform/hooks/useGravacoes.ts`
- [ ] **Página** `src/pages/Gravacoes.tsx`
- [ ] **Rota** registrada em `src/platforms/desktop/DesktopApp.tsx`
- [ ] **Endpoints** em `server/routes/meetings.ts`:
  - [ ] `GET /api/reunioes/gravacoes/list`
  - [ ] `GET /api/reunioes/gravacoes/:id/url`
  - [ ] `DELETE /api/reunioes/gravacoes/:id`
- [ ] **Schema** em `server/schema/schema.ts`:
  - [ ] Tabela `gravacoes` com relacionamento a `reunioes`
- [ ] **Credenciais Supabase** em Replit Secrets:
  - [ ] `REACT_APP_SUPABASE_URL`
  - [ ] `REACT_APP_SUPABASE_ANON_KEY`
- [ ] **Este documento** `GRAVACOES_IMPLEMENTATION.md` na raiz

---

## 🚀 Como Funciona o Fluxo Completo

### 1. **Durante a Reunião** (Em ReuniaoHubPage)
```
Usuário inicia reunião → Clica "Gravar" → Sistema 100ms começa gravação
→ Evento gravado no sistema 100ms → Session ID salvo
```

### 2. **Após Reunião** (Automático)
```
Reunião encerra → Backend recebe webhook de gravação
→ 100ms processa vídeo → Metadata salvo em gravacoes table
→ Status muda para 'completed'
```

### 3. **Acessar Gravações** (Na página)
```
Usuário clica em "Gravações" → Página carrega
→ useGravacoes() busca do Supabase
→ Tabela renderiza com dados de gravacoes + reunioes (JOIN)
→ Usuário pode Assistir, Download, ou Deletar
```

### 4. **Assistir Gravação**
```
Usuário clica "Assistir" → getPlaybackUrl() chamado
→ Backend retorna presigned URL do 100ms
→ Dialog abre com Video Player
→ Vídeo pode ser pausado/retomado/assistido novamente
```

### 5. **Deletar Gravação**
```
Usuário clica "Deletar" → Confirmação em AlertDialog
→ DELETE /api/reunioes/gravacoes/:id
→ Registro removido do Supabase
→ React Query invalida cache
→ Tabela atualizada automaticamente
```

---

## 🔄 Sincronização com Supabase

A página de Gravações é **100% dependente do Supabase** para:

1. **Armazenamento de metadados** - tabela `gravacoes`
2. **Consultas de reuniões** - tabela `reunioes` (JOIN)
3. **Multi-tenant isolation** - field `tenant_id` filtra por usuário
4. **Persistência de dados** - Tudo salvo no banco PostgreSQL

**Basta adicionar as credenciais do Supabase** que tudo funciona automaticamente!

---

## 📝 Exemplo de Resposta da API

### GET `/api/reunioes/gravacoes/list`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "reuniao_id": "uuid-reuniao",
      "tenant_id": "tenant-123",
      "room_id_100ms": "abc123",
      "session_id_100ms": "sess_123",
      "recording_id_100ms": "rec_123",
      "status": "completed",
      "started_at": "2024-12-25T14:30:00Z",
      "stopped_at": "2024-12-25T15:15:00Z",
      "duration": 2700,
      "file_url": "https://100ms-recordings.s3.amazonaws.com/...",
      "file_size": 262144000,
      "thumbnail_url": "https://...",
      "created_at": "2024-12-25T15:16:00Z",
      "reuniao": {
        "id": "uuid-reuniao",
        "titulo": "Reunião com Cliente X",
        "nome": "João Silva",
        "email": "joao@example.com",
        "dataInicio": "2024-12-25T14:30:00Z",
        "dataFim": "2024-12-25T15:30:00Z"
      }
    }
  ]
}
```

---

## 🐛 Troubleshooting

### "Nenhuma gravação encontrada"
- ✅ Estado normal quando não há gravações
- Crie uma reunião e grave-a
- Aguarde 30-60 segundos para processamento
- Refresque a página

### "401 Unauthorized"
- ❌ Usuário não autenticado
- Faça login primeiro
- Verifique token no localStorage

### "RemotePath is missing"
- ❌ Campo obrigatório no Supabase não preenchido
- Verificar se migration foi executada corretamente
- Rodar `npm run db:push --force`

### Gravação não aparece
- ❌ Verificar tenant_id
- Verificar se webhook do 100ms foi recebido
- Verificar logs do servidor

---

## 💡 Recursos Importantes

- **Padrão de conexão**: Igual a Home, Calendário, Design (useReuniao pattern)
- **Cache**: 30 segundos entre requisições (staleTime)
- **Multi-tenant**: Isolado por tenant_id automaticamente
- **Authenticação**: Usa token JWT armazenado em localStorage

---

## 🎓 Para Próximas Exportações

Este documento serve como guia completo. Sempre que exportar:

1. **Incluir este arquivo** (`GRAVACOES_IMPLEMENTATION.md`)
2. **Verificar se todos os arquivos estão presentes** (ver Checklist acima)
3. **Validar credenciais Supabase** após importar
4. **Rodar migrações** (`npm run db:push`)
5. **Reiniciar workflow** para sincronizar

Com isso, a página funcionará **imediatamente após configurar Supabase**.

---

**Versão**: 1.0  
**Data**: Dezembro 2024  
**Status**: ✅ Completo e Funcional
