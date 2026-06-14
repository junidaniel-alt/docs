/* ===========================================================================
   Agente DAMHA — PWA cliente (roda 100% no aparelho, sem servidor nosso)
   - Voz: Web Speech API (entrada) + SpeechSynthesis (saida)
   - Claude: chamada direta a api.anthropic.com (chave fica no localStorage)
   - Cofre: Microsoft Graph via MSAL (login M365 do proprio Daniel)
   - Egress: hibrido com confirmacao (padrao) — nada do cofre sai sem aprovar
   =========================================================================== */

const DEFAULTS = {
  apiKey: "",
  provider: "gemini",
  model: "gemini-2.0-flash-lite",
  egress: "hibrido",
  voiceName: "",   // "" = automatica (feminina pt-BR)
  pitch: 1.3,      // tom (0.5 grave .. 2 agudo/jovem)
  rate: 1.06,      // velocidade
  // Client ID do registro Azure "Agente DAMHA" (publico, nao e segredo)
  azureClient: "68d78834-f9ec-4f71-b64b-172e9281e832",
  // driveId do cofre (CLAUDE.md secao 3)
  driveId: "b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4",
};
// Versao do app (mostrada no canto da abertura). Bumpar a cada release.
const APP_VERSION = "1.32";
// Pasta raiz do cofre (CLAUDE.md secao 3)
const ROOT_FOLDER = "01KCR6ZALNPTVWS2LBS5HYFDHIWJ3QGS7E";

// Notas-nucleo: acesso direto por itemId (CLAUDE.md secao 3, Indice de URIs)
const NUCLEO = [
  { name: "!MAPA", id: "01KCR6ZAPIEOGYJSCJ4ZGIF5WY54FH6R7A" },
  { name: "PAD_Manual", id: "01KCR6ZAOM25YZGXL5LNCZANX2MEYHNNGY" },
  { name: "ARQUITETURA", id: "01KCR6ZAKGC25BLOMNBZF2N5AR2HLFY4PS" },
  { name: "TEMPLATES", id: "01KCR6ZALAYY6H552IKJGYQQURAB5UOHXE" },
  { name: "PAD_Aprendizados", id: "01KCR6ZAOMHFOMRCH65ZBISFOO4MWJA24M" },
  { name: "PENDENCIAS", id: "01KCR6ZAMTVRHJBDI4JJBIGBGXUE455XPS" },
  { name: "Protocolo-URIs", id: "01KCR6ZAO6J2273VOUJBFJB2EJ5JPGZQUS" },
];

// Papel da IA (CLAUDE.md secao 1 e 2) — embutido como system prompt do agente.
const SYSTEM_PROMPT = `Voce e a Maria Sarah, copiloto e mascote da Damha Agro (family office de Daniel) — parceira de debate e pensamento critico, NAO validadora.
Questione premissas frageis (logica, emocional, estrategica), aponte vieses, racionalizacoes, riscos e a visao contraria mais forte.
Diferencie fato, interpretacao e opiniao; sinalize incerteza; nunca invente dados, fontes ou cenarios.
Regra primordial: nada comeca do zero — a Base DAMHA (base de dados propria da DAMHA) e a fonte mestra; em conflito, ela vence.
Tom natural, humano, direto e elegante. Conclusoes comecam com "Enfim.". Datas em DD/MM/YYYY.
Quando receber o conteudo de um arquivo da Base DAMHA como contexto, trate-o como fonte e raciocine sobre ele.`;

let cfg = loadCfg();
let history = [];          // historico da conversa [{role, content}]
let pendingNoteContext = null; // nota aprovada para envio (egress hibrido)
let lastOpenedNote = null; // ultima nota aberta no Cerebro {title, body}
let msalApp = null;
let folderStack = [];      // navegacao do cofre
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Som de abertura (chime leve, no 1o toque — autoplay e bloqueado) ---------- */
let _openSoundDone = false;
function openChime() {
  if (_openSoundDone || localStorage.getItem("openSound") === "0") return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const ac = new Ctx(); const now = ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {  // C-E-G-C, suave
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.6);
    });
    _openSoundDone = true;
  } catch (e) { /* sem audio: ignora */ }
}
function armOpenSound() {
  const h = () => { openChime(); window.removeEventListener("pointerdown", h); window.removeEventListener("keydown", h); };
  window.addEventListener("pointerdown", h, { once: true });
  window.addEventListener("keydown", h, { once: true });
}

/* ---------- Chavinhas do copiloto (Conversa) ---------- */
const TOGGLES = ["togInternet", "togCerebro", "togContexto", "togVoz"];
const togState = (id) => localStorage.getItem("tog_" + id) === "1";
function setTog(id, on) { localStorage.setItem("tog_" + id, on ? "1" : "0"); el(id).classList.toggle("on", on); }
function initToggles() {
  if (localStorage.getItem("tog_togVoz") === null) localStorage.setItem("tog_togVoz", "1"); // voz on por padrao
  TOGGLES.forEach((id) => {
    el(id).classList.toggle("on", togState(id));
    el(id).onclick = () => setTog(id, !togState(id));
  });
}

/* ---------- Config ---------- */
function loadCfg() {
  try {
    const c = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("agenteDamhaCfg") || "{}") };
    if (/^gemini-1\.5/.test(c.model || "")) c.model = "gemini-2.0-flash"; // Gemini 1.5 foi descontinuado
    return c;
  } catch { return { ...DEFAULTS }; }
}
function saveCfg() {
  cfg = {
    apiKey: el("apiKey").value.trim(),
    provider: el("provider").value,
    model: el("model").value.trim(),
    egress: el("egress").value,
    voiceName: el("voiceSel").value,
    pitch: parseFloat(el("voicePitch").value) || 1.3,
    rate: parseFloat(el("voiceRate").value) || 1.06,
    azureClient: el("azureClient").value.trim(),
    driveId: el("driveId").value.trim() || DEFAULTS.driveId,
  };
  localStorage.setItem("agenteDamhaCfg", JSON.stringify(cfg));
  el("cfgStatus").textContent = "Salvo neste aparelho. " + new Date().toLocaleTimeString("pt-BR");
}
// Versoes selecionaveis por provedor (id = nome real da API; label = texto claro)
const MODELS = {
  gemini: [
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite — funcionando aqui (recomendado)" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — igual ao STUDIO" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — topo (pode exigir billing)" },
  ],
  claude: [
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — equilibrio (recomendado)" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 — mais capaz" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — rapido/barato" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini — rapido/barato" },
    { id: "gpt-4o", label: "GPT-4o — capaz" },
    { id: "gpt-4.1", label: "GPT-4.1 — mais novo" },
  ],
};
function populateModels(provider, selected) {
  const sel = el("model");
  sel.innerHTML = "";
  (MODELS[provider] || []).forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.label;
    if (m.id === selected) o.selected = true;
    sel.appendChild(o);
  });
}
// Mensagem de erro amigavel por status HTTP
function apiError(provider, status, text) {
  if (status === 429) return `Limite/cota do ${provider} atingido. Troque o modelo em Config (ex.: Gemini 2.0 Flash-Lite) ou aguarde ~1 min.`;
  if (status === 401 || status === 403) return `Chave do ${provider} invalida ou sem permissao. Revise a chave em Config.`;
  if (status === 400 || status === 404) return `Modelo do ${provider} indisponivel para essa chave. Escolha outro modelo em Config.`;
  return `Erro ${provider} (${status}): ${String(text).slice(0, 160)}`;
}
function hydrateCfgForm() {
  el("apiKey").value = cfg.apiKey;
  el("provider").value = cfg.provider || "gemini";
  populateModels(cfg.provider || "gemini", cfg.model);
  el("egress").value = cfg.egress;
  populateVoices();
  el("voiceSel").value = cfg.voiceName || "";
  el("voicePitch").value = cfg.pitch;
  el("voiceRate").value = cfg.rate;
  el("azureClient").value = cfg.azureClient;
  el("driveId").value = cfg.driveId;
}
function populateVoices() {
  const sel = el("voiceSel"); if (!sel) return;
  const vs = ("speechSynthesis" in window) ? window.speechSynthesis.getVoices() : [];
  const pt = vs.filter((v) => /^pt/i.test(v.lang));
  const others = vs.filter((v) => !/^pt/i.test(v.lang));
  const list = [...pt, ...others]; // todas as vozes do aparelho, pt-BR primeiro
  const cur = sel.value || cfg.voiceName || "";
  sel.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = ""; auto.textContent = "Automatica (feminina pt-BR)";
  sel.appendChild(auto);
  list.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.name; o.textContent = v.name + " (" + v.lang + ")";
    if (v.name === cur) o.selected = true;
    sel.appendChild(o);
  });
}

const el = (id) => document.getElementById(id);

/* ---------- Chat / Claude ---------- */
function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  el("chat").appendChild(d);
  el("chat").scrollTop = el("chat").scrollHeight;
  return d;
}
// Markdown leve e seguro (escapa HTML) para as respostas da IA.
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function mdToHtml(t) {
  let s = escapeHtml(t);
  s = s.replace(/```([\s\S]*?)```/g, (m, c) => `<pre>${c.trim()}</pre>`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/^\s{0,3}#{1,4}\s*(.+)$/gm, "<strong>$1</strong>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/^\s*[-*•]\s+(.+)$/gm, "&bull; $1");
  s = s.replace(/\n/g, "<br>");
  return s;
}
function addBotMsg(text) {
  const d = document.createElement("div");
  d.className = "msg bot";
  const ch = extractBlock(text, "chart");
  const op = extractBlock(ch.rest, "options");
  d.innerHTML = mdToHtml(op.rest || ((ch.data || op.data) ? "" : text));
  if (ch.data) d.appendChild(renderChart(ch.data));
  if (op.data) d.appendChild(renderOptions(op.data));
  el("chat").appendChild(d);
  el("chat").scrollTop = el("chat").scrollHeight;
  return d;
}
// Extrai um bloco cercado ```tag {json}``` da resposta (o resto vira texto).
function extractBlock(t, tag) {
  const re = new RegExp("```" + tag + "\\s*([\\s\\S]*?)```", "i");
  const m = t.match(re);
  if (!m) return { rest: t, data: null };
  let data = null;
  try { data = JSON.parse(m[1].trim()); } catch { data = null; }
  return { rest: t.replace(m[0], "").trim(), data };
}
function extractChart(t) { const r = extractBlock(t, "chart"); return { rest: r.rest, spec: r.data }; }
// Texto limpo (sem blocos chart/options) para a leitura em voz.
function plainForSpeech(t) {
  return extractBlock(extractBlock(t, "chart").rest, "options").rest.replace(/[*#`>_]/g, "");
}
// Botoes de escolha: a Maria Sarah pergunta primeiro e o toque envia a resposta.
function renderOptions(spec) {
  const box = document.createElement("div");
  box.className = "chips"; box.style.marginTop = "8px";
  (spec.options || []).forEach((o) => {
    const b = document.createElement("button");
    b.className = "chip-s"; b.textContent = o;
    b.onclick = () => { el("input").value = o; sendMessage(); };
    box.appendChild(b);
  });
  return box;
}
function fmtNum(v) {
  return Math.abs(v) >= 1000
    ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function chartSVG(spec, type) {
  const W = 520, H = 240, P = 38;
  const labels = spec.labels || [];
  const series = (spec.series || []).filter((s) => Array.isArray(s.data) && s.data.length);
  if (!series.length) return "<div class='muted'>(sem dados no painel)</div>";
  const all = series.flatMap((s) => s.data);
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  const n = Math.max(1, (labels.length || series[0].data.length) - 1);
  const X = (i) => P + i * ((W - 2 * P) / n);
  const Y = (v) => H - P - ((v - min) / range) * (H - 2 * P);
  const colors = ["#6FCF6F", "#F08E23", "#C4357A", "#B8D4E8", "#DCD4E5"];
  let g = "";
  [max, (min + max) / 2, min].forEach((v) => {
    const yy = Y(v);
    g += `<line x1="${P}" y1="${yy}" x2="${W - P}" y2="${yy}" stroke="#5E3287" stroke-width="1" opacity="0.4"/>`;
    g += `<text x="4" y="${yy + 3}" fill="#B9AECB" font-size="10">${fmtNum(v)}</text>`;
  });
  if (type === "bar") {
    const s = series[0], step = (W - 2 * P) / s.data.length;
    s.data.forEach((v, i) => {
      const cx = P + (i + 0.5) * step, yy = Y(v);
      g += `<rect x="${cx - step * 0.3}" y="${yy}" width="${step * 0.6}" height="${H - P - yy}" fill="${colors[0]}" rx="2"/>`;
    });
  } else {
    series.forEach((s, si) => {
      const pts = s.data.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${colors[si % colors.length]}" stroke-width="2"/>`;
    });
  }
  [0, Math.round(n / 2), n].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => {
    if (labels[i] != null) g += `<text x="${X(i)}" y="${H - 12}" fill="#B9AECB" font-size="10" text-anchor="middle">${escapeHtml(String(labels[i]))}</text>`;
  });
  const leg = series.map((s, si) => `<span style="color:${colors[si % colors.length]}">&#9632; ${escapeHtml(s.name || ("serie " + (si + 1)))}</span>`).join(" &nbsp; ");
  return `<div class="pc-leg">${leg}</div><svg viewBox="0 0 ${W} ${H}" class="pc-svg" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
function renderChart(spec) {
  const box = document.createElement("div");
  box.className = "panelchart";
  const type = spec.type === "bar" ? "bar" : "line";
  box.innerHTML = `<div class="pc-title">&#128202; ${escapeHtml(spec.title || "Painel")}</div>`
    + chartSVG(spec, type)
    + `<div class="pc-cap">&#9889; painel${spec.source ? " &middot; " + escapeHtml(spec.source) : ""} &middot; toque para ampliar</div>`;
  box.onclick = () => openChartModal(spec);
  return box;
}
// Modal de grafico em tela cheia (clica e "sai da tela")
let _modalSpec = null, _modalType = "line";
function openChartModal(spec) {
  _modalSpec = spec; _modalType = spec.type === "bar" ? "bar" : "line";
  el("cmTitle").textContent = spec.title || "Painel";
  drawModal();
  el("chartModal").classList.remove("hidden");
}
function drawModal() {
  el("cmBody").innerHTML = chartSVG(_modalSpec, _modalType);
  document.querySelectorAll("#chartModal [data-ct]").forEach((b) => b.classList.toggle("on", b.dataset.ct === _modalType));
}
function closeChartModal() { el("chartModal").classList.add("hidden"); }
// Chips de sugestao
const SUGGEST = [
  "Me surpreenda", "Por que o dolar mexeu hoje?", "Compare USD, soja, milho e boi",
  "Grafico ilustrativo da curva do dolar", "Resuma o que voce faz",
];
function renderSuggest() {
  const box = el("suggest");
  box.innerHTML = "";
  SUGGEST.forEach((s) => {
    const b = document.createElement("button");
    b.className = "chip-s";
    b.textContent = s;
    b.onclick = () => { el("input").value = s; sendMessage(); };
    box.appendChild(b);
  });
}

async function sendMessage() {
  const text = el("input").value.trim();
  if (!text) return;
  if (!cfg.apiKey) { addMsg("Configure a chave da API em Config (Gemini ou Claude).", "err"); return; }

  el("input").value = "";
  addMsg(text, "user");

  // Contexto do cofre: nota aprovada (Analisar) ou, com as chavinhas Cerebro/Contexto,
  // a ultima nota aberta (respeitando o egress hibrido = confirma antes de enviar).
  let ctxNote = pendingNoteContext;
  if (!ctxNote && (togState("togCerebro") || togState("togContexto")) && lastOpenedNote) {
    if (cfg.egress === "local") {
      ctxNote = null;
    } else if (cfg.egress === "hibrido") {
      if (confirm(`Anexar "${lastOpenedNote.title}" (Base DAMHA, Uso Interno) a esta pergunta?`)) ctxNote = lastOpenedNote;
    } else {
      ctxNote = lastOpenedNote;
    }
  }
  let userContent = text;
  if (ctxNote) {
    userContent = `Contexto (Base DAMHA "${ctxNote.title}"):\n\n${ctxNote.body}\n\n---\nPergunta: ${text}`;
    pendingNoteContext = null;
  }
  history.push({ role: "user", content: userContent });

  // Sistema dinamico conforme as chavinhas.
  let sys = SYSTEM_PROMPT;
  if (togState("togCerebro")) sys += "\n\nA Base DAMHA e a fonte mestra: priorize-a e sinalize claramente quando faltar dado (peca para o Daniel abrir o arquivo na Base DAMHA).";
  sys += "\n\nVoce e a Maria Sarah, copiloto da Damha Agro. Quando ajudar a explicar, PODE incluir UM grafico: um unico bloco de codigo cercado por tres crases iniciado pela palavra chart, contendo JSON {\"title\":\"...\",\"type\":\"line\" ou \"bar\",\"labels\":[...],\"series\":[{\"name\":\"...\",\"data\":[numeros]}],\"source\":\"...\"}. No maximo 12 pontos. Se nao tiver dados reais, marque \"source\":\"ilustrativo\".";
  sys += "\n\nPERGUNTE PRIMEIRO, nao adivinhe: quando o pedido for ambiguo ou exigir uma escolha (ex.: de qual fonte de dados puxar, qual fazenda, qual periodo, se busca na Base DAMHA ou se o Daniel mostra o arquivo), escreva a pergunta curta e inclua UM bloco cercado por tres crases iniciado pela palavra options com JSON {\"options\":[\"opcao 1\",\"opcao 2\"]} (2 a 4 opcoes curtas). O Daniel toca numa opcao e voce segue. O restante da resposta vai em texto normal (markdown leve).";
  const wantWeb = togState("togInternet");

  setStatus(wantWeb && cfg.provider === "gemini" ? "Pensando (com internet)..." : "Pensando...");
  try {
    const reply = cfg.provider === "claude" ? await callClaude(sys)
                : cfg.provider === "openai" ? await callOpenAI(sys)
                : await callGemini(sys, wantWeb);
    history.push({ role: "assistant", content: reply });
    addBotMsg(reply);
    setStatus("");
    if (togState("togVoz")) speak(plainForSpeech(reply));
  } catch (e) {
    addMsg(e.message || ("Falha: " + e), "err");
    setStatus("");
  }
}

async function callClaude(sys = SYSTEM_PROMPT) {
  const model = (cfg.model || "").startsWith("claude") ? cfg.model : "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 1500, system: sys, messages: history }),
  });
  if (!res.ok) throw new Error(apiError("Claude", res.status, await res.text()));
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("").trim();
}

async function callGemini(sys = SYSTEM_PROMPT, web = false) {
  const chosen = (cfg.model || "").startsWith("gemini") ? cfg.model : "gemini-2.0-flash-lite";
  const candidates = [chosen];
  ["gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"].forEach((m) => { if (!candidates.includes(m)) candidates.push(m); });
  const contents = history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body = { contents, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } };
  if (web) body.tools = [{ google_search: {} }]; // grounding de busca do Google (internet)
  let lastErr = "";
  let triedNoTools = false;
  for (let ci = 0; ci < candidates.length; ci++) {
    const model = candidates[ci];
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        const cand = data.candidates && data.candidates[0];
        return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim()
          || "(resposta vazia — tente reformular)";
      }
      const status = res.status;
      lastErr = apiError("Gemini", status, await res.text());
      if ((status === 400 || status === 403) && body.tools && !triedNoTools) {
        delete body.tools; triedNoTools = true; // busca web nao habilitada: responde sem internet
        setStatus("Busca web indisponivel nessa chave — respondendo sem internet...");
        continue;
      }
      if (status === 401 || status === 403) throw new Error(lastErr); // chave: nao adianta repetir
      if (status === 429 && attempt === 0) { setStatus("Cota atingida — tentando de novo..."); await sleep(1800); continue; }
      break; // tenta o proximo modelo
    }
    if (ci < candidates.length - 1) setStatus("Trocando para " + candidates[ci + 1] + "...");
  }
  throw new Error(lastErr || "Falha no Gemini.");
}

async function callOpenAI(sys = SYSTEM_PROMPT) {
  const model = (cfg.model || "").startsWith("gpt") ? cfg.model : "gpt-4o-mini";
  const msgs = [{ role: "system", content: sys }, ...history];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.apiKey },
    body: JSON.stringify({ model, max_tokens: 1500, messages: msgs }),
  });
  if (!res.ok) throw new Error(apiError("OpenAI", res.status, await res.text()));
  const data = await res.json();
  return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
}

function setStatus(s) { el("status").textContent = s; }

/* ---------- Voz: saida (TTS) ---------- */
let chosenVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = window.speechSynthesis.getVoices().filter((v) => /^pt/i.test(v.lang));
  const fem = vs.find((v) => /(Maria|Luciana|Francisca|Fernanda|Vit[oó]ria|Heloisa|Joana|Catarina|female|mulher|feminin)/i.test(v.name));
  chosenVoice = fem || vs[0] || null;
  populateVoices();
}
if ("speechSynthesis" in window) { window.speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); }
function voiceByName(name) {
  const vs = ("speechSynthesis" in window) ? window.speechSynthesis.getVoices() : [];
  return (name && vs.find((v) => v.name === name)) || chosenVoice || null;
}
function stopSpeak() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }
function speakWith(text, pitch, rate, voiceName) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  const v = voiceByName(voiceName); if (v) u.voice = v;
  u.pitch = Math.max(0.5, Math.min(2, pitch || 1.3));
  u.rate = Math.max(0.5, Math.min(2, rate || 1.06));
  window.speechSynthesis.speak(u);
}
function speak(text) { speakWith(text, cfg.pitch, cfg.rate, cfg.voiceName); }
// Aplica a voz na hora (sem precisar de Salvar) e persiste.
function applyVoiceLive() {
  cfg.voiceName = el("voiceSel").value;
  cfg.pitch = parseFloat(el("voicePitch").value) || 1.3;
  cfg.rate = parseFloat(el("voiceRate").value) || 1.06;
  localStorage.setItem("agenteDamhaCfg", JSON.stringify(cfg));
}

/* ---------- Voz: entrada (STT) ---------- */
let recog = null, recording = false;
function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // iOS Safari geralmente cai aqui: use o microfone do teclado do iOS.
    el("micBtn").title = "Use o microfone do teclado (iOS)";
    el("micBtn").classList.add("hidden");
    return;
  }
  recog = new SR();
  recog.lang = "pt-BR";
  recog.interimResults = true;
  recog.continuous = false;
  recog.onresult = (ev) => {
    let t = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
    el("input").value = t;
  };
  recog.onend = () => {
    recording = false; el("micBtn").classList.remove("rec");
    // Maos-livres: terminou de falar -> envia sozinho (a resposta sai em voz se marcado).
    if (el("input").value.trim()) sendMessage();
  };
  recog.onerror = () => { recording = false; el("micBtn").classList.remove("rec"); };
}
function toggleMic() {
  if (!recog) return;
  if (recording) { recog.stop(); return; }
  recording = true; el("micBtn").classList.add("rec"); el("input").value = "";
  try { recog.start(); } catch { recording = false; el("micBtn").classList.remove("rec"); }
}

/* ---------- Cofre (M365 / Graph) — fluxo de REDIRECT (robusto no mobile) ---------- */
const SCOPES = ["Files.Read.All", "Sites.Read.All", "User.Read"];
// Client ID fixo do registro "Agente DAMHA" (evita valor errado salvo no aparelho).
const APP_CLIENT_ID = "68d78834-f9ec-4f71-b64b-172e9281e832";
function clientId() { return APP_CLIENT_ID; }
function buildMsal() {
  if (msalApp) return msalApp;
  if (typeof msal === "undefined" || !clientId()) return null;
  msalApp = new msal.PublicClientApplication({
    auth: {
      clientId: clientId(),
      authority: "https://login.microsoftonline.com/f797fa84-803b-43a9-a1c1-94378373252a",
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: "localStorage" },
  });
  return msalApp;
}
function revealCofre() {
  el("cofreAuth").classList.add("hidden");
  el("cofreBrowser").classList.remove("hidden");
}
async function openCofreRoot() {
  revealCofre();
  folderStack = [{ id: ROOT_FOLDER, name: "Cofre" }];
  await listFolder();
}
// No carregamento: processa o retorno do redirect e tenta token silencioso.
async function initAuthOnLoad() {
  const app = buildMsal();
  if (!app) return;
  await app.initialize();
  try {
    const resp = await app.handleRedirectPromise();
    if (resp && resp.accessToken) { window._cofreToken = resp.accessToken; applyAdm(); if (isAdmin()) await openCofreRoot(); return; }
  } catch (e) { addMsg("Erro ao voltar do login: " + e.message, "err"); }
  const acc = app.getAllAccounts()[0];
  if (acc) {
    try { const r = await app.acquireTokenSilent({ scopes: SCOPES, account: acc }); window._cofreToken = r.accessToken; }
    catch { /* precisa de login interativo */ }
  }
  applyAdm();
}
async function graph(path, token, asText = false) {
  const res = await fetch("https://graph.microsoft.com/v1.0" + path, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) throw new Error("Graph " + res.status);
  return asText ? res.text() : res.json();
}
async function ensureCofre() {
  if (window._cofreToken) return true;
  await cofreLogin();      // pode redirecionar (a pagina recarrega)
  return !!window._cofreToken;
}
async function cofreLogin() {
  el("cofreStatus").textContent = "Conectando...";
  const app = buildMsal();
  if (!app) {
    const m = typeof msal === "undefined"
      ? "A biblioteca de login (MSAL) nao carregou. Verifique a conexao e recarregue o app."
      : "Falta o Azure Client ID em Config.";
    el("cofreStatus").textContent = m;
    alert(m);
    return;
  }
  el("cofreStatus").textContent = "Redirecionando para o login da Microsoft...";
  await app.initialize();
  if (window._cofreToken) { await openCofreRoot(); return; }
  const acc = app.getAllAccounts()[0];
  if (acc) {
    try { const r = await app.acquireTokenSilent({ scopes: SCOPES, account: acc }); window._cofreToken = r.accessToken; applyAdm(); if (isAdmin()) await openCofreRoot(); return; }
    catch { /* cai para redirect */ }
  }
  await app.loginRedirect({ scopes: SCOPES }); // navega ao login da Microsoft; volta para o redirectUri
}
function renderNucleo() {
  const box = el("nucleo");
  box.innerHTML = "<span class='nucleo-label'>NUCLEO</span>";
  NUCLEO.forEach((n) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = n.name;
    b.onclick = async () => { if (await ensureCofre()) openNote(n.id, n.name); };
    box.appendChild(b);
  });
}
async function listFolder() {
  const cur = folderStack[folderStack.length - 1];
  renderCrumbs();
  el("noteView").classList.add("hidden");
  const ul = el("cofreList"); ul.innerHTML = "<li class='muted'>Carregando...</li>";
  try {
    const data = await graph(`/drives/${cfg.driveId}/items/${cur.id}/children?$top=200`, window._cofreToken);
    ul.innerHTML = "";
    (data.value || [])
      .filter((it) => it.folder || (it.name || "").endsWith(".md"))
      .sort((a, b) => (b.folder ? 1 : 0) - (a.folder ? 1 : 0) || a.name.localeCompare(b.name))
      .forEach((it) => {
        const li = document.createElement("li");
        li.textContent = (it.folder ? "\u{1F4C1} " : "\u{1F4C4} ") + it.name;
        li.onclick = () => it.folder ? (folderStack.push({ id: it.id, name: it.name }), listFolder())
                                     : openNote(it.id, it.name);
        ul.appendChild(li);
      });
    if (!ul.children.length) ul.innerHTML = "<li class='muted'>Pasta vazia.</li>";
  } catch (e) {
    ul.innerHTML = `<li class='muted'>Erro ao listar: ${e.message}</li>`;
  }
}
function renderCrumbs() {
  const c = el("crumbs"); c.innerHTML = "";
  folderStack.forEach((f, i) => {
    const a = document.createElement("a");
    a.textContent = f.name;
    a.onclick = () => { folderStack = folderStack.slice(0, i + 1); listFolder(); };
    c.appendChild(a);
    if (i < folderStack.length - 1) c.appendChild(document.createTextNode("  /  "));
  });
}
async function openNote(id, name) {
  el("noteTitle").textContent = name;
  el("noteBody").textContent = "Carregando...";
  el("noteView").classList.remove("hidden");
  try {
    const txt = await graph(`/drives/${cfg.driveId}/items/${id}/content`, window._cofreToken, true);
    el("noteBody").textContent = txt;
    lastOpenedNote = { title: name, body: txt };
    const btn = el("noteAnalyze");
    btn.classList.toggle("hidden", cfg.egress === "local");
    btn.onclick = () => analyzeNote(name, txt);
  } catch (e) {
    el("noteBody").textContent = "Erro ao abrir: " + e.message;
  }
}
function analyzeNote(title, body) {
  if (cfg.egress === "hibrido") {
    const ok = confirm(`Enviar a nota "${title}" para a IA (sai do aparelho)?\n\nEla e Uso Interno e Confidencial. So confirme se quiser que o conteudo seja analisado.`);
    if (!ok) return;
  }
  pendingNoteContext = { title, body };
  showView("conversa");
  el("input").value = `Analise a nota "${title}": `;
  el("input").focus();
  setStatus(`Nota "${title}" pronta para enviar na proxima mensagem.`);
}

/* ---------- Projetos (atalhos) ---------- */
/* ---------- Projetos (HTML do OneDrive: @PASTA CLAUDE/PROJETOS) ---------- */
const PROJETOS_FOLDER = "01KCR6ZAM72SON7SWCM5AKWEM6K3AOZLWD"; // @PASTA CLAUDE/PROJETOS
const ATAS_FOLDER = "01KCR6ZANXHH44ZF6OHVDJLZBY4K4WPQSY";     // cofre/12_REUNIOES_ATAS
let projStack = [];

function renderProjetos() {
  el("projLogin").onclick = openProjetos;
  el("projBack").onclick = () => {
    el("projViewer").classList.add("hidden");
    el("projBrowser").classList.remove("hidden");
  };
}
async function openProjetos() {
  el("projStatus").textContent = "Conectando...";
  if (!(await ensureCofre())) { el("projStatus").textContent = ""; return; }
  applyAdm();
  el("projAuth").classList.add("hidden");
  el("projBrowser").classList.remove("hidden");
  projStack = [{ id: "__ROOT__", name: "Inicio" }];
  await listProj();
}
function renderProjCrumbs() {
  const c = el("projCrumbs"); c.innerHTML = "";
  projStack.forEach((f, i) => {
    const a = document.createElement("a");
    a.textContent = f.name;
    a.onclick = () => { projStack = projStack.slice(0, i + 1); listProj(); };
    c.appendChild(a);
    if (i < projStack.length - 1) c.appendChild(document.createTextNode("  /  "));
  });
}
async function listProj() {
  const cur = projStack[projStack.length - 1];
  renderProjCrumbs();
  el("projViewer").classList.add("hidden");
  el("projBrowser").classList.remove("hidden");
  const ul = el("projList");
  if (cur.id === "__ROOT__") {
    ul.innerHTML = "";
    [["\u{1F4C1} Projetos", PROJETOS_FOLDER, "Projetos"],
     ["\u{1F4CB} Atas / Reunioes", ATAS_FOLDER, "Atas"]].forEach(([label, id, name]) => {
      const li = document.createElement("li");
      li.textContent = label;
      li.onclick = () => { projStack.push({ id, name }); listProj(); };
      ul.appendChild(li);
    });
    return;
  }
  ul.innerHTML = "<li class='muted'>Carregando...</li>";
  try {
    const data = await graph(`/drives/${cfg.driveId}/items/${cur.id}/children?$select=id,name,folder,file,webUrl&$top=200`, window._cofreToken);
    ul.innerHTML = "";
    (data.value || [])
      .sort((a, b) => (b.folder ? 1 : 0) - (a.folder ? 1 : 0) || b.name.localeCompare(a.name))
      .forEach((it) => {
        const isHtml = it.file && /\.html?$/i.test(it.name);
        const li = document.createElement("li");
        li.textContent = (it.folder ? "\u{1F4C1} " : isHtml ? "\u{1F310} " : "\u{1F4C4} ") + it.name;
        li.onclick = () => {
          if (it.folder) { projStack.push({ id: it.id, name: it.name }); listProj(); }
          else if (isHtml) openHtml(it.id, it.name);
          else if (it.webUrl) window.open(it.webUrl, "_blank");
        };
        ul.appendChild(li);
      });
    if (!ul.children.length) ul.innerHTML = "<li class='muted'>Pasta vazia.</li>";
  } catch (e) {
    ul.innerHTML = `<li class='muted'>Erro: ${e.message}</li>`;
  }
}
async function openHtml(id, name) {
  el("projBrowser").classList.add("hidden");
  el("projViewer").classList.remove("hidden");
  const frame = el("projFrame");
  frame.srcdoc = "<p style='font-family:sans-serif;padding:20px'>Carregando " + name + "...</p>";
  try {
    const html = await graph(`/drives/${cfg.driveId}/items/${id}/content`, window._cofreToken, true);
    frame.srcdoc = html;
  } catch (e) {
    frame.srcdoc = "<p style='color:#c00;font-family:sans-serif;padding:20px'>Erro ao abrir: " + e.message + "</p>";
  }
}

/* ---------- Sumario ativo ao rolar ---------- */
function initScrollSpy() {
  const links = [...document.querySelectorAll(".summary a")];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main section").forEach((s) => obs.observe(s));
}

/* ---------- Navegacao por views (menu inicial + atalhos) ---------- */
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".navlink").forEach((a) => a.classList.toggle("active", a.dataset.go === id));
  window.scrollTo(0, 0);
}
function initNav() {
  document.querySelectorAll("[data-go]").forEach((elm) => {
    elm.addEventListener("click", (e) => { e.preventDefault(); showView(elm.dataset.go); });
  });
  const title = document.querySelector(".topbar-title");
  if (title) title.addEventListener("click", () => showView("home"));
  showView("home");
}

/* ---------- Init ---------- */
/* ---------- Admin (Cerebro/cofre restrito ao administrador) ---------- */
// Trava principal: identidade Microsoft. Atalho secundario: PIN.
const ADMIN_EMAILS = ["daniel.feitoza@damhaagro.com.br"];
const ADM_PIN_SHA = "35d46b5eb946b2d6780a18fdc8ff61bd6c23018ba393e7ec723bd62f9c197b7e";

async function sha(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function currentUserEmail() {
  try {
    const a = msalApp && msalApp.getAllAccounts ? msalApp.getAllAccounts()[0] : null;
    return a ? (a.username || "").toLowerCase() : "";
  } catch { return ""; }
}
const emailIsAdmin = () => { const e = currentUserEmail(); return !!e && ADMIN_EMAILS.includes(e); };

// Destrava em MEMORIA (zera a cada abertura do app) + auto-trava por inatividade.
let admUnlocked = false;
let admTimer = null;
const ADM_TIMEOUT_MS = 60000; // 1 minuto
const isAdmin = () => emailIsAdmin() && admUnlocked;
function admDoLock() { admUnlocked = false; if (admTimer) { clearTimeout(admTimer); admTimer = null; } }
function admArmTimer() {
  if (admTimer) clearTimeout(admTimer);
  admTimer = setTimeout(() => { admUnlocked = false; admTimer = null; applyAdm(); showView("home"); }, ADM_TIMEOUT_MS);
}

function applyAdm() {
  updateGreeting();
  const vis = isAdmin();
  document.querySelectorAll('[data-go="cerebro"]').forEach((e) => { e.style.display = vis ? "" : "none"; });
  el("admPanel").classList.toggle("hidden", !vis);
  el("admLock").classList.toggle("hidden", vis);
  const email = currentUserEmail();
  if (vis) {
    el("admWho").textContent = "Administrador validado: " + email + " — trava automatica em 1 min.";
    return;
  }
  const eAdmin = emailIsAdmin();
  el("admLockHint").textContent = !email
    ? "Passo 1: valide sua conta Microsoft (admin)."
    : !eAdmin
      ? `A conta ${email} nao e administradora. Entre com a conta do admin.`
      : "Conta validada. Passo 2: digite o PIN (acesso por 1 min).";
  el("admPinInputWrap").style.display = eAdmin ? "" : "none";
  el("admPinBtn").style.display = eAdmin ? "" : "none";
  el("admConnectBtn").style.display = eAdmin ? "none" : "";
  if (el("cerebro").classList.contains("active")) showView("home");
}

function initAdm() {
  el("keyToggle").onclick = () => {
    const i = el("apiKey");
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    el("keyToggle").style.opacity = show ? "1" : ".55";
  };
  el("admPinBtn").onclick = async () => {
    if (!emailIsAdmin()) { el("admMsg").textContent = "Valide a conta Microsoft admin primeiro."; return; }
    if (await sha(el("admPinInput").value.trim()) === ADM_PIN_SHA) {
      admUnlocked = true; admArmTimer();
      el("admPinInput").value = ""; el("admMsg").textContent = "";
      applyAdm();
      if (window._cofreToken) openCofreRoot();
    } else {
      el("admMsg").textContent = "PIN incorreto.";
    }
  };
  el("admConnectBtn").onclick = () => cofreLogin();
  el("admLockBtn").onclick = () => { admDoLock(); applyAdm(); showView("home"); };
  el("saveAdm").onclick = saveCfg;
  applyAdm();
}

window.addEventListener("DOMContentLoaded", () => {
  hydrateCfgForm();
  renderProjetos();
  initAdm();
  initToggles();
  renderSuggest();
  renderNucleo();
  initSpeech();
  initNav();
  el("sendBtn").onclick = sendMessage;
  el("micBtn").onclick = toggleMic;
  el("stopVoz").onclick = stopSpeak;
  el("voiceTest").onclick = () => speakWith("Ola, Daniel! Sou o Copiloto Damha Agro.", parseFloat(el("voicePitch").value), parseFloat(el("voiceRate").value), el("voiceSel").value);
  el("openSoundChk").checked = localStorage.getItem("openSound") !== "0";
  el("openSoundChk").onchange = () => localStorage.setItem("openSound", el("openSoundChk").checked ? "1" : "0");
  el("clearChat").onclick = clearChat;
  el("cmClose").onclick = closeChartModal;
  document.querySelectorAll("#chartModal [data-ct]").forEach((b) => { b.onclick = () => { _modalType = b.dataset.ct; drawModal(); }; });
  el("chartModal").addEventListener("click", (e) => { if (e.target === el("chartModal")) closeChartModal(); });
  // Voz aplica na hora (corrige "nao troca") + toca amostra
  el("voiceSel").onchange = () => { applyVoiceLive(); speakWith("Pronto, voz trocada. Eu sou a Maria Sarah.", cfg.pitch, cfg.rate, cfg.voiceName); };
  el("voicePitch").oninput = applyVoiceLive;
  el("voiceRate").oninput = applyVoiceLive;
  document.querySelectorAll("[data-pp]").forEach((b) => {
    b.onclick = () => {
      const [p, r] = b.dataset.pp.split(",").map(Number);
      el("voicePitch").value = p; el("voiceRate").value = r;
      applyVoiceLive();
      speakWith((b.dataset.say || "Oi! Eu sou a Maria Sarah, sua copiloto da Damha Agro."), p, r, el("voiceSel").value);
    };
  });
  armOpenSound();
  el("saveCfg").onclick = saveCfg;
  el("provider").onchange = () => populateModels(el("provider").value);
  el("cofreLogin").onclick = cofreLogin;
  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  // erros visiveis (em vez de falhar em silencio)
  window.addEventListener("error", (ev) => { el("cofreStatus").textContent = "Erro: " + ev.message; });
  window.addEventListener("unhandledrejection", (ev) => { el("cofreStatus").textContent = "Falha: " + ((ev.reason && ev.reason.message) || ev.reason); });
  const av = el("appVer"); if (av) av.textContent = "v" + APP_VERSION;
  el("cofreStatus").textContent = "Build v" + APP_VERSION + " · app " + APP_CLIENT_ID.slice(0, 8);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  welcome();
  initAuthOnLoad();
});

let greetMsg = null;
function userFirstName() {
  try {
    const a = msalApp && msalApp.getAllAccounts ? msalApp.getAllAccounts()[0] : null;
    const n = a && (a.name || a.username) ? (a.name || a.username) : "";
    const first = n ? n.split(/[ @._-]+/)[0] : "";
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  } catch { return ""; }
}
function greetText() {
  const nome = userFirstName() || "Daniel";
  return cfg.apiKey
    ? `Ola, ${nome}! Sou a Maria Sarah, sua copiloto da Damha Agro. Fale ou escreva — e lembre que sou parceira de debate, nao validadora.`
    : `Ola, ${nome}! Sou a Maria Sarah, copiloto da Damha Agro. Para conversar, abra Config e cole a chave da API (Gemini tem plano gratis). Tudo fica so neste aparelho.`;
}
function updateGreeting() { if (greetMsg) greetMsg.textContent = greetText(); }
function welcome() { greetMsg = addMsg(greetText(), "bot"); }
function clearChat() {
  stopSpeak();
  history = []; pendingNoteContext = null;
  el("chat").innerHTML = "";
  welcome();
}
