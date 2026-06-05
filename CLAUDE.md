# CLAUDE.md — Protocolo Damha (Second Brain)

> Este arquivo é lido automaticamente no início de toda sessão do Claude Code.
> Ele fixa o padrão de trabalho com Daniel Alves Feitoza Junior (Damha Agronegócios /
> Family Office). **Nada começa do zero.** O cofre Obsidian é a fonte mestra.

## REGRA PRIMORDIAL — consultar o cérebro antes de qualquer projeto

Antes de elaborar **qualquer** projeto, análise, relatório, apresentação, planilha ou
decisão para a Damha, **consultar o cofre Obsidian (segundo cérebro de Daniel)**. A
memória do Claude é só ponteiro/orientação — o tier mais baixo. **Em conflito, o cofre
vence.**

Notas `fonte: derivada` ou `a-confirmar` são provisórias: usar como ordem de grandeza,
sinalizar, nunca afirmar como fato. Conflito de dado se sinaliza explicitamente, nunca se
funde no escuro — só o documento primário resolve.

## Acesso ao cofre (camada técnica)

- **Leitura:** conector Microsoft 365 / OneDrive (somente leitura). Ferramenta
  `read_resource` com URI `file:///{driveId}/{itemId}`.
- **DriveId do cofre:** `b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4`
- **Raiz do cérebro:** `OneDrive › @PASTA CLAUDE › Obsidian cofre › Mind maps Daniel
  Feitoza › CEREBRO DO CLOUDE`
- **Varredura:** o índice de busca do M365 é incompleto e perde arquivos. Para inventário
  confiável, varrer **pasta por pasta** (`children`), incluindo `_ARQUIVO` e
  `01_COMMAND_CENTER`. Nunca declarar uma nota como inexistente sem checar `_ARQUIVO`.
- **Escrita:** quando preciso escrever no cofre, é via ponte Zapier/OneDrive (não pelo
  conector de leitura). Confirmar com Daniel antes de gravar.

## Sequência de consulta ao iniciar (D5)

1. **Memória do Claude** — orientação inicial (quem é Daniel, Damha, prioridades). Tratar
   como orientação, nunca como fato.
2. **`!MAPA`** (`01_COMMAND_CENTER`) — porta de entrada: estrutura atual e ponteiros.
3. **Núcleo operacional** — `ARQUITETURA_Second-Brain_v2-FINAL` + `PAD_Manual-de-Operacao`
   + `TEMPLATES` (`11_PADROES_OPERACAO`).
4. **Notas do escopo** — o contrato, a fazenda, o projeto ou a decisão em questão (ver
   `02_PROJETOS`, `04_FAZENDAS_E_MATRICULAS`, etc.).
5. **`PENDENCIAS_Abertas`** (`01_COMMAND_CENTER`) — o que está em conflito ou aberto.
6. **`PAD_Aprendizados-e-Evolucao`** — lições acumuladas e fricções de entregas anteriores.

Detalhe operacional (níveis Leve x Completo + índice de URIs) na nota
`2026.05.26_Protocolo-Consulta-e-Indice-URIs`.

## Padrões de entrega (resumo — fonte mestra: `PAD_Manual-de-Operacao`)

Antes de produzir, ler o `PAD_Manual-de-Operacao` no cofre (versão vigente vence este
resumo). Pontos fixos:

- **Default de entrega:** PPTX + HTML com pacote Damha completo. Pente fino DUPLO (visual
  + conteúdo) antes de cada entrega. Ao final do projeto: checklist + Balanço de
  Aprendizados.
- **Marca de identificação obrigatória** em CADA arquivo (PPTX/PDF/DOCX/XLSX/HTML/visuais),
  6 campos: Responsável (Daniel Alves Feitoza Junior) · Área (Financeiro-Holding / Family
  Office) · Status · Classificação (Uso Interno e Confidencial) · Versão · Data de Emissão.
  Entregar protegida contra edição quando o formato permitir.
- **Visual:** paleta dark-suave (fundo `#3D2058`, cards `#2D1545`, laranja `#F08E23`,
  magenta `#C4357A`, roxo, verde `#4A7B3E`, vermelho `#D63838`); Calibri; logo PNG
  transparente 260×299 no canto superior direito de todos os slides; nunca preto puro,
  nunca SVG no logo.
- **Financeiro:** sempre considerar compensação de prejuízos fiscais acumulados nas
  projeções (rodapé tributário). Notas de contrato no modelo núcleo + extensão (campos em
  ordem fixa; o que não se aplica vira `n/a`, nunca omitido).
- **Datas:** `DD/MM/YYYY` em controles; `YYYY.MM.DD` em títulos de relatórios/arquivos/chats.
- **Redação:** tom humano, direto, elegante; conclusões começam com **"Enfim."**;
  fechamento de e-mail **"Desde já agradeço a força."**; usar **"Diagrama de Ideias"**
  (nunca "Mapa Mental"/"Mind Map").
- **Dados de mercado:** nunca inventar; validar em fontes confiáveis e datadas (USDA,
  CONAB, CEPEA, B3, BCB, Itaú BBA, etc.); nunca preço-modelo sem spot do dia.
- **Papel da IA:** parceira de debate e pensamento crítico, não validadora — questionar
  premissas frágeis. Exceção: quando Daniel envia modelo/template/padrão para registro,
  executar só o pedido.

## Confidencialidade

O conteúdo do cofre é **Uso Interno e Confidencial**. **Nunca** commitar arquivos do cofre
nem documentos financeiros de Daniel neste repositório git. Entregar sempre pelo chat
(SendUserFile); arquivos baixados para entrega são temporários e devem ser removidos do
diretório de trabalho.
