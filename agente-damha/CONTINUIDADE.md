# App Agente Damha Agro — Documento de Continuidade (o "vinculo")

> **Para que serve este arquivo:** este e o elo que NAO depende de nenhum chat.
> Tudo que precisamos para continuar o projeto — visao, arquitetura, decisoes,
> versoes e proximos passos — esta aqui dentro do repositorio. Apagar uma conversa
> NAO apaga o projeto: o codigo e este contexto vivem no git.

---

## 1. Como retomar em um chat NOVO (o passo a passo)

1. Abra o Claude Code (web/app) apontando para o repositorio **`junidaniel-alt/docs`**.
2. Use a branch **`claude/grafana-dashboards-skill-4zpkji`** (ou `main`, se ja tiver sido mesclada).
3. Diga a **frase-gatilho** + a ordem. Exemplo:
   > *"App Agente Damha Agro — leia `agente-damha/CONTINUIDADE.md` e atualize o app: <sua nova ordem>."*
4. Eu leio este arquivo + o codigo em `agente-damha/` e retomo com contexto completo.

### Frase-gatilho (convencao com o Daniel)
Sempre que o Daniel disser **"App Agente Damha Agro"** e pedir para atualizar/aperfeicoar o app,
o Claude do momento DEVE: (1) ler este `CONTINUIDADE.md` e o codigo da pasta, (2) reconectar todo o
historico do projeto, (3) executar a atualizacao na integra e (4) atualizar este documento + a
`APP_VERSION`. Isso vale em qualquer chat novo — o vinculo e o repositorio, nao a conversa.

Pronto. O "vinculo" e este documento + o codigo versionado. Nao e preciso guardar o chat.

---

## 2. O que e o App Agente Damha Agro

App de celular (PWA — instala na tela inicial) que e **painel de controle + conversa por
voz** com o **cerebro** (cofre Obsidian no M365) e com os **projetos/atas** (HTML no OneDrive).
Roda **100% no aparelho do Daniel** — nao ha servidor nosso no meio.

- **Nome oficial:** "App Agente Damha Agro" (provisorios descartados: "Agente DAMHA", "Jarvis").
- **Papel da IA:** parceira de debate e pensamento critico — NAO validadora (ver `/CLAUDE.md`).

---

## 3. Onde tudo mora (mapa de localizacao)

| Coisa | Onde |
|---|---|
| Codigo do app | repo `junidaniel-alt/docs`, pasta `agente-damha/` |
| Branch de trabalho | `claude/grafana-dashboards-skill-4zpkji` |
| Hospedagem | GitHub Pages → `https://<usuario>.github.io/docs/agente-damha/` |
| Cofre (cerebro) | OneDrive M365, driveId `b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4` |
| Raiz do cofre | itemId `01KCR6ZALNPTVWS2LBS5HYFDHIWJ3QGS7E` (CEREBRO DO CLOUDE) |
| Pasta PROJETOS (HTML) | `@PASTA CLAUDE/PROJETOS` → itemId `01KCR6ZAM72SON7SWCM5AKWEM6K3AOZLWD` |
| Pasta ATAS / Reunioes | cofre `12_REUNIOES_ATAS` → itemId `01KCR6ZANXHH44ZF6OHVDJLZBY4K4WPQSY` |
| Azure Client ID | `68d78834-f9ec-4f71-b64b-172e9281e832` (publico, nao e segredo) |

> O driveId e os itemIds das notas-nucleo do cofre estao em `/CLAUDE.md` secao 3.

---

## 4. Arquitetura e mapa de arquivos

PWA estatica, sem build, sem framework — HTML + CSS + JS puro.

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura das telas (Inicio, Conversa, Cerebro, Projetos, Config) |
| `app.js` | Toda a logica: chat, voz, login M365 (MSAL), leitura do cofre, navegador de Projetos/Atas |
| `styles.css` | Paleta dark-suave DAMHA (CLAUDE.md secao 4) |
| `sw.js` | Service worker (casca offline; NUNCA cacheia cofre nem respostas de IA) |
| `manifest.webmanifest` | Instalacao como app (icones, cores) |
| `assets/` | LOGO.png + icones 192/512 |
| `README.md` | Visao geral + como por no ar |
| `BACKEND.md` | Esboco de backend (Camera 2 / futuro) |
| `CONTINUIDADE.md` | **Este arquivo** — contexto e retomada |
| `GUIA_INSTALACAO.md` | Passo a passo do zero (hospedagem, Azure, IA, config, instalar) |

### Pontos-chave no `app.js`
- `APP_VERSION` (topo) — **fonte unica da versao**; bumpar a cada release. Aparece no canto da abertura.
- `DEFAULTS` — provedor, modelo, egress, Azure Client ID, driveId.
- `ROOT_FOLDER`, `NUCLEO[]` — cofre.
- `PROJETOS_FOLDER`, `ATAS_FOLDER` — raizes do navegador da aba Projetos.
- Provedores de IA: `callClaude()`, `callGemini()`, `callOpenAI()`.
- Cofre: `cofreLogin()`, `ensureCofre()`, `listFolder()`, `openNote()`, `graph()`.
- Projetos/Atas: `openProjetos()`, `listProj()`, `openHtml()` (renderiza HTML via iframe `srcdoc`).

---

## 5. Estado atual (v1.73)

**Funciona:**
- Conversa por voz (entrada Web Speech + saida SpeechSynthesis) e texto.
- **Multi-provedor unificado** (camada `aiChat`/`aiOnce`): Gemini, Claude e OpenAI funcionam IGUAL nos
  DOIS ambientes (Copiloto e STUDIO), com **busca web em tempo real nos tres** (Gemini google_search,
  Claude web_search, OpenAI Responses API). Trocar de provedor/modelo em Config **salva na hora**.
  Botao **Testar chave** (ListModels) diz se a chave e valida e ja escolhe modelo que funciona.
- **STUDIO** (aba renomeada de "Relatorio"): iteracao viva estilo Mission Control — contrato JSON
  (reply/relatorio/add_blocos/remover_titulos), blocos kpis/grafico/texto.
- Graficos: line/area/bar + **CANDLESTICK** (velas verde/vermelho); "vela de variacao honesta" quando
  nao ha OHLC real (padrao do dashboard). Toque amplia (modal) com **PNG / PDF / Compartilhar**.
- **Base DAMHA** (cofre): login M365; **busca autonoma** acha e anexa o arquivo mais relevante —
  le notas (.md) E **planilhas reais (.xlsx)**, no cofre E no OneDrive pessoal (TRADE_DOLAR/DREs).
- **Exportar/Compartilhar** (WhatsApp / Share nativo / PDF) no Copiloto E no STUDIO; PDF com marca §A9.
- **Tela cheia** em Projetos/Atas, Base DAMHA (notas/planilhas) e STUDIO.
- **Pre-abertura de luxo** animada + **som futurista/agro** (brisa + sweep + arpejo pentatonico).
- **Botao OMEGA** (home + nav; v1.73 renomeou "Cerebro Omega" → **OMEGA** com icone **Ω** no lugar do cerebro):
  abre `https://remoto.damhaagronegocios.com.br` (painel Maria Sarah via **Cloudflare Access** — login por
  e-mail/Microsoft SSO). Constante `OMEGA_URL` em app.js (ja apontando pro Cloudflare).
- **CoPilot (v1.73):** "Copiloto" → **CoPilot** (nav, botao da home, cabecalho do chat e rotulos de export).
  O icone de robo virou o **avatar oficial do CoPilot Damha** — `assets/copilot.png` (recorte 256px do
  `CoPilot_Damha_isolado_HD` da pasta de avatares; 2D leve). O 3D segue so no OMEGA/PC (glb ~27MB pesa no celular).
- Voz: lista limpa (dedupe + marca ♀/♂) + aviso de quantas vozes pt o aparelho tem; presets
  bem distintos (Maria Sarah aguda x Copilot grave) pra diferenciar mesmo com 1 voz.
- Internet e Base **ligadas por padrao** (tempo real sempre). Identidade DAMHA + §A9 na Config.
- **Mascote Maria Sarah:** carregamento do cofre PRONTO mas DESLIGADO (`MASCOT_ENABLED=false`) ate a
  arte final individual (auto-detecta a imagem no cofre quando religar).

**Limites honestos:**
- Voz de ENTRADA: cheia no Android/Chrome; instavel no iPhone (use o microfone do teclado iOS).
- "Analisar com IA" *envia* o trecho da nota (Uso Interno e Confidencial) ao provedor — o hibrido
  torna o envio deliberado, nao elimina o egress.
- Chave de API fica no aparelho (localStorage); tem custo por uso.
- HTML de projeto que puxa imagem/arquivo por caminho relativo do OneDrive pode nao mostrar essa parte
  no iframe (relatorios autossuficientes abrem perfeitos).

---

## 6. Modelo de seguranca (resumido)
- Sem servidor nosso. Tudo client-side; segredos so no aparelho do Daniel.
- Service worker nao persiste cofre nem respostas de IA.
- Egress hibrido com confirmacao e o padrao.
- **Acesso ADM/Cerebro:** trava por identidade Microsoft (`ADMIN_EMAILS`) + PIN secundario.
  A trava de UI e dissuasor; a protecao REAL do dado e o login M365 — o Graph so devolve o que a
  conta logada tem permissao de ler. Um terceiro nunca le o cofre do Daniel, mesmo vendo a UI.

---

## 7. Historico de versoes (resumo)
- **v1.0** — app inicial: voz + cofre + projetos (placeholder), identidade DAMHA.
- **v1.x** — login MSAL redirect (celular), client ID correto, icones com logo oficial.
- **multi-provedor** — Gemini/Claude/OpenAI com dropdown de modelo.
- **home** — menu de botoes + navegacao por abas.
- **v1.9/1.10** — aba Projetos vira navegador real: lista `@PASTA CLAUDE/PROJETOS` + `12_REUNIOES_ATAS`,
  abre HTML renderizado. Subtitulos das abas removidos.
- **v1.11** — etiqueta de versao no canto da abertura (constante `APP_VERSION`, fonte unica).
- **v1.12** — nome oficial "App Agente Damha Agro" + convencao de frase-gatilho (secao 1).
- **v1.13** — Config separado em Geral (so chave de API, com botao mostrar) e **ADM** (cofre)
  atras de **PIN**; aba Cerebro escondida quando trancado.
- **v1.14** — ADM amarrado a **identidade Microsoft**: so abre para `daniel.feitoza@damhaagro.com.br`
  (lista `ADMIN_EMAILS` em app.js); PIN `252553` (hash em `ADM_PIN_SHA`) como atalho secundario.
  Terceiro que loga com a propria conta ve so Conversa/Projetos e apenas as pastas do OneDrive
  liberadas para a conta dele. Corrigido o Client ID real (`68d78834-...`).
- **v1.15** — ADM em 2 passos (conta Microsoft → PIN), **sempre trancado ao abrir** (destrava so
  em memoria) e **auto-trava em 1 min** (`ADM_TIMEOUT_MS`). Conversa **sauda pelo nome** de quem
  logou (`userFirstName`). Abertura virou **splash** com logo DAMHA animado + nome + versao; bloco
  de identificacao (§A9) movido para **dentro da Config** (nao aparece mais em todas as telas).

- **v1.17** — lista de modelos com rotulos claros (padrao Gemini 1.5 Flash); erros amigaveis
  (429/401/404); respostas da IA renderizadas em markdown leve (`mdToHtml`).
- **v1.18** — copiloto na aba Conversa com **chavinhas**: 🌐 Internet (grounding `google_search`
  do Gemini), 🧠 Cerebro (cofre como fonte), 📄 Contexto (anexa ultima nota aberta, respeitando
  egress hibrido), 🔊 Voz (TTS). Estados em localStorage (`tog_*`). Calls de IA parametrizadas
  por `sys`/`web`. STUDIO (`PROJETOS/2026.06.12_MISSION_CONTROL_MERCADO_FUTURO/Mission_Control_Web/`)
  e a referencia de engenharia de chat — fonte ainda nao lida (download via Graph trava em redirect).

- **v1.18** — copiloto com chavinhas (Internet/Cerebro/Contexto/Voz).
- **v1.19/1.20** — corrige modelos Gemini (1.5 descontinuado -> 404); lista so 2.0/2.5; migracao auto.
- **v1.21** — **COPILOTO DAMHA (Fase 1)**: aba renomeada, **chips de sugestao** (`SUGGEST`/`renderSuggest`)
  e a IA **gera graficos inline** — devolve bloco ```chart {json}``` que o app renderiza em SVG
  (`extractChart`/`chartSVG`/`renderChart`; toque troca line/bar).
- **v1.22/1.23/1.24/1.25** — Gemini: header `x-goog-api-key`, auto-retry + fallback de modelo no 429,
  e **alinhado ao STUDIO** (mesmo endpoint; padrao **gemini-2.0-flash-lite**, que tem cota gratis pro
  Daniel; 2.5-flash = o do STUDIO). Busca web (google_search) tolerante: se 400/403, responde sem internet.
  (Aprendizado-chave: a cota gratis do Gemini e POR MODELO; 1.5 foi descontinuado.)
- **v1.26/1.27** — voz feminina configuravel: botao **Parar**, e em Config seletor de voz +
  tom (pitch) + velocidade + **Testar voz** (`speakWith`).
- **v1.28** — abertura "fantastica" (halo + brilho no nome), transicoes de view e microinteracoes;
  **som de abertura** (chime WebAudio no 1o toque; autoplay e bloqueado) com chavinha em Config.
- **v1.29** — **mascote Maria Sarah** (persona/saudacao); botao **Limpar conversa**; seletor lista
  TODAS as vozes do aparelho + **presets** (Maria Sarah/Jovem/Seria/Animada).

- **v1.30** — Maria Sarah **pergunta primeiro** (bloco ```options``` -> botoes clicaveis).
- **v1.31** — voz aplica na hora; renomeia "Cerebro/cofre" para **"Base DAMHA"** na UI.
- **v1.32/1.33** — grafico **abre em tela cheia** (modal Linha/Barra); **KPIs** (cards) + tipo **Area**.
- **v1.34** — Gemini **1 chamada por mensagem** (corrige 429 que multiplicava).
- **v1.35** — **relatorio completo**: varios KPIs+graficos numa resposta (`renderBotInto`).
- **v1.36** — exportar/copiar grafico em **PNG** (modal).
- **v1.37** — **tema claro/escuro** (Config).
- **v1.38/1.39/1.40** — **Fase 2 leitor de planilha (SheetJS)** na Base DAMHA: abre .xlsx/.xlsb/.csv,
  **menu de abas** + **Resumo/levantamento** (todas as abas, colunas, nº linhas); "Plotar/analisar com IA".
- **v1.40/1.41** — 429: padrao **gemini-2.5-flash** (= STUDIO) + 1 modelo alternativo; **corta historico**
  p/ ultimas 10 msgs (pacote menor). Causa real do 429 no app vs STUDIO: modelo + historico cheio.
- **v1.42/1.43** — vozes por **genero**: presets **Maria Sarah (feminina)** e **Copilot Damha (masculino)**.
- **v1.44** — **ITERACAO VIVA**: aba **Relatorio** (canvas vivo) — direcione por texto/chips e a Maria Sarah
  monta/atualiza KPIs+graficos; pedidos de adicionar/remover reescrevem o relatorio completo (`renderReport`).
- **v1.48** — Relatorio vivo com **contrato STUDIO** (iteracao incremental: add_blocos/remover_titulos).
- **v1.49** — remove `thinkingConfig` do Gemini (causava 400 "modelo indisponivel").
- **v1.50** — encurta rotulo do menu p/ caber Projetos na barra.
- **v1.51** — **diagnostico real da chave**: `apiError` mostra a CAUSA do Google; botao **Testar chave**
  (descobre que a chave AQ... nao era Gemini valida — Gemini comeca com AIza).
- **v1.52** — Testar chave para **Gemini/Claude/GPT** com veredito visivel.
- **v1.53** — aba renomeada para **STUDIO**.
- **v1.54/1.55** — grafico **candlestick** (velas) + "vela de variacao honesta" (candle em todo grafico,
  padrao do Mission Control); linha tracejada do ultimo preco.
- **v1.56** — **camada multi-provedor** (Gemini/Claude/GPT) nos 2 ambientes + **busca web nos tres** +
  salvar provedor na hora. (Causa do "chave excedeu" no STUDIO: ele chamava sempre o Gemini.)
- **v1.57** — Base DAMHA tambem no STUDIO; Internet/Base ligadas por padrao (tempo real sempre).
- **v1.58** — **exportar/compartilhar** (WhatsApp/Share/PDF) no Copiloto e STUDIO (PDF com §A9).
- **v1.59** — Base DAMHA **busca autonoma** no cofre (acha e anexa sozinha).
- **v1.60** — grafico em tela cheia gera **PDF** e **compartilha imagem** (PNG mantido).
- **v1.61/1.62/1.63** — mascote Maria Sarah do cofre (home/topo/avatar), auto-detecta imagem individual.
- **v1.64** — mascote DESLIGADO (`MASCOT_ENABLED=false`) ate a arte final.
- **v1.65** — **pre-abertura de luxo** (animacao + som).
- **v1.66** — som de abertura **futurista + agro** (brisa, sweep, arpejo pentatonico).
- **v1.67/1.68/1.69** — botao **Tela cheia** em Projetos/Atas, Base DAMHA e STUDIO (`toggleFull`).
- **v1.70** — Base **le planilhas reais (.xlsx)** e busca tambem no **OneDrive pessoal** (`sheetItemToText`).
- **v1.71** — lista de vozes limpa (dedupe + ♀/♂) + aviso de vozes do aparelho + presets mais distintos.
- **v1.72** — botao **CEREBRO OMEGA** (`OMEGA_URL`, abre painel Maria Sarah via Tailscale).
- **v1.73** — `OMEGA_URL` → **Cloudflare** (`https://remoto.damhaagronegocios.com.br`, login e-mail/Microsoft); botao "Cerebro Omega" → **OMEGA** (icone **Ω** no lugar do cerebro); **CoPilot**: "Copiloto" → **CoPilot** + avatar oficial do CoPilot Damha (`assets/copilot.png`) no botao da home e no cabecalho do chat (troca o robo).

> Detalhe granular: `git log -- agente-damha/`. Persona da IA = **Maria Sarah** (mascote do Copiloto Damha).
> Leitura do cofre p/ Fase 2 ja viavel via `read_resource` (M365 connector): file:///{driveId}/{itemId}.
> Gemini: o app fala igual ao STUDIO (mesmo endpoint, modelo 2.5-flash, 1 call, historico curto).
> Fim definitivo do 429 = ativar billing (passo a passo no GUIA_INSTALACAO).

---

## 8. Proximos passos / ideias em aberto
- **CEREBRO OMEGA — acesso:** trocar `OMEGA_URL` por `https://remoto.damhaagronegocios.com.br` quando o
  Cloudflare ficar pronto (acaba com Tailscale/PIN/http). Pendencia do lado do PC: servidor precisa ouvir
  em `0.0.0.0:8777` (nao 127.0.0.1) + liberar porta 8777 no Firewall do Windows.
- **Confidencialidade (frente 2, em aberto):** reforcar controle do que sai do cofre pra IA — egress
  hibrido com confirmacao + marcar dado confidencial. (Risco: dado interno indo p/ IA de terceiros.)
- **Cotacao real (frente 3):** plugar AwesomeAPI (dolar gratis) + CEPEA/B3 nas velas/KPIs (hoje vem da
  busca da IA). Cumpre a regra "nunca preco-modelo sem spot do dia".
- **Persistencia (frente 4):** salvar historico de conversas e versoes de relatorio (nome/data).
- **Chaves no aparelho:** unica protecao real = proxy/backend (deixaria de ser 100% estatico).
- **Medidor de custo/uso** (internet sempre on + Claude pago = todo turno custa).
- **Voz premium** da Maria Sarah (TTS nuvem) — Daniel disse "desconsidera, o que temos atende".
- **Mascote:** religar (`MASCOT_ENABLED=true`) quando a arte individual final estiver no cofre.
- **Ja ENTREGUE:** candlestick, tela cheia (3 lugares), export/share (WhatsApp/PDF/PNG), multi-provedor
  nos 2 ambientes, busca web nos 3, Base le .xlsx real + OneDrive pessoal, pre-abertura de luxo, botao OMEGA.

---

## 9. Convencao de release (para o Claude do futuro)
A cada mudanca entregue: bumpar `APP_VERSION` em `app.js`, o `?v=NN` em `index.html`
(css/js) e o nome do cache em `sw.js` — isso forca o celular a baixar a versao nova.
Commitar com mensagem clara e dar push na branch de trabalho.

---

## 10. Azure / Entra ID — como gerenciar o login
O login no cofre usa um **App Registration no Microsoft Entra ID** (antigo Azure AD).
**Atencao:** isso NAO se gerencia pelo *app "Azure" do celular* (esse e so para recursos de nuvem);
e pelo **navegador**.

- **Onde:** `entra.microsoft.com` (ou `portal.azure.com`) → entrar com a conta M365 do Daniel
  (daniel_feitoza@damhaagro...) → **Microsoft Entra ID → Registros de aplicativo (App registrations)**
  → "Todos os aplicativos" → buscar pelo nome ou colar o **client ID** `68d78834-f9ec-4f71-b64b-172e9281e832`.
- **Overview:** mostra o *Application (client) ID* — e o valor de **Config → Azure Client ID** no app.
- **Authentication:** plataforma deve ser **Single-page application (SPA)**; o **Redirect URI** precisa
  conter EXATAMENTE a URL de hospedagem do app (GitHub Pages, ex.: `https://<usuario>.github.io/docs/agente-damha/`).
  > Sintoma classico: se o login falha no celular, quase sempre e o Redirect URI que nao bate com a URL.
- **API permissions** (Microsoft Graph, delegadas): `User.Read`, `Files.Read.All`, `Sites.Read.All`
  → se aparecer aviso, clicar em **"Conceder consentimento de administrador"**.
- **Status:** login **confirmado funcionando em producao** (14/06/2026) — app abre no celular, conecta
  M365 e le o cofre/projetos. Azure (Redirect URI SPA + permissoes) e GitHub Pages OK.
