# App Agente Damha Agro — Guia de Instalacao do Zero

> Passo a passo COMPLETO para habilitar (ou reativar) o app, com todos os valores usados.
> Serve de receita caso seja preciso refazer no futuro. Companheiro do `CONTINUIDADE.md`.

---

## 0. Visao geral
O app e uma **PWA estatica** (HTML/CSS/JS) que roda no aparelho. Para funcionar 100% ele precisa de:
1. **Hospedagem** (um endereco web) — via GitHub Pages (gratis).
2. **Registro no Azure / Entra ID** — para o login que le o cofre (Microsoft Graph).
3. **Chave de IA** (Gemini, Claude ou OpenAI) — para a conversa.
4. **Config no app** + instalar no celular.

> Sem o passo 1+2, o login do cofre nao funciona. Sem o passo 3, a conversa nao responde.

---

## 1. Hospedagem (GitHub Pages)
1. Repo: **`junidaniel-alt/docs`**. O app esta na pasta **`agente-damha/`**.
2. No GitHub: **Settings → Pages**.
3. **Build and deployment → Source: Deploy from a branch**.
4. Escolha o branch publicado e salve. O app fica em:
   **`https://junidaniel-alt.github.io/docs/agente-damha/`**  *(URL de producao — ja confirmada funcionando)*
5. Essa MESMA URL e o **Redirect URI** do passo 2. Guarde-a.

> Para publicar mudancas: commit + push no branch. O Pages atualiza em 1-2 min.
> Se o celular nao pegar a versao nova, e cache: feche e abra o app (a `APP_VERSION` no canto da abertura confirma a versao carregada).

---

## 2. Registro no Azure / Microsoft Entra ID (login do cofre)
> Faz-se pelo **navegador** (NAO pelo app "Azure" do celular).

1. Entre em **entra.microsoft.com** (ou portal.azure.com) com a conta M365 do Daniel
   (daniel_feitoza@damhaagro...).
2. **Microsoft Entra ID → Registros de aplicativo (App registrations)**.
3. O registro ja existe — **client ID `68d78834-f9ec-4f71-b64b-172e9281e832`**
   (busque por esse ID ou pelo nome). *Se precisar criar do zero: New registration, conta "Single tenant".*
4. **Authentication → Add a platform → Single-page application (SPA)**.
   - **Redirect URI** = a URL do passo 1 (`https://junidaniel-alt.github.io/docs/agente-damha/`).
   - Marque que e SPA (fluxo com PKCE) — o app usa MSAL com redirect.
5. **API permissions → Add a permission → Microsoft Graph → Delegated**, adicione:
   - `User.Read`
   - `Files.Read.All`
   - `Sites.Read.All`
   - Depois clique em **"Grant admin consent"** (consentimento de administrador).
6. **Overview** → copie o **Application (client) ID** (e o `68d78834...`). Vai no Config do app.

> Sintoma classico de erro: login abre e falha / volta sem entrar = **Redirect URI nao bate** com a URL real. Tem que ser identica (com a barra no fim).

---

## 3. Chave de IA (provedor da conversa)
Escolha UM provedor e crie a chave:
- **Gemini (Google)** — tem plano gratis: `aistudio.google.com` → API key.
- **Claude (Anthropic)** — `console.anthropic.com` → API keys (tem custo por uso).
- **OpenAI** — `platform.openai.com` → API keys (tem custo por uso).

> A chave fica **so no aparelho** (localStorage). Trate como segredo.

---

## 4. Config dentro do app
Abra o app → aba **Config** e preencha:
- **Chave da API**: a do passo 3.
- **Provedor de IA**: Gemini / Claude / OpenAI (combinar com a chave).
- **Versao / Modelo**: escolha no dropdown.
- **Azure Client ID**: `68d78834-f9ec-4f71-b64b-172e9281e832` (ja vem preenchido por padrao).
- **Drive ID do cofre**: `b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4` (ja vem por padrao).
- Salvar. Depois, na aba **Cerebro** ou **Projetos**, toque em **Conectar M365** e faca login.

---

## 5. Instalar no celular
Abra a URL (passo 1) no **Chrome (Android)** ou **Safari (iPhone)** → menu → **"Adicionar a tela inicial"**.
Vira um icone como app nativo.

---

## 6. Tabela de valores prontos (referencia rapida)
| Item | Valor |
|---|---|
| Repo | `junidaniel-alt/docs` (pasta `agente-damha/`) |
| URL de producao / Redirect URI | `https://junidaniel-alt.github.io/docs/agente-damha/` |
| Azure Client ID | `68d78834-f9ec-4f71-b64b-172e9281e832` |
| Drive ID do cofre | `b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4` |
| Raiz do cofre (CEREBRO DO CLOUDE) | `01KCR6ZALNPTVWS2LBS5HYFDHIWJ3QGS7E` |
| Pasta PROJETOS (HTML) | `01KCR6ZAM72SON7SWCM5AKWEM6K3AOZLWD` |
| Pasta ATAS (12_REUNIOES_ATAS) | `01KCR6ZANXHH44ZF6OHVDJLZBY4K4WPQSY` |
| Permissoes Graph (delegadas) | `User.Read`, `Files.Read.All`, `Sites.Read.All` |

---

## 7. Solucao de problemas
- **Login falha / nao entra** → Redirect URI no Azure diferente da URL real (passo 2.4). Corrija e tente.
- **App nao atualiza** → cache do celular. Feche e abra; confira a `APP_VERSION` no canto da abertura.
- **Conversa nao responde** → chave/provedor errados no Config, ou modelo inexistente. Revise o passo 4.
- **Voz nao "ouve" no iPhone** → reconhecimento por navegador e instavel no iOS; use o microfone do teclado. (A voz de SAIDA funciona normal.)
- **HTML de projeto incompleto** → relatorios que puxam imagem por caminho relativo do OneDrive podem nao mostrar essa parte no iframe; relatorios autossuficientes abrem inteiros.

---

> **Status (14/06/2026):** todos os passos concluidos — app no ar, Azure OK, login funcionando em producao.
