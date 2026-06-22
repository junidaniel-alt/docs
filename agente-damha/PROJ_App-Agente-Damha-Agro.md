---
tipo: projeto
titulo: "App Agente Damha Agro (PWA — copiloto de voz + Base DAMHA + STUDIO)"
status: ativo
tags: [projeto, app, pwa, copiloto, voz, cofre, studio, mercado, cambio, omega]
criado: 2026-06-14
atualizado: 2026-06-16
verificado: 2026-06-16
fonte: primaria
confiabilidade: alta
relacionados: ["[[PROJ_Mission-Control-Mercado-Futuro]]", "[[PROJ_Second-Brain]]", "[[!MAPA]]"]
responsavel: Daniel Alves Feitoza Junior
area: Financeiro-Holding / Family Office
classificacao: Uso Interno e Confidencial
versao: 1.72
---

# 📱 Projeto — App Agente Damha Agro

> **NOTA-PONTEIRO.** Esta nota NAO guarda o codigo — ela APONTA para a fonte unica (o repositorio).
> O codigo e a continuidade vivem no git; aqui fica so o endereco e o como-retomar, para o projeto
> ser ENCONTRAVEL a partir do cerebro/qualquer chat. Em conflito, vale o repositorio.

## 🔑 Frase-gatilho (retomar em qualquer chat)
Abra um chat do Claude Code apontando para o repo abaixo e diga:
> **"App Agente Damha Agro"** — leia `agente-damha/CONTINUIDADE.md` e [sua ordem].

O Claude do momento le o `CONTINUIDADE.md` + o codigo e retoma com todo o historico. Apagar o chat
NAO apaga o projeto — o vinculo e o repositorio.

## 📍 Onde mora (fonte unica)
| Coisa | Onde |
|---|---|
| Repositorio | **`junidaniel-alt/docs`** (GitHub) |
| Pasta do app | `agente-damha/` |
| Branch de trabalho | `claude/grafana-dashboards-skill-4zpkji` |
| Continuidade (o "vinculo") | `agente-damha/CONTINUIDADE.md` |
| Guia do zero | `agente-damha/GUIA_INSTALACAO.md` |
| Hospedagem (PWA) | GitHub Pages → `https://junidaniel-alt.github.io/docs/agente-damha/` |
| Versao atual | v1.72 (ver `APP_VERSION` em `agente-damha/app.js`) |

## 💻 Quer uma pasta LOCAL no PC (junto do Mission Control)?
Nao copie a mao (gera versoes divergentes). **Clone** o repo dentro da sua `PASTA CLAUDE\PROJETOS`:
```powershell
cd "<...>\PASTA CLAUDE\PROJETOS"
git clone -b claude/grafana-dashboards-skill-4zpkji https://github.com/junidaniel-alt/docs.git 2026.06.16_App-Agente-Damha-Agro
```
Para atualizar depois: `git pull`. Assim a pasta local fica SEMPRE igual a fonte.

## 🧩 Projetos irmaos (nao confundir)
- **App Agente Damha Agro** (este): PWA no GitHub/celular. Botao **CEREBRO OMEGA** abre o painel abaixo.
- **CEREBRO OMEGA CONTROL**: servidor Python no PC (porta 8777, via Tailscale/Cloudflare) — projeto
  separado `2026.06.17_CEREBRO_Control_Omega`. O app so tem um BOTAO que aponta pra ele.

## ⏭ Proximos passos
Ver secao 8 do `CONTINUIDADE.md` (Cloudflare no OMEGA, confidencialidade, cotacao real, persistencia,
religar mascote).
