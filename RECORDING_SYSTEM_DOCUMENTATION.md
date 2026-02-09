# 📹 Sistema de Gravações - Documentação Completa

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Banco de Dados](#banco-de-dados)
4. [API Endpoints](#api-endpoints)
5. [Fluxo de Dados](#fluxo-de-dados)
6. [Componentes Frontend](#componentes-frontend)
7. [Estados & Controle](#estados--controle)
8. [Segurança & Multi-tenant](#segurança--multi-tenant)
9. [Tratamento de Erros](#tratamento-de-erros)
10. [Exemplos de Uso](#exemplos-de-uso)
11. [Troubleshooting](#troubleshooting)

---

## Visão Geral

O sistema de gravações permite que usuários gravem suas reuniões em tempo real, visualizem gravações posteriormente, e gerenciem seu histórico de gravações.

### Funcionalidades Principais
- ✅ **Iniciar/Parar Gravação** durante uma reunião ativa
- ✅ **Listar Gravações** do tenant com filtros e metadados
- ✅ **Reproduzir Gravações** em um modal com controles de vídeo
- ✅ **Deletar Gravações** de forma segura
- ✅ **Status em Tempo Real** (Gravando, Processando, Concluído, Falhou)
- ✅ **Integração 100ms** para gerenciamento de gravações
- ✅ **Multi-tenant** com isolamento de dados

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (Frontend)                        │
├──────────────────────────┬──────────────────────────────────┤
│  Meeting100ms Component  │     Página Gravacoes.tsx         │
│  - Botão Gravar          │  - Listar Gravações              │
│  - Estado de Gravação    │  - Reproduzir                    │
│  - Controles Audio/Video │  - Deletar                       │
└──────────────────────────┴──────────────────────────────────┘
                ↓                         ↓
        /api/reunioes/:id/          /api/reunioes/
        recording/start|stop         gravacoes/*
                ↓                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    SERVIDOR (Backend)                        │
├─────────────────────────────────────────────────────────────┤
│  server/routes/meetings.ts (Recording Routes)                │
│  - POST   /recording/start   → Iniciar gravação             │
│  - POST   /recording/stop    → Parar gravação               │
│  - GET    /gravacoes/list    → Listar todas                 │
│  - GET    /gravacoes/:id/url → URL presignada               │
│  - DELETE /gravacoes/:id     → Deletar                      │
└─────────────────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│              SERVIÇOS & INTEGRAÇÕES                          │
├─────────────────────────────────────────────────────────────┤
│  - 100ms API (iniciarGravacao, pararGravacao)               │
│  - Presigned URLs (obterUrlPresignadaAsset)                 │
│  - Banco de Dados PostgreSQL (Drizzle ORM)                  │
└─────────────────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│           ARMAZENAMENTO & BANCO DE DADOS                     │
├─────────────────────────────────────────────────────────────┤
│  - Tabela: gravacoes (metadados)                            │
│  - Cloud Storage: 100ms Asset Storage (vídeos)              │
│  - Índices para performance (reuniaoId, tenantId, status)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Banco de Dados

### Tabela: `gravacoes`

```sql
CREATE TABLE gravacoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniaoId         UUID NOT NULL REFERENCES reunioes(id),
  tenantId          TEXT NOT NULL,
  roomId100ms       TEXT,
  sessionId100ms    TEXT,
  recordingId100ms  TEXT,
  status            TEXT DEFAULT 'recording',
  startedAt         TIMESTAMP DEFAULT NOW(),
  stoppedAt         TIMESTAMP,
  duration          INTEGER,
  fileUrl           TEXT,
  fileSize          INTEGER,
  thumbnailUrl      TEXT,
  metadata          JSONB DEFAULT '{}',
  createdAt         TIMESTAMP DEFAULT NOW(),
  updatedAt         TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_gravacoes_reuniao ON gravacoes(reuniaoId);
CREATE INDEX idx_gravacoes_tenant ON gravacoes(tenantId);
CREATE INDEX idx_gravacoes_status ON gravacoes(status);
CREATE INDEX idx_gravacoes_room_id ON gravacoes(roomId100ms);
```

### Campos da Tabela

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `id` | UUID | Identificador único da gravação | `550e8400-e29b-41d4-a716-446655440000` |
| `reuniaoId` | UUID | Referência à reunião | `550e8400-e29b-41d4-a716-446655440000` |
| `tenantId` | TEXT | Identificador do tenant (isolamento) | `tenant_a` |
| `roomId100ms` | TEXT | ID da sala 100ms | `5f1c0a2c-b3d1-4e5f-9a1b-2c3d4e5f6a7b` |
| `sessionId100ms` | TEXT | ID da sessão 100ms | `session_123456789` |
| `recordingId100ms` | TEXT | ID da gravação no 100ms | `recording_987654321` |
| `status` | TEXT | Estado da gravação | `recording`, `completed`, `processing`, `failed` |
| `startedAt` | TIMESTAMP | Momento de início | `2025-12-29 15:30:00` |
| `stoppedAt` | TIMESTAMP | Momento de parada | `2025-12-29 15:45:00` |
| `duration` | INTEGER | Duração em segundos | `900` |
| `fileUrl` | TEXT | URL do arquivo de vídeo | `https://storage.100ms.live/...` |
| `fileSize` | INTEGER | Tamanho do arquivo em bytes | `524288000` |
| `thumbnailUrl` | TEXT | URL da miniatura | `https://storage.100ms.live/...thumb` |
| `metadata` | JSONB | Dados adicionais | `{"resolution": "1080p", "codec": "h264"}` |
| `createdAt` | TIMESTAMP | Data de criação do registro | `2025-12-29 15:30:00` |
| `updatedAt` | TIMESTAMP | Data da última atualização | `2025-12-29 15:45:00` |

### Estados Possíveis

```
┌──────────────┐
│  recording   │  ← Gravação em andamento (botão pressionado)
└──────┬───────┘
       │ (usuário clica novamente)
       ↓
┌──────────────┐
│ processing   │  ← 100ms processando arquivo
└──────┬───────┘
       │ (processamento concluído)
       ↓
┌──────────────┐
│  completed   │  ← Pronto para reprodução
└──────────────┘

Caso de erro:
       │ (erro durante gravação ou muito curta)
       ↓
┌──────────────┐
│   failed     │  ← Gravação falhou
└──────────────┘
```

---

## API Endpoints

### 1. Iniciar Gravação

**Endpoint:** `POST /api/reunioes/:id/recording/start`

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Rota:**
- `id` (UUID) - ID da reunião

**Body:**
```json
{
  "meetingUrl": "https://app.100ms.live/meeting/5f1c0a2c-b3d1-4e5f-9a1b-2c3d4e5f6a7b"
}
```

**Resposta Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "id": "recording_987654321",
    "session_id": "session_123456789",
    "status": "INITIALIZING"
  }
}
```

**Respostas de Erro:**

| Status | Código | Mensagem |
|--------|--------|----------|
| 404 | NOT_FOUND | Reunião não encontrada |
| 400 | NO_ROOM | Reunião ainda não iniciada - sala não existe |
| 400 | NO_CREDENTIALS | Credenciais do 100ms não configuradas |
| 500 | SERVER_ERROR | Erro ao iniciar gravação |

**Lógica:**
1. Valida se a reunião existe e pertence ao tenant
2. Verifica se a sala 100ms foi criada (`roomId100ms`)
3. Obtém credenciais do 100ms do tenant
4. Chama API do 100ms para iniciar gravação
5. Insere registro na tabela `gravacoes` com status `recording`

---

### 2. Parar Gravação

**Endpoint:** `POST /api/reunioes/:id/recording/stop`

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Rota:**
- `id` (UUID) - ID da reunião

**Body:** (vazio)

**Resposta Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "asset": {
      "id": "asset_123456789",
      "path": "https://storage.100ms.live/path/to/video.mp4",
      "type": "recording"
    }
  }
}
```

**Respostas de Erro:**

| Status | Mensagem |
|--------|----------|
| 404 | Reunião não encontrada |
| 400 | Reunião não possui sala associada |
| 400 | Credenciais do 100ms não configuradas |
| 500 | Erro ao parar gravação |

**Lógica:**
1. Valida reunião e sala 100ms
2. Obtém credenciais do 100ms
3. Chama API do 100ms para parar gravação
4. Atualiza registro na tabela `gravacoes`:
   - `status` → `completed`
   - `stoppedAt` → data/hora atual
   - `fileUrl` → URL do arquivo

---

### 3. Listar Gravações

**Endpoint:** `GET /api/reunioes/gravacoes/list`

**Autenticação:** Bearer Token obrigatório

**Query Parameters:** Nenhum

**Resposta Sucesso (200):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "reuniaoId": "550e8400-e29b-41d4-a716-446655440001",
    "tenantId": "tenant_a",
    "roomId100ms": "5f1c0a2c-b3d1-4e5f-9a1b-2c3d4e5f6a7b",
    "sessionId100ms": "session_123456789",
    "recordingId100ms": "recording_987654321",
    "status": "completed",
    "startedAt": "2025-12-29T15:30:00Z",
    "stoppedAt": "2025-12-29T15:45:00Z",
    "duration": 900,
    "fileUrl": "https://storage.100ms.live/path/to/video.mp4",
    "fileSize": 524288000,
    "thumbnailUrl": "https://storage.100ms.live/path/to/thumb.jpg",
    "createdAt": "2025-12-29T15:30:00Z",
    "reuniao": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "titulo": "Reunião com Cliente",
      "nome": "João Silva",
      "email": "joao@example.com",
      "dataInicio": "2025-12-29T15:30:00Z",
      "dataFim": "2025-12-29T16:30:00Z"
    }
  }
]
```

**Respostas de Erro:**

| Status | Mensagem |
|--------|----------|
| 401 | Não autenticado |
| 500 | Erro ao listar gravações |

**Lógica:**
1. Extrai `tenantId` do token de autenticação
2. Faz JOIN entre `gravacoes` e `reunioes`
3. Filtra apenas gravações do tenant
4. Retorna com informações da reunião associada

---

### 4. Obter URL Presignada para Playback

**Endpoint:** `GET /api/reunioes/gravacoes/:id/url`

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Rota:**
- `id` (UUID) - ID da gravação

**Resposta Sucesso (200):**
```json
{
  "url": "https://storage.100ms.live/path/to/video.mp4?expires=1735603200&signature=xyz123"
}
```

**Respostas de Erro:**

| Status | Código | Mensagem |
|--------|--------|----------|
| 404 | NOT_FOUND | Gravação não encontrada |
| 400 | RECORDING | Gravação ainda está em andamento |
| 400 | FAILED | Gravação falhou ou é muito curta |
| 400 | NO_ID | ID da gravação não encontrado |
| 400 | NO_CREDENTIALS | Credenciais do 100ms não configuradas |
| 500 | SERVER_ERROR | Erro ao obter URL da gravação |

**Lógica:**
1. Valida se a gravação existe e pertence ao tenant
2. Verifica se o status permite reprodução
3. Obtém credenciais do 100ms
4. Chama serviço `obterUrlPresignadaAsset` para gerar URL temporária
5. Retorna URL com expiração (válida por tempo limitado)

---

### 5. Deletar Gravação

**Endpoint:** `DELETE /api/reunioes/gravacoes/:id`

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Rota:**
- `id` (UUID) - ID da gravação

**Resposta Sucesso (200):**
```json
{
  "success": true
}
```

**Respostas de Erro:**

| Status | Mensagem |
|--------|----------|
| 404 | Gravação não encontrada |
| 401 | Não autorizado |
| 500 | Erro ao deletar gravação |

**Lógica:**
1. Valida se a gravação existe e pertence ao tenant
2. Remove registro da tabela `gravacoes`
3. Nota: Arquivo no 100ms permanece (pode ser deletado manualmente)

---

## Fluxo de Dados

### Fluxo Completo: Da Reunião à Reprodução

```
1. USUÁRIO INICIA REUNIÃO
   ↓
   ├─ ReuniaoDashboardPage carrega Meeting100ms
   └─ Meeting100ms conecta à sala 100ms e exibe interface

2. USUÁRIO CLICA EM "INICIAR GRAVAÇÃO"
   ↓
   ├─ Meeting100ms.toggleRecording() é chamado
   ├─ handleStartRecording() é executado:
   │  ├─ setIsRecordingLoading(true) [mostra spinner]
   │  ├─ Fetch POST /api/reunioes/:id/recording/start
   │  ├─ Envia meetingUrl ao backend
   │  └─ setIsRecordingLoading(false)
   ├─ Backend recebe solicitação
   │  ├─ Valida autenticação via authMiddleware
   │  ├─ Verifica se reunião existe (reuniaoId, tenantId)
   │  ├─ Obtém credenciais 100ms do tenant
   │  ├─ Chama API 100ms iniciarGravacao()
   │  ├─ Insere registro: gravacoes { status: 'recording', startedAt: now }
   │  └─ Retorna sucesso
   ├─ Frontend recebe resposta
   ├─ State isRecording = true
   ├─ Botão fica VERMELHO com pulsação
   └─ Timer de gravação inicia

3. DURANTE A GRAVAÇÃO
   ├─ Botão de gravação mostra tempo decorrido
   ├─ Qualquer pessoa pode clicar novamente para PARAR
   └─ Dados sendo gravados no 100ms

4. USUÁRIO CLICA EM "PARAR GRAVAÇÃO"
   ↓
   ├─ handleStopRecording() é executado:
   │  ├─ setIsRecordingLoading(true) [mostra spinner]
   │  ├─ Fetch POST /api/reunioes/:id/recording/stop
   │  └─ setIsRecordingLoading(false)
   ├─ Backend recebe solicitação
   │  ├─ Valida autenticação
   │  ├─ Chama API 100ms pararGravacao()
   │  ├─ Atualiza registro: gravacoes { status: 'completed', stoppedAt: now, fileUrl: asset.path }
   │  └─ Retorna sucesso
   ├─ Frontend recebe resposta
   ├─ State isRecording = false
   ├─ Botão volta ao normal (cinza)
   └─ Timer para

5. USUÁRIO NAVEGA PARA "GRAVAÇÕES"
   ↓
   ├─ ReuniaoHubPage renderiza aba "Gravações"
   ├─ Gravacoes.tsx montado
   │  ├─ useQuery com queryKey: ["gravacoes"]
   │  ├─ Fetch GET /api/reunioes/gravacoes/list
   │  └─ Backend retorna array de gravações com reunião
   ├─ Dados carregados em state: gravacoes = [...]
   └─ Tabela renderizada com gravações

6. USUÁRIO CLICA EM "ASSISTIR"
   ↓
   ├─ handlePlayRecording(gravacao) é chamado
   │  ├─ setSelectedGravacao(gravacao) [abre modal]
   │  ├─ setIsLoadingPlayback(true) [mostra spinner]
   │  ├─ Fetch GET /api/reunioes/gravacoes/:id/url
   │  └─ setIsLoadingPlayback(false)
   ├─ Backend recebe solicitação
   │  ├─ Valida status da gravação (não pode estar em 'recording')
   │  ├─ Obtém credenciais 100ms
   │  ├─ Gera URL presignada com obterUrlPresignadaAsset()
   │  └─ Retorna { url: "https://..." }
   ├─ Frontend recebe URL
   ├─ setPlaybackUrl(url) [injeta na tag <video>]
   └─ Vídeo começa a reproduzir

7. USUÁRIO ASSISTE O VÍDEO
   ├─ <video> tag com controles nativos
   ├─ Play, Pause, Volume, Fullscreen, etc.
   └─ URL presignada expira após tempo limite

8. USUÁRIO CLICA EM "DELETAR"
   ↓
   ├─ AlertDialog pede confirmação
   ├─ Confirma: Fetch DELETE /api/reunioes/gravacoes/:id
   ├─ Backend deleta registro da tabela gravacoes
   ├─ queryClient.invalidateQueries({ queryKey: ["gravacoes"] })
   ├─ useQuery é re-executado
   ├─ Nova lista é carregada (sem a gravação deletada)
   └─ Toast: "Gravação excluída com sucesso"
```

---

## Componentes Frontend

### 1. Meeting100ms Component

**Arquivo:** `src/features/reuniao-platform/components/Meeting100ms.tsx`

**Props:**
```typescript
interface Meeting100msProps {
  roomId: string;
  meetingId: string;
  participantName?: string;
  initialAudioEnabled?: boolean;
  initialVideoEnabled?: boolean;
  onLeave: () => void;
  tenant?: { nome: string; logoUrl?: string };
  roomDesignConfig?: RoomDesignConfig;
  meetingCode?: string;
}
```

**Estado de Gravação:**
```typescript
const [isRecordingLoading, setIsRecordingLoading] = useState(false);
```

**Funções:**

#### `handleStartRecording()`
```typescript
const handleStartRecording = async () => {
  setIsRecordingLoading(true);
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/reunioes/${meetingId}/recording/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        meetingUrl: `https://app.100ms.live/meeting/${roomId}`
      }),
    });

    if (!response.ok) {
      throw new Error('Erro ao iniciar gravação');
    }

    console.log('[Meeting100ms] Gravação iniciada com sucesso');
  } catch (err) {
    console.error('[Meeting100ms] Erro ao iniciar gravação:', err);
    throw err;
  } finally {
    setIsRecordingLoading(false);
  }
};
```

#### `handleStopRecording()`
```typescript
const handleStopRecording = async () => {
  setIsRecordingLoading(true);
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/reunioes/${meetingId}/recording/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Erro ao parar gravação');
    }

    console.log('[Meeting100ms] Gravação parada com sucesso');
  } catch (err) {
    console.error('[Meeting100ms] Erro ao parar gravação:', err);
    throw err;
  } finally {
    setIsRecordingLoading(false);
  }
};
```

**Botão de Gravação (Controls Component):**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleRecording}
      disabled={isRecordingLoading}
      className={cn(
        "rounded-full h-12 w-12",
        isRecording
          ? "bg-red-500 hover:bg-red-600"
          : "bg-zinc-800 hover:bg-zinc-700"
      )}
    >
      {isRecordingLoading ? (
        <Loader2 className="h-5 w-5 text-white animate-spin" />
      ) : (
        <Circle
          className={cn(
            "h-5 w-5 text-white",
            isRecording && "fill-current animate-pulse"
          )}
        />
      )}
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    {isRecordingLoading ? "Processando..." : isRecording ? `Gravando ${formatTime(recordingTimer)}` : "Iniciar gravação"}
  </TooltipContent>
</Tooltip>
```

---

### 2. Página Gravacoes

**Arquivo:** `src/pages/Gravacoes.tsx`

**Interface Gravacao:**
```typescript
interface Gravacao {
  id: string;
  reuniaoId: string;
  tenantId: string;
  roomId100ms: string;
  sessionId100ms: string;
  recordingId100ms: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  duration: number | null;
  fileUrl: string | null;
  fileSize: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  reuniao: {
    id: string;
    titulo: string;
    nome: string | null;
    email: string | null;
    dataInicio: string;
    dataFim: string;
  } | null;
}
```

**Estado:**
```typescript
const [selectedGravacao, setSelectedGravacao] = useState<Gravacao | null>(null);
const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
```

**Queries:**

#### Listar Gravações
```typescript
const { data: gravacoes = [], isLoading } = useQuery<Gravacao[]>({
  queryKey: ["gravacoes"],
  queryFn: async () => {
    const response = await api.get("/api/reunioes/gravacoes/list");
    return response.data;
  },
});
```

#### Deletar Gravação
```typescript
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    await api.delete(`/api/reunioes/gravacoes/${id}`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["gravacoes"] });
    toast({
      title: "Gravação excluída",
      description: "A gravação foi excluída com sucesso.",
    });
  },
  onError: () => {
    toast({
      variant: "destructive",
      title: "Erro",
      description: "Não foi possível excluir a gravação.",
    });
  },
});
```

**Funções:**

#### Reproduzir Gravação
```typescript
const handlePlayRecording = async (gravacao: Gravacao) => {
  setSelectedGravacao(gravacao);
  setIsLoadingPlayback(true);
  setPlaybackUrl(null);

  try {
    const response = await api.get(`/api/reunioes/gravacoes/${gravacao.id}/url`);
    setPlaybackUrl(response.data.url);
  } catch (error: any) {
    const errorData = error.response?.data;
    const errorMessage = errorData?.message || "Não foi possível carregar a gravação.";
    
    if (errorData?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ["gravacoes"] });
    }
    
    toast({
      variant: "destructive",
      title: "Erro",
      description: errorMessage,
    });
    setSelectedGravacao(null);
  } finally {
    setIsLoadingPlayback(false);
  }
};
```

**UI Components:**

1. **Tabela de Gravações**
   - Colunas: Reunião, Data, Status, Duração, Tamanho, Ações
   - Exibe status com cores (vermelho=gravando, verde=concluído, etc.)
   - Botões: Assistir, Download, Deletar

2. **Modal de Reprodução**
   - <video> nativa com controles
   - Autoplay ao abrir
   - Suporta fullscreen

3. **Estados Vazios**
   - Mensagem quando nenhuma gravação encontrada
   - Ícone FileVideo

4. **Indicadores de Status**
   - Animação pulsante para "Gravando"
   - Badges coloridas por status
   - Ícones de loading

---

## Estados & Controle

### Estados no Meeting100ms

```typescript
// Estado de Gravação
isRecording: boolean              // true = gravando, false = parado
recordingTimer: number            // segundos desde início da gravação
isRecordingLoading: boolean       // true = enviando requisição ao backend

// Estados conectados
isConnected: boolean              // conectado à sala 100ms
isJoining: boolean                // entrando na sala
isLocalAudioEnabled: boolean      // microfone ligado
isLocalVideoEnabled: boolean      // câmera ligada
isScreenSharing: boolean          // compartilhando tela
```

### Estados na Página Gravacoes

```typescript
// Gravações carregadas
gravacoes: Gravacao[]             // array de gravações do tenant
isLoading: boolean                // carregando lista inicial

// Modal de Reprodução
selectedGravacao: Gravacao | null // gravação selecionada para reproduzir
playbackUrl: string | null        // URL presignada do vídeo
isLoadingPlayback: boolean        // obtendo URL
```

### Transições de Estado

```
isRecording:
  false ──[user clicks]──> true ──[user clicks]──> false
         [handleStart]           [handleStop]

isRecordingLoading:
  false ──[fetch start]──> true ──[response]──> false
  false ──[fetch stop]───> true ──[response]──> false

recordingTimer:
  0 ──[setInterval]──> 1 ──> 2 ──> ... ──[stop]──> reset to 0

selectedGravacao:
  null ──[user clicks "Assistir"]──> gravacao ──[modal close]──> null
```

---

## Segurança & Multi-tenant

### Autenticação

Todos os endpoints requerem Bearer Token no header:
```
Authorization: Bearer <JWT_TOKEN>
```

O token é extraído e validado pelo middleware `authMiddleware`:
```typescript
// server/middleware/auth.ts
const tenantId = req.user!.tenantId;
const userId = req.user!.userId;
```

### Isolamento de Dados (Multi-tenant)

Cada endpoint filtra por `tenantId`:

```typescript
// Apenas retorna gravações do tenant do usuário
.where(eq(gravacoes.tenantId, tenantId))

// Valida que a reunião pertence ao tenant
.where(and(eq(reunioes.id, id), eq(reunioes.tenantId, tenantId)))
```

**Benefícios:**
- Usuários de um tenant NÃO conseguem acessar gravações de outro tenant
- Dados isolados no banco de dados
- Cada tenant tem suas próprias credenciais 100ms

### Credenciais 100ms

As credenciais são obtidas por tenant:

```typescript
const hmsCredentials = await getHMS100msCredentials(tenantId);

if (!hmsCredentials) {
  return res.status(400).json({
    success: false,
    message: 'Credenciais do 100ms não configuradas',
  });
}
```

---

## Tratamento de Erros

### Erros no Frontend

**Meeting100ms:**
```typescript
try {
  await fetch(...)
} catch (err) {
  console.error('[Meeting100ms] Erro ao iniciar gravação:', err);
  throw err;  // Propagar para o componente pai
}
```

**Gravacoes.tsx:**
```typescript
try {
  const response = await api.get(`/api/reunioes/gravacoes/${gravacao.id}/url`);
  setPlaybackUrl(response.data.url);
} catch (error: any) {
  const errorMessage = error.response?.data?.message || "Padrão";
  
  if (error.response?.data?.status === 'failed') {
    queryClient.invalidateQueries({ queryKey: ["gravacoes"] });
  }
  
  toast({
    variant: "destructive",
    title: "Erro",
    description: errorMessage,
  });
  
  setSelectedGravacao(null);  // Fechar modal
}
```

### Erros no Backend

Padrão de resposta de erro:

```json
{
  "success": false,
  "message": "Descrição amigável do erro"
}
```

Com status code HTTP apropriado:
- `400` - Requisição inválida (reunião não existe, gravação em andamento, etc.)
- `401` - Não autenticado
- `403` - Não autorizado
- `404` - Recurso não encontrado
- `500` - Erro interno do servidor

### Casos de Erro Específicos

| Situação | Status | Mensagem | Ação do Frontend |
|----------|--------|----------|------------------|
| Gravação ainda em andamento | 400 | "Gravação ainda está em andamento" | Mostrar toast, recarregar lista |
| Gravação falhou/muito curta | 400 | "Gravação falhou ou é muito curta" | Mostrar toast, recarregar lista |
| 100ms sem credenciais | 400 | "Credenciais do 100ms não configuradas" | Mostrar toast, avisar admin |
| URL presignada expirou | 500 | "Erro ao obter URL da gravação" | Mostrar toast, tentar novamente |
| Reunião não encontrada | 404 | "Reunião não encontrada" | Redirecionar ao dashboard |
| Não autenticado | 401 | Padrão | Redirecionar ao login |

---

## Exemplos de Uso

### Exemplo 1: Fluxo Completo em TypeScript

```typescript
// Meeting100ms component
const handleRecordingToggle = async () => {
  try {
    if (!isRecording) {
      // Iniciar gravação
      await handleStartRecording();
      setIsRecording(true);
      setRecordingTimer(0);
    } else {
      // Parar gravação
      await handleStopRecording();
      setIsRecording(false);
    }
  } catch (error) {
    console.error('Erro ao controlar gravação:', error);
    setIsRecording(false);
  }
};
```

### Exemplo 2: Reproduzir Gravação

```typescript
// Gravacoes.tsx
const playRecording = async (gravacaoId: string) => {
  setIsLoadingPlayback(true);
  try {
    // GET /api/reunioes/gravacoes/gravacaoId/url
    const response = await api.get(`/api/reunioes/gravacoes/${gravacaoId}/url`);
    
    // Injetar URL no <video>
    setPlaybackUrl(response.data.url);  // "https://storage.100ms.live/...?expires=..."
    
    // Renderizar: <video src={playbackUrl} controls autoPlay />
  } catch (error) {
    toast.error("Não foi possível carregar a gravação");
  } finally {
    setIsLoadingPlayback(false);
  }
};
```

### Exemplo 3: Deletar com Confirmação

```typescript
// Gravacoes.tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="outline" size="sm">
      <Trash2 className="h-4 w-4 text-red-500" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir gravação?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta ação não pode ser desfeita.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => deleteMutation.mutate(gravacao.id)}
        className="bg-red-500 hover:bg-red-600"
      >
        Excluir
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Exemplo 4: Request/Response HTTP

**Request:**
```bash
curl -X POST http://localhost:5000/api/reunioes/550e8400-e29b-41d4-a716-446655440000/recording/start \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "meetingUrl": "https://app.100ms.live/meeting/5f1c0a2c-b3d1-4e5f-9a1b-2c3d4e5f6a7b"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "recording_987654321",
    "session_id": "session_123456789"
  }
}
```

---

## Troubleshooting

### Problema: Botão de Gravação Não Funciona

**Causas possíveis:**
1. ❌ Não autenticado - verificar `localStorage.getItem('auth_token')`
2. ❌ Sala 100ms não criada - verificar `meeting.roomId100ms`
3. ❌ Credenciais 100ms não configuradas - verificar `/api/configuracoes`

**Solução:**
```typescript
// Verificar token
console.log('Token:', localStorage.getItem('auth_token'));

// Verificar room
console.log('Room ID:', roomId);

// Verificar resposta do servidor
console.log('Response:', response);
```

### Problema: "Gravação ainda está em andamento"

**Causa:** Tentando obter URL de um vídeo que ainda está sendo gravado

**Solução:**
1. Aguardar status ficar `completed`
2. Recarregar a lista (`queryClient.invalidateQueries`)
3. Tentar novamente

### Problema: URL Presignada Expirou

**Causa:** URL tem validade limitada (ex: 1 hora)

**Solução:**
```typescript
// Obter URL novamente
const newUrl = await api.get(`/api/reunioes/gravacoes/${id}/url`);
setPlaybackUrl(newUrl.data.url);
```

### Problema: Gravação Falhou (Status = failed)

**Causas possíveis:**
1. ⏱️ Gravação muito curta (< 10 segundos)
2. ❌ Problemas de conexão durante gravação
3. ❌ Erro no 100ms

**Solução:**
```typescript
// Deletar e tentar novamente
if (gravacao.status === 'failed') {
  await deleteMutation.mutate(gravacao.id);
  // Iniciar nova reunião e gravar novamente
}
```

### Problema: Dados Não Aparecem em Tempo Real

**Causa:** Cache do React Query não foi invalidado

**Solução:**
```typescript
// Forçar re-fetch
await queryClient.invalidateQueries({ queryKey: ["gravacoes"] });

// Ou refetch manual
refetch();
```

---

## Resumo Técnico

| Aspecto | Tecnologia |
|---------|------------|
| **Frontend** | React + TypeScript + React Query |
| **Backend** | Express + Node.js |
| **Banco de Dados** | PostgreSQL (Drizzle ORM) |
| **Integração Video** | 100ms API |
| **Armazenamento** | 100ms Asset Storage |
| **Autenticação** | JWT Bearer Token |
| **UI Components** | Shadcn/ui + Tailwind CSS |

---

## Arquivos Principais

```
projeto/
├── src/
│   ├── pages/
│   │   └── Gravacoes.tsx              ← Página de listagem e reprodução
│   └── features/reuniao-platform/
│       └── components/
│           └── Meeting100ms.tsx       ← Componente com botão de gravação
├── server/
│   ├── routes/
│   │   └── meetings.ts               ← Endpoints da API
│   └── services/meetings/
│       └── hms100ms.ts               ← Integração 100ms
├── shared/
│   └── db-schema.ts                  ← Schema da tabela gravacoes
└── RECORDING_SYSTEM_DOCUMENTATION.md ← Este arquivo!
```

---

## Conclusão

O sistema de gravações é robusto, seguro e escalável:
- ✅ Multi-tenant com isolamento de dados
- ✅ Integração 100ms para gravação de alta qualidade
- ✅ UI intuitiva com feedback em tempo real
- ✅ Tratamento completo de erros
- ✅ Performance otimizada com índices no banco

Para dúvidas ou melhorias, consulte os arquivos principais listados acima.
