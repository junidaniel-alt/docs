# AI Image Generation — Setup

Como gerar imagens com a skill `ai-image-generation` (FLUX, GPT-Image, Gemini,
Grok, Seedream e +50 modelos via [inference.sh](https://inference.sh) / CLI `belt`).

A skill já está versionada neste repo em `.claude/skills/ai-image-generation/`,
junto com a skill de apoio `.claude/skills/belt/`. O que falta é deixar o
ambiente capaz de **executar** o `belt` — abaixo estão os dois cenários.

---

## Cenário A — Sessão na nuvem (Claude Code on the web)

Por padrão o ambiente web roda com a política de rede **Trusted**, que **bloqueia
`inference.sh`** (retorna HTTP 403). Para habilitar, é preciso editar o ambiente
na interface web (não dá para fazer de dentro da sessão).

### 1. Liberar a rede

No app web: ícone de nuvem (seletor de ambiente) → editar ambiente →
**Network access** → **Custom** → campo **Allowed domains**:

```
inference.sh
*.inference.sh
```

- `*.inference.sh` cobre `cli.inference.sh` (instalação), `cloud.inference.sh`
  (arquivos gerados) e a API.
- O apex `inference.sh` precisa entrar separado — o `*.` não casa com o domínio raiz.
- Marque **"Also include default list of common package managers"** para manter
  GitHub/npm/etc. liberados.

### 2. Instalar o belt automaticamente

No mesmo diálogo, em **Setup script**:

```bash
curl -fsSL cli.inference.sh | sh
```

O binário fica em cache e estará pronto em cada nova sessão.

### 3. Autenticação (headless)

> ⚠️ `belt login` é interativo (abre navegador) e **não funciona em sessões na
> nuvem**. É necessário um token/API key da inference.sh como variável de ambiente.

No campo **Environment variables** (formato `.env`):

```
BELT_API_KEY=seu_token_aqui
```

> O nome exato da variável de auth headless deve ser confirmado em
> **inference.sh → Settings → API keys**. Se for diferente, ajuste aqui.

---

## Cenário B — Máquina local (mais simples)

Na sua máquina a rede é livre e o login por navegador funciona:

```bash
# instalar o belt
curl -fsSL cli.inference.sh | sh

# autenticar (abre o navegador)
belt login
belt me

# gerar uma imagem
belt app run openai/gpt-image-2 \
  --input '{"prompt": "um gato astronauta no espaço", "quality": "high"}' \
  --save imagem.png
```

---

## Modelos úteis

| Modelo | App ID | Melhor para |
|--------|--------|-------------|
| GPT-Image-2 | `openai/gpt-image-2` | text-to-image, edição, inpainting |
| FLUX Dev LoRA | `falai/flux-dev-lora` | alta qualidade com estilos custom |
| Gemini 3 Pro | `google/gemini-3-pro-image-preview` | modelo mais recente do Google |
| Grok Imagine | `xai/grok-imagine-image` | múltiplos aspect ratios |
| Seedream 4.5 | `bytedance/seedream-4-5` | qualidade cinematográfica 2K–4K |
| Topaz Upscaler | `falai/topaz-image-upscaler` | upscaling profissional |

Listar todos: `belt app store --category image`

---

## Alternativa sem inference.sh

Os conectores MCP (ex.: **Canva**) roteiam o tráfego pelos servidores da Anthropic,
então funcionam **sem** alterar a política de rede do ambiente — são uma opção
de fallback quando o `belt`/inference.sh não estiver disponível. A qualidade é de
design/pôster, não de foto IA pura.
