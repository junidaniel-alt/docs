# Agente DAMHA — Camada 2 (backend "comanda tudo") — BLUEPRINT

> Estado: **especificacao**, ainda nao construido. A v1 (PWA cliente) ja funciona sozinha
> contra a API Claude. Esta camada e o que faz o app **acionar os ~35 conectores MCP e as
> skills** (e-mail, calendario, Teams, Shopify, graphify, etc.) — coisas que NAO existem na
> API publica, so num ambiente com o Agent SDK + servidores MCP.

## Por que precisa de backend
O PWA roda no navegador e fala direto com `api.anthropic.com`. A API, sozinha, nao tem
ferramentas. Os conectores e skills vivem num **runtime** (Claude Code / Agent SDK + MCP).
Logo, para "comandar tudo", o app precisa falar com um **servidor nosso** que hospeda esse
runtime. Esse servidor precisa ficar **sempre ligado** — nao cabe no container efemero do
Claude Code web.

## Arquitetura
```
[PWA no celular] --HTTPS--> [Backend Agente DAMHA] --> [Claude Agent SDK]
                                   |                         |
                                   |                    [Servidores MCP]
                                   |              (M365, Calendar, Teams, Zapier=9000+ apps,
                                   |               graphify, grafana, etc.)
                              [Auth + segredos]
```
- **Frontend:** o mesmo PWA. Muda so o destino: em Config, um campo "Backend URL". Se preenchido,
  o app manda a conversa para o backend (que tem ferramentas) em vez da API crua.
- **Backend:** Node/TypeScript com o **Claude Agent SDK**, expondo `POST /chat` (stream).
  Carrega os MCP servers via configuracao; injeta o mesmo system prompt (parceira de debate).
- **Auth:** token unico por dispositivo (o app guarda; o backend valida). M365 via fluxo do
  proprio backend (client credentials ou on-behalf-of) para ler/agir no cofre.

## Stack sugerida
- Runtime: Node 22 + TypeScript.
- SDK: `@anthropic-ai/claude-agent-sdk` (Agent SDK).
- MCP: declarar os servidores no config do agente (M365, Google, Zapier, graphify...).
- Hospedagem (sempre-ligada): Fly.io / Railway / Render / VPS. (GitHub Pages NAO serve — e estatico.)
- Segredos: variaveis de ambiente (ANTHROPIC_API_KEY, credenciais M365/Graph, tokens MCP).

## Endpoints (minimo)
- `POST /chat`  — body `{ messages, allowTools? }`; resposta em stream (SSE). Usa o Agent SDK
  com ferramentas habilitadas. Aplica a politica de egress do cofre no servidor.
- `GET  /health` — readiness.
- `POST /auth`  — troca um codigo/segredo por token de dispositivo (simples no v1).

## Seguranca (inegociavel)
- **Egress do cofre:** a mesma politica hibrida da v1, agora aplicada no backend — nenhuma
  nota e enviada ao modelo sem flag explicita por requisicao.
- **Ferramentas perigosas:** acoes que ESCREVEM (enviar e-mail, alterar arquivo, mover dinheiro)
  exigem confirmacao explicita do app antes de executar (allowlist + confirm).
- **Segredos nunca no cliente.** A chave Anthropic e as credenciais MCP vivem so no backend.
- **Auditoria:** logar toda chamada de ferramenta (o que rodou, com que args) — lição graphify.

## Passos para construir (quando houver hospedagem)
1. Daniel escolhe o provedor de hospedagem e cria a conta.
2. Provisiona segredos (chave Anthropic + credenciais dos conectores que quiser ligar primeiro).
3. Claude implementa o backend (Agent SDK + 2-3 conectores prioritarios), testa o `/chat`.
4. Liga o campo "Backend URL" no PWA -> o app passa a comandar as ferramentas.
5. Amplia conectores/skills de forma incremental e auditada.

## Decisao pendente
Qual provedor de hospedagem e quais conectores entram primeiro (sugestao: M365 + Calendar +
e-mail, que cobrem a rotina). Definido isso, a implementacao do backend e direta.
