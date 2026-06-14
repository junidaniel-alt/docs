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
| Azure Client ID | `934b3c6e-db97-434a-aff0-dd6d8b3b82d8` (publico, nao e segredo) |

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

## 5. Estado atual (v1.12)

**Funciona:**
- Conversa por voz (entrada Web Speech + saida SpeechSynthesis) e texto.
- Multi-provedor de IA: Gemini (plano gratis), Claude, OpenAI — escolha em Config, com dropdown de modelo.
- Cerebro: login M365 (MSAL, fluxo redirect p/ celular), navega e le notas do cofre; atalhos das notas-nucleo.
- Egress hibrido (padrao): nota so vai pra IA quando o Daniel clica "Analisar com IA" e confirma.
- **Projetos:** tela inicial com **Projetos** (21 pastas de `@PASTA CLAUDE/PROJETOS`) e **Atas / Reunioes**
  (`12_REUNIOES_ATAS`); navega subpastas e **abre os HTML renderizados** dentro do app (iframe). Outros
  arquivos (pptx/xlsx/pdf) abrem no OneDrive.
- Identidade visual DAMHA + bloco de identificacao (§A9). Etiqueta de versao no canto da abertura.

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

> Detalhe granular: `git log -- agente-damha/`.

---

## 8. Proximos passos / ideias em aberto
- Caixinhas (cards) mais bonitas para cada projeto, com descricao curta (hoje sao linhas de lista).
- Streaming da resposta de IA (UX de voz mais fluida).
- Modo de modelo local p/ notas mais sensiveis (zero egress).
- Handoff de fim de projeto no cofre `02_PROJETOS` (PAD_Aprendizados / 11_PADROES).

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
  → "Todos os aplicativos" → buscar pelo nome ou colar o **client ID** `934b3c6e-db97-434a-aff0-dd6d8b3b82d8`.
- **Overview:** mostra o *Application (client) ID* — e o valor de **Config → Azure Client ID** no app.
- **Authentication:** plataforma deve ser **Single-page application (SPA)**; o **Redirect URI** precisa
  conter EXATAMENTE a URL de hospedagem do app (GitHub Pages, ex.: `https://<usuario>.github.io/docs/agente-damha/`).
  > Sintoma classico: se o login falha no celular, quase sempre e o Redirect URI que nao bate com a URL.
- **API permissions** (Microsoft Graph, delegadas): `User.Read`, `Files.Read.All`, `Sites.Read.All`
  → se aparecer aviso, clicar em **"Conceder consentimento de administrador"**.
- **Status:** login **confirmado funcionando em producao** (14/06/2026) — app abre no celular, conecta
  M365 e le o cofre/projetos. Azure (Redirect URI SPA + permissoes) e GitHub Pages OK.
