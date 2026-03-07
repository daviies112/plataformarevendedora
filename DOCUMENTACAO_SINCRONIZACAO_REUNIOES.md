# Documentação Técnica: Sincronização de Reuniões (Multi-Tenant)

Este documento detalha a arquitetura e implementação do sistema de sincronização de reuniões entre o banco de dados local (Replit PostgreSQL) e o banco de dados externo do cliente (Supabase), incluindo a integração com o calendário.

## 1. Arquitetura de Sincronização Dual-Write

Para garantir a integridade dos dados e o suporte multi-tenant, utilizamos uma estratégia de **Dual-Write**. Toda operação de criação, atualização ou exclusão de reuniões é executada em dois lugares simultaneamente:

1.  **Banco de Dados Local (Replit DB):** Onde o sistema central gerencia todas as reuniões de todos os tenants para fins de administração global, notificações e poller centralizado.
2.  **Supabase do Tenant (Externo):** Onde os dados específicos do cliente são persistidos, permitindo que o cliente tenha controle e acesso direto aos seus dados via sua própria instância do Supabase.

### Fluxo de Funcionamento:

1.  **Requisição:** O frontend (ou uma automação via n8n) envia os dados da reunião.
2.  **Validação de Tenant:** O backend valida o `tenantId`. Se for um ID de desenvolvimento (ex: `dev-daviemericko_gmail_com`), ele é processado com um fallback seguro para evitar erros de sintaxe UUID.
3.  **Persistência Local:** A reunião é salva na tabela `reunioes` do banco PostgreSQL local.
4.  **Sincronização Supabase:** O backend inicializa um cliente Supabase dinâmico usando as credenciais do tenant (armazenadas na tabela `meeting_tenants` ou via Secrets) e replica a operação na tabela `reunioes` do Supabase.

## 2. Implementação das Rotas (API)

As rotas em `server/routes/meetings.ts` foram otimizadas para lidar com essa sincronização:

-   **POST /api/reunioes:**
    -   Recebe `nome` e `email` do cliente (não do usuário logado).
    -   Busca configurações de design de sala do tenant.
    -   Cria o registro localmente.
    -   Tenta criar o registro no Supabase do tenant usando a função `syncMeetingToSupabase`.
-   **PATCH /api/reunioes/:id:**
    -   Atualiza os dados localmente.
    -   Sincroniza a atualização para o Supabase.
-   **DELETE /api/reunioes/:id:**
    -   Remove localmente e tenta remover no Supabase correspondente.

## 3. Integração com o Calendário

O calendário utiliza o hook `useReuniao` para buscar e gerenciar os eventos.

-   **Visualização:** O componente de calendário (`src/pages/Calendario.tsx`) consome a lista de reuniões que vem do backend (consolidada do banco local).
-   **Agendamento:** O `CreateEventModal` captura:
    -   `titulo`: Assunto da reunião.
    -   `nomeCliente` & `emailCliente`: Dados essenciais para identificar quem participará.
    -   `dataInicio` & `dataFim`: Definidos através da seleção visual no calendário.
-   **Link 100ms:** Ao criar a reunião, o sistema gera automaticamente uma sala no 100ms e armazena o link. Este link é o que é enviado ao cliente.

## 4. Tratamento de Erros e Validação UUID

Um dos pontos críticos corrigidos foi o tratamento de IDs de tenant.
-   **Problema:** O banco PostgreSQL local espera UUIDs para chaves primárias. IDs de string como `dev-...` causavam erro 500.
-   **Solução:** Implementamos uma verificação via Regex:
    ```typescript
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
    ```
    Se o ID não for um UUID válido, o sistema pula a busca no banco de tenants e usa configurações padrão, garantindo que o ambiente de desenvolvimento continue funcional.

## 5. Como os Dados do Cliente são Capturados

Conforme solicitado, os formulários de "Nova Reunião" foram alterados:
-   **Antigamente:** Usava o email do dono da plataforma.
-   **Atualmente:** Existem campos explícitos para **Nome do Cliente** e **E-mail do Cliente**.
-   **Vantagem:** Isso permite que o sistema saiba exatamente para quem enviar o convite e qual nome exibir na sala de reunião do 100ms.

## 6. Sincronização para Automações (n8n/Webhooks)

O sistema está preparado para ser gatilho de automações:
-   Cada criação de reunião dispara um evento que pode ser capturado pelo n8n.
-   Os dados sincronizados no Supabase permitem que ferramentas externas leiam as reuniões em tempo real sem onerar o servidor principal.
