# Agente DAMHA — app de celular (v1.0)

Painel de controle + conversa por voz com o **cerebro** (cofre Obsidian) e os **projetos**.
Roda como **PWA** (instala na tela inicial), **100% no seu aparelho** — nao ha servidor nosso no meio.

> **Nome provisorio: "Agente DAMHA".** Daniel definira o nome definitivo. (Descartado "Jarvis".)

---

## O que ja funciona
- **Conversa com voz**: fala (entrada) + Claude responde por voz (saida).
- **Cerebro**: navega e le as notas do cofre M365 (apos login).
- **Egress hibrido (padrao)**: o conteudo de uma nota so vai para a Anthropic quando voce
  clica **"Analisar com Claude"** e confirma. Nada do cofre sai sozinho.
- **Identidade visual DAMHA** (paleta dark-suave) e bloco de identificacao (§A9).

## Limites honestos
- **Voz de ENTRADA**: cheia no **Android/Chrome**. No **iPhone** o reconhecimento por
  navegador e instavel — use o microfone do teclado do iOS (a voz de SAIDA funciona normal).
- **Egress**: "Analisar com Claude" *envia* o trecho da nota (Uso Interno e Confidencial)
  para a Anthropic. Nao existe "debater o cerebro" com zero egress — o hibrido so torna o
  envio **deliberado**, nunca automatico.
- **Chave de API fica no aparelho** (localStorage). E o seu dispositivo pessoal; ainda assim,
  trate como segredo. Tem **custo por uso** na Anthropic.

---

## Como por no ar (3 passos seus)

### 1. Hospedar (GitHub Pages — gratis)
No repo, em **Settings -> Pages**, publique a partir do branch e da pasta `/agente-damha`.
O app ficara em `https://<usuario>.github.io/docs/agente-damha/`.

### 2. Registro no Azure (uma vez, para ler o cofre)
1. portal.azure.com -> **Azure Active Directory -> App registrations -> New registration**.
2. **Redirect URI** (tipo *Single-page application / SPA*): a URL do passo 1.
3. Em **API permissions**, adicione (Microsoft Graph, delegated): `Files.Read.All`, `Sites.Read.All`, `User.Read`.
4. Copie o **Application (client) ID** -> cole em **Config -> Azure Client ID** no app.

### 3. Chave Anthropic
Crie uma chave em console.anthropic.com e cole em **Config -> Chave da API Anthropic**.

### Instalar no celular
Abra a URL no Chrome (Android) ou Safari (iPhone) -> menu -> **"Adicionar a tela inicial"**.

---

## Pendente / proximos passos
- Trocar o `assets/LOGO.png` pelo logo oficial (PNG transparente do cofre `_ASSETS/LOGO.png`)
  e gerar `assets/icon-192.png` / `assets/icon-512.png`.
- Ligar os atalhos reais dos projetos (paineis) em `app.js -> PROJETOS`.
- Avaliar streaming da resposta (UX de voz) e modo de modelo local para notas mais sensiveis.

Detalhe do projeto e decisoes: ver no cofre `02_PROJETOS/PROJ_Agente-DAMHA`.
