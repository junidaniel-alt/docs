# Molde de vídeo de introdução (HyperFrames)

Molde reutilizável de uma abertura animada com gradiente colorido, em 3 cenas
(saudação + nome → tagline → palavras-chave). Todo o conteúdo é **parametrizado
por variáveis**, então você reusa o mesmo molde só trocando os textos.

## Formatos disponíveis

| Formato            | Arquivo                          | Dimensões  |
| ------------------ | -------------------------------- | ---------- |
| Horizontal (16:9)  | `index.html`                     | 1920×1080  |
| Vertical (9:16)    | `compositions/intro-vertical.html` | 1080×1920 |
| Quadrado (1:1)     | `compositions/intro-square.html`   | 1080×1080 |

## Variáveis do molde

| Variável   | Significado          | Padrão                            |
| ---------- | -------------------- | --------------------------------- |
| `name`     | Nome em destaque     | `Juni Daniel`                     |
| `hello`    | Saudação (kicker)    | `OLÁ 👋`                          |
| `subtitle` | Subtítulo da cena 1  | `prazer em te mostrar`            |
| `tagline`  | Frase da cena 2      | `Explorando IA & criação de vídeo`|
| `kw1/2/3`  | 3 palavras-chave     | `IA` / `Vídeo` / `Inovação`       |
| `footer`   | Rodapé da cena 3     | `feito com HyperFrames`           |

## Como gerar um vídeo a partir do molde

```bash
cd video-demo

# Horizontal, com seus próprios textos:
npx hyperframes render \
  --variables '{"name":"Seu Nome","tagline":"Sua frase","kw1":"X","kw2":"Y","kw3":"Z"}'

# Vertical (Reels/Shorts/Stories):
npx hyperframes render -c compositions/intro-vertical.html \
  -o renders/meu-video-vertical.mp4 \
  --variables '{"name":"Seu Nome"}'
```

O MP4 sai em `renders/`. Pré-visualizar no navegador: `npm run dev`.

> Observação: o GSAP está embutido localmente (`gsap.min.js`) para a renderização
> funcionar sem depender de CDN/internet.
