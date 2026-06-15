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
  model: "gemini-2.5-flash",
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
const APP_VERSION = "1.63";
// Pasta raiz do cofre (CLAUDE.md secao 3)
const ROOT_FOLDER = "01KCR6ZALNPTVWS2LBS5HYFDHIWJ3QGS7E";
// Mascote Maria Sarah (_ASSETS do cofre). Carregado em runtime pela conta M365 e cacheado.
const MASCOT_ITEM = "01KCR6ZAPEHV3QJN3DTNEJNQ2V6DJE7XMY"; // "Masconte M. Sarah.png"
const MASCOT_KEY = "mascotDataUrl_v1";
// Planilhas legiveis na Base DAMHA (lidas com SheetJS)
const SHEET_RE = /\.(xlsx|xlsm|xlsb|xls|csv)$/i;

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
// Envia so as ultimas trocas (igual ao STUDIO) — pacote menor, menos 429 por tokens/min.
const recentHistory = () => history.slice(-10);

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
/* ---------- Tema claro/escuro ---------- */
function applyTheme() {
  const light = localStorage.getItem("theme") === "light";
  document.body.classList.toggle("light", light);
  document.querySelectorAll("#themeRow [data-theme]").forEach((b) => b.classList.toggle("on", b.dataset.theme === (light ? "light" : "dark")));
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute("content", light ? "#F4F1F8" : "#3D2058");
}
function initTheme() {
  document.querySelectorAll("#themeRow [data-theme]").forEach((b) => {
    b.onclick = () => { localStorage.setItem("theme", b.dataset.theme); applyTheme(); };
  });
  applyTheme();
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
  if (localStorage.getItem("tog_togInternet") === null) localStorage.setItem("tog_togInternet", "1"); // tempo real on por padrao
  if (localStorage.getItem("tog_togCerebro") === null) localStorage.setItem("tog_togCerebro", "1"); // Base DAMHA on por padrao
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
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — igual ao STUDIO (recomendado)" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite — leve, cota separada" },
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
// Mensagem de erro amigavel por status HTTP — agora mostra a CAUSA REAL do Google.
function apiError(provider, status, text) {
  let reason = "";
  try { const j = JSON.parse(text); reason = (j.error && (j.error.message || j.error.status)) || ""; }
  catch { reason = String(text || ""); }
  const r = reason.toLowerCase();
  if (provider === "Gemini") {
    // 400 INVALID_ARGUMENT com "API key not valid" = a chave NAO e uma chave Gemini valida.
    if (/api key not valid|api_key_invalid|invalid api key/.test(r))
      return "Chave do Gemini invalida. As chaves do Google AI Studio comecam com \"AIza\". Gere uma em aistudio.google.com/apikey e cole em Config (use o botao Testar chave).";
    if (/service_disabled|has not been used|api is disabled|enable it by visiting/.test(r))
      return "A Generative Language API nao esta ativada no projeto dessa chave. Ative no Google Cloud (ou gere a chave direto no Google AI Studio, que ja vem ativada).";
    if (/quota|rate limit|resource has been exhausted/.test(r) || status === 429)
      return "Cota/limite do Gemini atingido. Troque o modelo em Config (ex.: Gemini 2.0 Flash-Lite) ou aguarde ~1 min.";
    if (status === 404 || /not found|unsupported|not supported|is not available/.test(r))
      return "Modelo do Gemini indisponivel para essa chave. Toque em Testar chave (Config) para ver quais modelos sua chave aceita. " + (reason ? "(" + reason.slice(0, 100) + ")" : "");
  }
  if (status === 429) return `Limite/cota do ${provider} atingido. Troque o modelo em Config ou aguarde ~1 min.`;
  if (status === 401 || status === 403) return `Chave do ${provider} invalida ou sem permissao. ${reason ? "(" + reason.slice(0, 120) + ")" : "Revise a chave em Config."}`;
  if (status === 400) return `${provider}: ${reason ? reason.slice(0, 160) : "requisicao invalida"} (400). Revise a chave/modelo em Config.`;
  return `Erro ${provider} (${status}): ${reason.slice(0, 160)}`;
}
// Diagnostico definitivo: pergunta ao Google quais modelos a chave aceita (ListModels).
// Resolve de vez o "modelo indisponivel" — diz se a chave e valida (Gemini, Claude OU GPT)
// e, no Gemini, seleciona um modelo que funciona. SEMPRE devolve um veredito visivel.
async function testKey() {
  const out = el("keyTestMsg") || el("cfgStatus");
  const key = el("apiKey").value.trim();
  const prov = el("provider").value;
  if (!key) { out.textContent = "Cole a chave primeiro."; return; }
  out.textContent = "Testando a chave...";
  try {
    if (prov === "gemini") {
      if (!/^AIza/.test(key)) out.textContent = "Aviso: chave do Gemini normalmente comeca com \"AIza\". Testando assim mesmo...";
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key));
      const text = await res.text();
      if (!res.ok) { out.textContent = "Chave Gemini REPROVADA: " + apiError("Gemini", res.status, text); return; }
      const data = JSON.parse(text);
      const usable = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => (m.name || "").replace(/^models\//, ""))
        .filter((n) => /gemini/.test(n));
      if (!usable.length) { out.textContent = "Chave Gemini valida, mas sem modelo de chat disponivel nela."; return; }
      const pref = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-pro"];
      const pick = pref.find((p) => usable.includes(p)) || usable.find((n) => /flash/.test(n)) || usable[0];
      if (pick && [...el("model").options].some((o) => o.value === pick)) el("model").value = pick;
      saveCfg();
      out.textContent = "✅ Chave Gemini VALIDA! Modelo selecionado: " + pick + ". Aceita: " + usable.slice(0, 8).join(", ") + (usable.length > 8 ? "..." : "");
      return;
    }
    if (prov === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      });
      const text = await res.text();
      if (!res.ok) { out.textContent = "Chave Claude REPROVADA: " + apiError("Claude", res.status, text); return; }
      saveCfg();
      out.textContent = "✅ Chave Claude (Anthropic) VALIDA! Pode usar o Copiloto.";
      return;
    }
    if (prov === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", { headers: { "authorization": "Bearer " + key } });
      const text = await res.text();
      if (!res.ok) { out.textContent = "Chave OpenAI REPROVADA: " + apiError("OpenAI", res.status, text); return; }
      saveCfg();
      out.textContent = "✅ Chave OpenAI (GPT) VALIDA! Pode usar o Copiloto.";
      return;
    }
    out.textContent = "Provedor desconhecido. Selecione Gemini, Claude ou OpenAI.";
  } catch (e) {
    out.textContent = "Nao deu pra testar (rede ou bloqueio CORS): " + (e.message || e) + ". Verifique a conexao e tente de novo.";
  }
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
// Renderiza um relatorio: texto + VARIOS blocos (kpis/chart/options) na ordem em que aparecem.
function renderBotInto(d, text) {
  const re = /```(kpis|chart|options)\s*([\s\S]*?)```/gi;
  let last = 0, m, any = false;
  while ((m = re.exec(text))) {
    const before = text.slice(last, m.index).trim();
    if (before) { const p = document.createElement("div"); p.innerHTML = mdToHtml(before); d.appendChild(p); }
    let data = null; try { data = JSON.parse(m[2].trim()); } catch { data = null; }
    if (data) {
      const tag = m[1].toLowerCase();
      if (tag === "kpis") d.appendChild(renderKPIs(data));
      else if (tag === "chart") d.appendChild(renderChart(data));
      else d.appendChild(renderOptions(data));
      any = true;
    }
    last = re.lastIndex;
  }
  const after = text.slice(last).trim();
  if (after) { const p = document.createElement("div"); p.innerHTML = mdToHtml(after); d.appendChild(p); }
  if (!d.childNodes.length || (!any && !after)) d.innerHTML = mdToHtml(text);
}
function addBotMsg(text) {
  const d = document.createElement("div");
  d.className = "msg bot";
  renderBotInto(d, text);
  el("chat").appendChild(d);
  el("chat").scrollTop = el("chat").scrollHeight;
  return d;
}
// Cartoes de indicadores-chave (KPIs), estilo STUDIO.
function renderKPIs(spec) {
  const box = document.createElement("div");
  box.className = "kpis";
  (spec.cards || []).forEach((c) => {
    const k = document.createElement("div");
    k.className = "kpi";
    k.innerHTML = `<span class="kpi-l">${escapeHtml(c.label || "")}</span>`
      + `<b class="kpi-v">${escapeHtml(String(c.value != null ? c.value : ""))}</b>`
      + (c.sub ? `<span class="kpi-s">${escapeHtml(c.sub)}</span>` : "");
    box.appendChild(k);
  });
  return box;
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
  return t.replace(/```(kpis|chart|options)\s*[\s\S]*?```/gi, "").replace(/[*#`>_]/g, "").trim();
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
// Normaliza o tipo de grafico vindo do contrato (aceita PT e EN).
function normType(t) {
  t = String(t || "").toLowerCase();
  if (t === "bar" || t === "barra" || t === "barras") return "bar";
  if (t === "area") return "area";
  if (["candle", "candlestick", "vela", "velas"].includes(t)) return "candle";
  return "line";
}
function normCandle(d) {
  if (Array.isArray(d)) return { o: +d[0], h: +d[1], l: +d[2], c: +d[3] };
  d = d || {};
  return {
    o: +(d.o ?? d.open ?? d.abertura),
    h: +(d.h ?? d.high ?? d.max ?? d.maxima ?? d["máxima"]),
    l: +(d.l ?? d.low ?? d.min ?? d.minima ?? d["mínima"]),
    c: +(d.c ?? d.close ?? d.fech ?? d.fechamento),
  };
}
// Detecta se um item ja e OHLC (array [o,h,l,c] ou objeto com o/open/abertura).
function isOHLC(d) {
  return Array.isArray(d) ? d.length >= 4 : (d && typeof d === "object" && ("o" in d || "open" in d || "abertura" in d || "h" in d || "high" in d));
}
// Velas REAIS: vem em spec.candles [{o,h,l,c}] ou na 1a serie quando ela ja e OHLC.
function getCandles(spec) {
  let raw = Array.isArray(spec.candles) && spec.candles.length ? spec.candles
    : ((spec.series || [])[0] && Array.isArray(spec.series[0].data) && spec.series[0].data.some(isOHLC) ? spec.series[0].data : []);
  return raw.map(normCandle).filter((k) => [k.o, k.h, k.l, k.c].every(Number.isFinite));
}
function hasOHLC(spec) { return getCandles(spec).length > 0; }
// Padrao do dashboard (v5.0): "candle em todo grafico". Se houver OHLC real, usa.
// Senao, deriva VELA DE VARIACAO HONESTA de qualquer serie de linha:
// abre = valor anterior, fecha = valor atual, max/min = os dois valores reais (sem pavio inventado).
function deriveCandles(spec) {
  const real = getCandles(spec);
  if (real.length) return { candles: real, derived: false };
  const s = (spec.series || []).find((x) => Array.isArray(x.data) && x.data.length);
  if (!s) return { candles: [], derived: false };
  const d = s.data.map(Number).filter(Number.isFinite);
  const out = [];
  for (let i = 1; i < d.length; i++) { const o = d[i - 1], c = d[i]; out.push({ o, h: Math.max(o, c), l: Math.min(o, c), c }); }
  return { candles: out, derived: true };
}
function canCandle(spec) { return deriveCandles(spec).candles.length > 0; }
// Candlestick (velas) verde/vermelho — igual ao painel do MERCADO FUTURO.
function candleSVG(spec, labels) {
  const W = 520, H = 240, P = 44;
  const dc = deriveCandles(spec);
  const cd = dc.candles;
  if (!cd.length) return "<div class='muted'>(sem dados para velas)</div>";
  const lab = dc.derived ? (labels || []).slice(1) : (labels || []); // velas derivadas tem 1 a menos
  let mn = Math.min(...cd.map((k) => k.l)), mx = Math.max(...cd.map((k) => k.h));
  if (mn === mx) { mn -= 1; mx += 1; }
  const rg = (mx - mn) || 1;
  const Y = (v) => H - P - ((v - mn) / rg) * (H - 2 * P);
  const step = (W - 2 * P) / cd.length;
  const UP = "#4A7B3E", DN = "#D63838"; // verde = alta, vermelho = baixa (paleta DAMHA)
  let g = "";
  [mx, (mn + mx) / 2, mn].forEach((v) => {
    const yy = Y(v);
    g += `<line x1="${P}" y1="${yy}" x2="${W - P}" y2="${yy}" stroke="#5E3287" stroke-width="1" opacity="0.4"/>`;
    g += `<text x="4" y="${yy + 3}" fill="#B9AECB" font-size="10">${fmtNum(v)}</text>`;
  });
  cd.forEach((k, i) => {
    const cx = P + (i + 0.5) * step;
    const col = k.c >= k.o ? UP : DN;
    const top = Math.min(Y(k.o), Y(k.c));
    const bh = Math.max(2, Math.abs(Y(k.c) - Y(k.o)));
    const bw = Math.max(3, step * 0.55);
    g += `<line x1="${cx}" y1="${Y(k.h)}" x2="${cx}" y2="${Y(k.l)}" stroke="${col}" stroke-width="1.5"/>`;
    g += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="1"/>`;
  });
  const last = cd[cd.length - 1].c, yl = Y(last); // linha tracejada laranja do ultimo preco (igual ao dashboard)
  g += `<line x1="${P}" y1="${yl}" x2="${W - P}" y2="${yl}" stroke="#F08E23" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>`;
  const n = cd.length - 1;
  [0, Math.round(n / 2), n].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => {
    if (lab[i] != null) g += `<text x="${P + (i + 0.5) * step}" y="${H - 12}" fill="#B9AECB" font-size="10" text-anchor="middle">${escapeHtml(String(lab[i]))}</text>`;
  });
  const leg = `<span style="color:${UP}">&#9632; alta</span> &nbsp; <span style="color:${DN}">&#9632; baixa</span>${dc.derived ? ' &nbsp; <span style="color:#B9AECB">vela de variacao</span>' : ""}`;
  return `<div class="pc-leg">${leg}</div><svg viewBox="0 0 ${W} ${H}" class="pc-svg" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
function chartSVG(spec, type) {
  const W = 520, H = 240, P = 44;
  const labels = spec.labels || [];
  if (type === "candle") return candleSVG(spec, labels);
  const series = (spec.series || []).filter((s) => Array.isArray(s.data) && s.data.length);
  if (!series.length) return "<div class='muted'>(sem dados no painel)</div>";
  const hasRight = series.some((s) => s.axis === "right");
  const scale = (arr) => { let mn = Math.min(...arr), mx = Math.max(...arr); if (mn === mx) { mn -= 1; mx += 1; } return { mn, mx, rg: (mx - mn) || 1 }; };
  const leftData = series.filter((s) => s.axis !== "right").flatMap((s) => s.data);
  const rightData = series.filter((s) => s.axis === "right").flatMap((s) => s.data);
  const L = scale(leftData.length ? leftData : series.flatMap((s) => s.data));
  const R = rightData.length ? scale(rightData) : L;
  const n = Math.max(1, (labels.length || series[0].data.length) - 1);
  const X = (i) => P + i * ((W - 2 * P) / n);
  const Yl = (v) => H - P - ((v - L.mn) / L.rg) * (H - 2 * P);
  const Yr = (v) => H - P - ((v - R.mn) / R.rg) * (H - 2 * P);
  const Yof = (s) => (s.axis === "right" ? Yr : Yl);
  const colors = ["#6FCF6F", "#F08E23", "#C4357A", "#B8D4E8", "#DCD4E5"];
  let g = "";
  [L.mx, (L.mn + L.mx) / 2, L.mn].forEach((v) => {
    const yy = Yl(v);
    g += `<line x1="${P}" y1="${yy}" x2="${W - P}" y2="${yy}" stroke="#5E3287" stroke-width="1" opacity="0.4"/>`;
    g += `<text x="4" y="${yy + 3}" fill="#B9AECB" font-size="10">${fmtNum(v)}</text>`;
  });
  if (hasRight) [R.mx, (R.mn + R.mx) / 2, R.mn].forEach((v) => {
    g += `<text x="${W - 4}" y="${Yr(v) + 3}" fill="#B8D4E8" font-size="10" text-anchor="end">${fmtNum(v)}</text>`;
  });
  if (type === "bar") {
    const s = series[0], Y = Yof(s), step = (W - 2 * P) / s.data.length;
    s.data.forEach((v, i) => {
      const cx = P + (i + 0.5) * step, yy = Y(v);
      g += `<rect x="${cx - step * 0.3}" y="${yy}" width="${step * 0.6}" height="${H - P - yy}" fill="${colors[0]}" rx="2"/>`;
    });
  } else {
    series.forEach((s, si) => {
      const Y = Yof(s);
      const pts = s.data.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
      if (type === "area") g += `<polygon points="${P},${H - P} ${pts} ${X(s.data.length - 1)},${H - P}" fill="${colors[si % colors.length]}" opacity="0.16"/>`;
      g += `<polyline points="${pts}" fill="none" stroke="${colors[si % colors.length]}" stroke-width="2"${s.axis === "right" ? ' stroke-dasharray="5 3"' : ""}/>`;
    });
  }
  [0, Math.round(n / 2), n].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => {
    if (labels[i] != null) g += `<text x="${X(i)}" y="${H - 12}" fill="#B9AECB" font-size="10" text-anchor="middle">${escapeHtml(String(labels[i]))}</text>`;
  });
  const leg = series.map((s, si) => `<span style="color:${colors[si % colors.length]}">&#9632; ${escapeHtml(s.name || ("serie " + (si + 1)))}${s.axis === "right" ? " (2o eixo)" : ""}</span>`).join(" &nbsp; ");
  return `<div class="pc-leg">${leg}</div><svg viewBox="0 0 ${W} ${H}" class="pc-svg" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
// Tipo final: respeita o pedido; se vier OHLC real sem tipo, ja abre em velas.
function effectiveType(spec) {
  const want = normType(spec.type);
  if (want === "candle") return "candle";
  if (want === "line" && hasOHLC(spec)) return "candle";
  return want;
}
function renderChart(spec) {
  const box = document.createElement("div");
  box.className = "panelchart";
  box.innerHTML = `<div class="pc-title">&#128202; ${escapeHtml(spec.title || "Painel")}</div>`
    + chartSVG(spec, effectiveType(spec))
    + `<div class="pc-cap">&#9889; painel${spec.source ? " &middot; " + escapeHtml(spec.source) : ""} &middot; toque para ampliar</div>`;
  box.onclick = () => openChartModal(spec);
  return box;
}
// Modal de grafico em tela cheia (clica e "sai da tela")
let _modalSpec = null, _modalType = "line";
function openChartModal(spec) {
  _modalSpec = spec;
  _modalType = effectiveType(spec);
  el("cmTitle").textContent = spec.title || "Painel";
  const cb = el("cmCandle"); if (cb) cb.style.display = canCandle(spec) ? "" : "none"; // Velas vale p/ qualquer serie
  drawModal();
  el("chartModal").classList.remove("hidden");
}
function drawModal() {
  el("cmBody").innerHTML = chartSVG(_modalSpec, _modalType);
  document.querySelectorAll("#chartModal [data-ct]").forEach((b) => b.classList.toggle("on", b.dataset.ct === _modalType));
}
function closeChartModal() { el("chartModal").classList.add("hidden"); }
// Rasteriza o SVG do modal em canvas (fundo escuro) e chama cb(canvas).
function chartToCanvas(scale, cb) {
  const svg = el("cmBody").querySelector("svg");
  if (!svg) { cb(null); return; }
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", "520"); clone.setAttribute("height", "240");
  const xml = new XMLSerializer().serializeToString(clone);
  const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = 520 * scale; c.height = 240 * scale;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1c0d2c"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    cb(c);
  };
  img.onerror = () => cb(null);
  img.src = src;
}
function downloadPng() {
  chartToCanvas(2, (c) => {
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = ((_modalSpec && _modalSpec.title) || "grafico").replace(/[^\w\-]+/g, "_") + ".png";
    a.click();
  });
}
function copyPng() {
  chartToCanvas(2, (c) => {
    if (!c) return;
    if (!navigator.clipboard || !window.ClipboardItem) { downloadPng(); return; }
    c.toBlob(async (b) => {
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); el("cmTitle").textContent = "Copiado! " + (_modalSpec && _modalSpec.title || ""); }
      catch (e) { downloadPng(); }
    }, "image/png");
  });
}
// PDF do grafico: leva o SVG do modal para uma aba imprimivel (com marca DAMHA).
function chartPdf() {
  const svg = el("cmBody").querySelector("svg");
  if (!svg) return;
  const title = (_modalSpec && _modalSpec.title) || "Grafico DAMHA";
  const src = (_modalSpec && _modalSpec.source) ? `<div style="color:#B9AECB;font-size:11px;margin-top:6px">Fonte: ${escapeHtml(_modalSpec.source)}</div>` : "";
  openPrint(title, `<h1>${escapeHtml(title)}</h1><section class="blk">${svg.outerHTML}${src}</section>`);
}
// Compartilhar o grafico como imagem (PNG) pelo menu nativo (WhatsApp, etc.).
function chartShare() {
  chartToCanvas(2, (c) => {
    if (!c) return;
    const title = (_modalSpec && _modalSpec.title) || "Grafico DAMHA";
    c.toBlob(async (b) => {
      if (!b) { downloadPng(); return; }
      const file = new File([b], title.replace(/[^\w\-]+/g, "_") + ".png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title, text: title + " — DAMHA Agro" }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      downloadPng(); // fallback: baixa o PNG
    }, "image/png");
  });
}
// Chips de sugestao
const SUGGEST = [
  "Relatorio completo de cambio", "Me surpreenda", "Por que o dolar mexeu hoje?",
  "Compare USD, soja, milho e boi", "Grafico de velas do dolar",
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
/* ---------- Relatorio vivo (iteracao viva, contrato estilo STUDIO) ---------- */
let REL = { titulo: "", blocos: [] };
const REPORT_SYS = `\n\nMODO RELATORIO (responda SO em JSON, sem texto fora do JSON), contrato:
{"reply":"sua leitura de analista, 1 a 4 frases","relatorio":{"titulo":"...","blocos":[...]} | null,"add_blocos":[...] | null,"remover_titulos":["titulo",...] | null}
- "monte/relatorio de X" => relatorio completo (titulo + blocos).
- "adicione/poe um grafico/bloco de Y" => add_blocos (bloco com MESMO titulo SUBSTITUI o existente).
- "tira/remove o bloco Z" => remover_titulos.
- pergunta/conversa => responda no reply (e, se ilustrar, mande add_blocos).
Tipos de bloco:
(1) {"tipo":"kpis","titulo":"...","larg":"cheia","itens":[{"label":"...","value":"...","sub":"..."}]}
(2) {"tipo":"grafico","titulo":"...","larg":"meia","estilo":"linha"|"barras"|"area","labels":[...],"series":[{"name":"...","data":[numeros],"axis":"right"(opcional)}]}
(2b) GRAFICO DE VELAS (candlestick): {"tipo":"grafico","titulo":"...","larg":"cheia","estilo":"velas","labels":["dia/periodo",...],"candles":[{"o":abertura,"h":maxima,"l":minima,"c":fechamento},...]}. Vela verde quando fechamento>=abertura, vermelha quando cai. Use para preco de dolar/soja/milho/boi e mercado futuro.
(3) {"tipo":"texto","titulo":"...","larg":"meia","conteudo":"analise qualitativa"}
Sem dados reais, use valores ilustrativos e diga isso no reply. Max 12 pontos/velas por serie.`;
function reportApply(r) {
  if (r.relatorio && (r.relatorio.blocos || r.relatorio.titulo)) REL = { titulo: r.relatorio.titulo || REL.titulo || "Relatorio", blocos: r.relatorio.blocos || [] };
  if (r.remover_titulos && r.remover_titulos.length) {
    const rem = r.remover_titulos.map((x) => (x || "").toLowerCase());
    REL.blocos = (REL.blocos || []).filter((b) => rem.indexOf((b.titulo || "").toLowerCase()) < 0);
  }
  if (r.add_blocos && r.add_blocos.length) {
    REL.blocos = REL.blocos || [];
    r.add_blocos.forEach((nb) => {
      const i = REL.blocos.findIndex((b) => (b.titulo || "").toLowerCase() === (nb.titulo || "").toLowerCase());
      if (i >= 0) REL.blocos[i] = nb; else REL.blocos.push(nb);
    });
  }
}
function renderRel() {
  const c = el("reportCanvas"); if (!c) return;
  if (!(REL.blocos && REL.blocos.length) && !REL.titulo) { c.innerHTML = "<p class='muted'>Direcione acima para a Maria Sarah montar o relatorio.</p>"; return; }
  c.innerHTML = "";
  const head = document.createElement("div");
  head.innerHTML = `<div class="rel-titulo">${escapeHtml(REL.titulo || "Relatorio")}</div><div class="rel-sub">gerado pela Maria Sarah &middot; ${new Date().toLocaleString("pt-BR")}</div>`;
  c.appendChild(head);
  const grid = document.createElement("div"); grid.className = "relgrid";
  (REL.blocos || []).forEach((b) => {
    const card = document.createElement("div");
    card.className = "relblk" + (b.larg === "cheia" || b.tipo === "kpis" ? " full" : "");
    const h = document.createElement("div"); h.className = "relblk-h"; h.textContent = b.titulo || b.tipo; card.appendChild(h);
    if (b.tipo === "kpis") card.appendChild(renderKPIs({ cards: b.itens || [] }));
    else if (b.tipo === "grafico") {
      card.appendChild(renderChart({ title: b.titulo, type: normType(b.estilo), labels: b.labels, series: b.series, candles: b.candles, source: b.source }));
    } else { const p = document.createElement("div"); p.className = "relblk-txt"; p.innerHTML = mdToHtml(b.conteudo || ""); card.appendChild(p); }
    grid.appendChild(card);
  });
  c.appendChild(grid);
}
async function geminiOnce(sys, userMsg, web) {
  const chosen = (cfg.model || "").startsWith("gemini") ? cfg.model : "gemini-2.5-flash";
  const alt = chosen === "gemini-2.5-flash" ? "gemini-2.0-flash-lite" : "gemini-2.5-flash";
  const body = { contents: [{ role: "user", parts: [{ text: userMsg }] }], systemInstruction: { parts: [{ text: sys }] }, generationConfig: { maxOutputTokens: 2048 } };
  if (web) body.tools = [{ google_search: {} }]; else body.generationConfig.responseMimeType = "application/json";
  const run = async (model) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey }, body: JSON.stringify(body) });
  let res = await run(chosen);
  if (res.status === 429) res = await run(alt);
  if (!res.ok) throw new Error(apiError("Gemini", res.status, await res.text()));
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("");
}
function parseLooseJSON(raw) {
  let s = String(raw).replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { reply: raw };
}
async function reportAsk(q) {
  if (!cfg.apiKey) { el("repStatus").textContent = "Configure a chave da API em Config."; return; }
  el("repStatus").textContent = "Montando...";
  try {
    const titles = (REL.blocos || []).map((b) => b.titulo).join(" | ") || "(vazio)";
    let userMsg = `RELATORIO ATUAL (titulos dos blocos): ${titles}\n\nComando do Daniel: ${q}`;
    if (togState("togCerebro") && window._cofreToken && !pickCtxNote()) el("repStatus").textContent = "Consultando a Base DAMHA...";
    const ctxNote = await getBaseContext(q); // STUDIO tambem puxa a Base DAMHA (igual ao Copiloto)
    if (ctxNote) { userMsg = `Contexto (Base DAMHA "${ctxNote.title}"):\n\n${ctxNote.body}\n\n---\n` + userMsg; pendingNoteContext = null; }
    const web = togState("togInternet");
    let sys = SYSTEM_PROMPT + REPORT_SYS + webNote(web);
    if (togState("togCerebro")) {
      if (window._cofreToken) sys += "\n\nBASE DAMHA LIGADA: o app anexa automaticamente o arquivo do cofre mais relacionado. Use o contexto anexado como fonte mestra; se vier vazio, diga que nao achou e peca o assunto exato.";
      else sys += "\n\nBASE DAMHA LIGADA, mas o M365 NAO esta conectado. Peca ao Daniel para conectar o M365 na aba Base.";
    }
    const raw = await aiOnce(sys, userMsg, web);
    const r = parseLooseJSON(raw);
    reportApply(r);
    renderRel();
    el("repStatus").textContent = r.reply || "";
    if (togState("togVoz") && r.reply) speak(r.reply);
  } catch (e) { el("repStatus").textContent = "Erro: " + e.message; }
}
const REP_SUGGEST = ["Relatorio completo de cambio", "Grafico de velas do dolar", "Candlestick do boi gordo", "Compare soja, milho e boi", "Tira o ultimo bloco"];
function initReport() {
  const box = el("repSuggest");
  if (box) { box.innerHTML = ""; REP_SUGGEST.forEach((s) => { const b = document.createElement("button"); b.className = "chip-s"; b.textContent = s; b.onclick = () => reportAsk(s); box.appendChild(b); }); }
  el("repSend").onclick = () => { const v = el("repInput").value.trim(); if (!v) return; el("repInput").value = ""; reportAsk(v); };
  el("repInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el("repSend").onclick(); } });
  renderRel();
}

/* ===== Exportar / Compartilhar (WhatsApp, Share nativo, PDF) — Copiloto e STUDIO ===== */
// Marca de identificacao DAMHA (§A9) — vai no rodape de todo arquivo gerado.
function identText() {
  const d = new Date().toLocaleDateString("pt-BR");
  return `Responsavel: Daniel Alves Feitoza Junior · Area: Financeiro-Holding/Family Office · Status: Revisado · Classificacao: Uso Interno e Confidencial · Versao: ${APP_VERSION} · Data de Emissao: ${d}`;
}
function waSend(text) { window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank"); }
async function shareSmart(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  waSend(text); // fallback: WhatsApp direto
}
// Abre uma aba imprimivel (o navegador salva como PDF / compartilha). Estilo dark DAMHA.
function openPrint(title, bodyHTML) {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita abrir abas/pop-ups para gerar o PDF."); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>*{box-sizing:border-box}body{font-family:Calibri,'Segoe UI',Arial,sans-serif;background:#fff;color:#2A1840;padding:22px;margin:0}
  h1{font-size:22px;margin:0 0 12px;background:linear-gradient(90deg,#F08C1E,#C4357A,#7B2D8B);-webkit-background-clip:text;background-clip:text;color:transparent}
  .blk{background:#2D1545;color:#DCD4E5;border-radius:12px;padding:12px 14px;margin:10px 0}
  .blk h2{font-size:14px;margin:0 0 8px;color:#F08E23}
  .kpis{display:flex;gap:8px;flex-wrap:wrap}.kpi{background:#3D2058;border-radius:10px;padding:8px 10px;min-width:120px;flex:1}
  .kpi .kl{font-size:11px;color:#B9AECB}.kpi .kv{font-size:18px;font-weight:700}.kpi .ks{font-size:10px;color:#9b8fb5}
  .txt{font-size:13px;line-height:1.5}svg{max-width:100%;height:auto}.pc-leg{font-size:11px;color:#B9AECB;margin-bottom:4px}
  .bubble{border-radius:12px;padding:8px 12px;margin:8px 0;max-width:92%}.bubble.user{background:#5E3287;color:#fff;margin-left:auto}.bubble.bot{background:#2D1545;color:#DCD4E5}
  .ident{margin-top:20px;border-top:2px solid #7B2D8B;padding-top:8px;font-size:10.5px;color:#6B5B86;line-height:1.5}
  @page{margin:12mm}</style></head><body>${bodyHTML}<div class="ident">${escapeHtml(identText())}</div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.focus();window.print();},350)}</scr`+`ipt></body></html>`);
  w.document.close();
}
// ---- STUDIO (relatorio REL) ----
function relIsEmpty() { return !REL || !(REL.blocos || []).length; }
function relToText() {
  let t = "*" + (REL.titulo || "Relatorio DAMHA") + "*\n";
  (REL.blocos || []).forEach((b) => {
    t += "\n*" + (b.titulo || b.tipo) + "*\n";
    if (b.tipo === "kpis") (b.itens || []).forEach((it) => { t += `• ${it.label || ""}: ${it.value || ""}${it.sub ? " (" + it.sub + ")" : ""}\n`; });
    else if (b.tipo === "grafico") t += `[grafico: ${b.titulo || ""}${b.source ? " · " + b.source : ""}]\n`;
    else t += (b.conteudo || "").replace(/[#*`>]/g, "") + "\n";
  });
  return (t + "\n— " + identText()).trim();
}
function relPrintHTML() {
  let h = `<h1>${escapeHtml(REL.titulo || "Relatorio DAMHA")}</h1>`;
  (REL.blocos || []).forEach((b) => {
    h += `<section class="blk"><h2>${escapeHtml(b.titulo || b.tipo)}</h2>`;
    if (b.tipo === "kpis") h += `<div class="kpis">` + (b.itens || []).map((it) => `<div class="kpi"><div class="kl">${escapeHtml(it.label || "")}</div><div class="kv">${escapeHtml(it.value || "")}</div><div class="ks">${escapeHtml(it.sub || "")}</div></div>`).join("") + `</div>`;
    else if (b.tipo === "grafico") h += chartSVG({ title: b.titulo, labels: b.labels, series: b.series, candles: b.candles }, effectiveType({ type: b.estilo, series: b.series, candles: b.candles }));
    else h += `<div class="txt">${mdToHtml(b.conteudo || "")}</div>`;
    h += `</section>`;
  });
  return h;
}
function relWhats() { if (relIsEmpty()) { el("repStatus").textContent = "Gere um relatorio primeiro."; return; } waSend(relToText()); }
function relShare() { if (relIsEmpty()) { el("repStatus").textContent = "Gere um relatorio primeiro."; return; } shareSmart(REL.titulo || "Relatorio DAMHA", relToText()); }
function relPdf() { if (relIsEmpty()) { el("repStatus").textContent = "Gere um relatorio primeiro."; return; } openPrint(REL.titulo || "Relatorio DAMHA", relPrintHTML()); }
// ---- Copiloto (conversa) ----
function chatHasContent() { return history.some((m) => m.role === "assistant"); }
function chatToText() {
  const lines = history.filter((m) => m.role !== "system").map((m) => (m.role === "user" ? "Voce: " : "Maria Sarah: ") + String(m.content).replace(/```[\s\S]*?```/g, "[grafico]").trim());
  return ("*Conversa — Copiloto DAMHA*\n\n" + lines.join("\n\n") + "\n\n— " + identText()).trim();
}
function chatPrintHTML() {
  return `<h1>Conversa — Copiloto DAMHA</h1>` + history.filter((m) => m.role !== "system").map((m) => `<div class="bubble ${m.role === "user" ? "user" : "bot"}">${escapeHtml(String(m.content).replace(/```[\s\S]*?```/g, "[grafico]")).replace(/\n/g, "<br>")}</div>`).join("");
}
function chatWhats() { if (!chatHasContent()) { setStatus("Converse antes de compartilhar."); return; } waSend(chatToText()); }
function chatShare() { if (!chatHasContent()) { setStatus("Converse antes de compartilhar."); return; } shareSmart("Conversa Copiloto DAMHA", chatToText()); }
function chatPdf() { if (!chatHasContent()) { setStatus("Converse antes de gerar o PDF."); return; } openPrint("Conversa Copiloto DAMHA", chatPrintHTML()); }

// Contexto da Base DAMHA (cofre/memoria) — usado IGUAL no Copiloto e no STUDIO.
// Nota aprovada (Analisar) ou, com as chavinhas Base/Contexto, a ultima nota aberta
// (respeitando o egress: local nao envia; hibrido confirma; sempre envia direto).
function pickCtxNote() {
  let ctxNote = pendingNoteContext;
  if (!ctxNote && (togState("togCerebro") || togState("togContexto")) && lastOpenedNote) {
    if (cfg.egress === "local") ctxNote = null;
    else if (cfg.egress === "hibrido") { if (confirm(`Anexar "${lastOpenedNote.title}" (Base DAMHA, Uso Interno) a esta pergunta?`)) ctxNote = lastOpenedNote; }
    else ctxNote = lastOpenedNote;
  }
  return ctxNote;
}
async function sendMessage() {
  const text = el("input").value.trim();
  if (!text) return;
  if (!cfg.apiKey) { addMsg("Configure a chave da API em Config (Gemini ou Claude).", "err"); return; }

  el("input").value = "";
  addMsg(text, "user");

  if (togState("togCerebro") && window._cofreToken && !pickCtxNote()) setStatus("Consultando a Base DAMHA...");
  const ctxNote = await getBaseContext(text); // arquivo aberto OU busca autonoma no cofre
  let userContent = text;
  if (ctxNote) {
    userContent = `Contexto (Base DAMHA "${ctxNote.title}"):\n\n${ctxNote.body}\n\n---\nPergunta: ${text}`;
    pendingNoteContext = null;
  }
  history.push({ role: "user", content: userContent });

  // Sistema dinamico conforme as chavinhas.
  let sys = SYSTEM_PROMPT;
  if (togState("togCerebro")) {
    if (window._cofreToken) sys += "\n\nBASE DAMHA LIGADA: o app busca e ANEXA automaticamente o arquivo do cofre (Base DAMHA) mais relacionado a pergunta. Use o contexto anexado como fonte mestra. Se nenhum contexto vier anexado, diga que nao achou na Base e peca o nome/assunto exato — NUNCA diga que nao consegue acessar arquivos.";
    else sys += "\n\nBASE DAMHA LIGADA, mas o M365 NAO esta conectado neste aparelho. Peca ao Daniel para tocar em 'Conectar M365' na aba Base para voce consultar os arquivos do cofre.";
  }
  sys += "\n\nVoce e a Maria Sarah, copiloto da Damha Agro. Quando ajudar a explicar, PODE incluir UM grafico: um unico bloco de codigo cercado por tres crases iniciado pela palavra chart, contendo JSON {\"title\":\"...\",\"type\":\"line\" ou \"bar\" ou \"area\" ou \"velas\",\"labels\":[...],\"series\":[{\"name\":\"...\",\"data\":[numeros]}],\"source\":\"...\"}. Para PRECO de mercado (dolar, soja, milho, boi, mercado futuro) prefira \"type\":\"velas\" (candlestick): troque series por \"candles\":[{\"o\":abertura,\"h\":maxima,\"l\":minima,\"c\":fechamento},...] alinhado com labels — vela verde sobe, vermelha cai. Para comparar series de escalas diferentes (ex.: dolar ~5 vs soja ~130), marque uma serie com \"axis\":\"right\" (2o eixo, linha tracejada). No maximo 12 pontos/velas. Se nao tiver dados reais, marque \"source\":\"ilustrativo\". Para indicadores-chave, PODE incluir um bloco kpis com JSON {\"cards\":[{\"label\":\"...\",\"value\":\"...\",\"sub\":\"...\"}]} (ate 4 cartoes). Para um RELATORIO COMPLETO, pode incluir VARIOS blocos kpis e chart na mesma resposta, intercalados com texto curto (titulos e analise). Sem dados reais, marque source ilustrativo e avise.";
  sys += "\n\nRELATORIO VIVO: se o Daniel pedir para adicionar/remover/trocar/atualizar algo no relatorio, responda com o RELATORIO ATUALIZADO COMPLETO (reescreva TODOS os blocos kpis e chart de novo, com a mudanca aplicada), nao so o trecho alterado.";
  sys += "\n\nPERGUNTE PRIMEIRO, nao adivinhe: quando o pedido for ambiguo ou exigir uma escolha (ex.: de qual fonte de dados puxar, qual fazenda, qual periodo, se busca na Base DAMHA ou se o Daniel mostra o arquivo), escreva a pergunta curta e inclua UM bloco cercado por tres crases iniciado pela palavra options com JSON {\"options\":[\"opcao 1\",\"opcao 2\"]} (2 a 4 opcoes curtas). O Daniel toca numa opcao e voce segue. O restante da resposta vai em texto normal (markdown leve).";
  const wantWeb = togState("togInternet");
  sys += webNote(wantWeb);

  setStatus(wantWeb ? "Pensando (com internet)..." : "Pensando...");
  const canStream = (cfg.provider || "gemini") === "gemini";
  const bubble = canStream ? addMsg("", "bot") : null; // bolha de streaming so no Gemini
  try {
    const reply = await aiChat(sys, wantWeb, bubble ? (t) => { bubble.textContent = plainForSpeech(t); el("chat").scrollTop = el("chat").scrollHeight; } : null);
    if (bubble) bubble.remove();
    addBotMsg(reply);
    history.push({ role: "assistant", content: reply });
    setStatus("");
    if (togState("togVoz")) speak(plainForSpeech(reply));
  } catch (e) {
    if (bubble) bubble.remove();
    addMsg(e.message || ("Falha: " + e), "err");
    setStatus("");
  }
}
// Gemini em streaming (texto aparece aos poucos). Retorna {ok, text} ou {ok:false}.
async function streamGemini(sys, web, onText) {
  try {
    const model = (cfg.model || "").startsWith("gemini") ? cfg.model : "gemini-2.5-flash";
    const contents = recentHistory().map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const body = { contents, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { maxOutputTokens: 2048 } };
    if (web) body.tools = [{ google_search: {} }];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) return { ok: false, status: res.status };
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const js = t.slice(5).trim();
        if (!js || js === "[DONE]") continue;
        try {
          const j = JSON.parse(js);
          const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
          const txt = parts.map((p) => p.text || "").join("");
          if (txt) { full += txt; onText(full); }
        } catch { /* fragmento parcial; ignora */ }
      }
    }
    return full.trim() ? { ok: true, text: full.trim() } : { ok: false };
  } catch (e) { return { ok: false }; }
}

/* ===== Camada multi-provedor (padrao BYOK do dashboard: Copiloto E STUDIO usam a MESMA;
   Gemini, Claude e GPT falam com os dois ambientes, com busca web nos tres). ===== */
function curModel(prefix, def) { return (cfg.model || "").startsWith(prefix) ? cfg.model : def; }
function claudeHeaders() {
  return { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
}
// Instrucao injetada quando a Internet esta ligada — vale para qualquer provedor.
function webNote(web) {
  return web ? "\n\nBUSCA WEB ATIVA: voce TEM uma ferramenta de busca na internet ligada agora. Use-a para dados atuais (cotacoes, cambio, noticias) e cite a fonte com a data. NUNCA responda que nao tem acesso a informacao em tempo real — pesquise e responda." : "";
}
// CHAT (multi-turno). onStream(parcial) opcional (so o Gemini transmite). Retorna texto.
async function aiChat(sys, web, onStream) {
  const p = cfg.provider || "gemini";
  if (p === "claude") return await callClaude(sys, web);
  if (p === "openai") return await callOpenAI(sys, web);
  if (onStream) { const r = await streamGemini(sys, web, onStream); if (r.ok) return r.text; }
  return await callGemini(sys, web); // fallback robusto (outro modelo)
}
// STUDIO (turno unico, ideal em JSON). Retorna o texto cru (JSON) pro parseLooseJSON.
async function aiOnce(sys, userMsg, web) {
  const p = cfg.provider || "gemini";
  if (p === "claude") return await claudeOnce(sys, userMsg, web);
  if (p === "openai") return await openaiOnce(sys, userMsg, web);
  return await geminiOnce(sys, userMsg, web);
}

async function callClaude(sys = SYSTEM_PROMPT, web = false) {
  const model = curModel("claude", "claude-sonnet-4-6");
  const mk = (tools) => ({ model, max_tokens: 2048, system: sys, messages: recentHistory(), ...(tools ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] } : {}) });
  const post = (b) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: claudeHeaders(), body: JSON.stringify(b) });
  let res = await post(mk(web));
  if (!res.ok && web && (res.status === 400 || res.status === 404)) res = await post(mk(false)); // plano sem web search -> tenta sem
  if (!res.ok) throw new Error(apiError("Claude", res.status, await res.text()));
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim() || "(resposta vazia — tente reformular)";
}
async function claudeOnce(sys, userMsg, web) {
  const model = curModel("claude", "claude-sonnet-4-6");
  const mk = (tools) => ({ model, max_tokens: 2048, system: sys, messages: [{ role: "user", content: userMsg }], ...(tools ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] } : {}) });
  const post = (b) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: claudeHeaders(), body: JSON.stringify(b) });
  let res = await post(mk(web));
  if (!res.ok && web && (res.status === 400 || res.status === 404)) res = await post(mk(false));
  if (!res.ok) throw new Error(apiError("Claude", res.status, await res.text()));
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
}

async function callGemini(sys = SYSTEM_PROMPT, web = false) {
  // 1 chamada por mensagem; se o modelo escolhido der 429 (cota), tenta 1 modelo alternativo (outra cota).
  const chosen = curModel("gemini", "gemini-2.5-flash");
  const alt = chosen === "gemini-2.5-flash" ? "gemini-2.0-flash-lite" : "gemini-2.5-flash";
  const contents = recentHistory().map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body = { contents, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { maxOutputTokens: 2048 } };
  if (web) body.tools = [{ google_search: {} }];
  async function tryModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const opts = () => ({ method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey }, body: JSON.stringify(body) });
    let res = await fetch(url, opts());
    if (!res.ok && (res.status === 400 || res.status === 403) && body.tools) { delete body.tools; res = await fetch(url, opts()); }
    return res;
  }
  let res = await tryModel(chosen);
  if (res.status === 429) res = await tryModel(alt); // 1 alternativa silenciosa (outro modelo = outra cota)
  if (!res.ok) throw new Error(apiError("Gemini", res.status, await res.text()));
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim()
    || "(resposta vazia — tente reformular)";
}

async function callOpenAI(sys = SYSTEM_PROMPT, web = false) {
  const model = curModel("gpt", "gpt-4o-mini");
  if (web) { try { return await openaiResponses(sys, recentHistory()); } catch (e) { /* sem web -> cai pro chat normal */ } }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.apiKey },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: "system", content: sys }, ...recentHistory()] }),
  });
  if (!res.ok) throw new Error(apiError("OpenAI", res.status, await res.text()));
  const data = await res.json();
  return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
}
async function openaiOnce(sys, userMsg, web) {
  const model = curModel("gpt", "gpt-4o-mini");
  if (web) { try { return await openaiResponses(sys, [{ role: "user", content: userMsg }]); } catch (e) { /* cai pro chat */ } }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.apiKey },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }], response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(apiError("OpenAI", res.status, await res.text()));
  const data = await res.json();
  return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
}
// OpenAI com busca web (Responses API). Extracao blindada do output_text.
async function openaiResponses(sys, msgs) {
  const model = curModel("gpt", "gpt-4o-mini");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.apiKey },
    body: JSON.stringify({ model, input: [{ role: "system", content: sys }, ...msgs], tools: [{ type: "web_search_preview" }] }),
  });
  if (!res.ok) throw new Error(apiError("OpenAI", res.status, await res.text()));
  const data = await res.json();
  if (data.output_text) return String(data.output_text).trim();
  return (data.output || []).flatMap((o) => (o.content || [])).map((c) => c.text || "").join("").trim();
}

function setStatus(s) { el("status").textContent = s; }

/* ---------- Voz: saida (TTS) ---------- */
let chosenVoice = null;
const FEM_RE = /(Maria|Luciana|Francisca|Fernanda|Vit[oó]ria|Heloisa|Joana|Catarina|Ines|In[eê]s|Raquel|Camila|Female|fem|mulher|woman|girl|-f-|_f_|afs)/i;
const MAL_RE = /(Daniel|Felipe|Ricardo|Antonio|Ant[oô]nio|Joao|Jo[aã]o|Male|masc|man|homem|-m-|_m_|ams)/i;
function ptVoices() { return (("speechSynthesis" in window) ? window.speechSynthesis.getVoices() : []).filter((v) => /^pt/i.test(v.lang)); }
// Escolhe uma voz por genero: "f" feminina, "m" masculina.
function voiceByGender(g) {
  const pt = ptVoices(); const all = ("speechSynthesis" in window) ? window.speechSynthesis.getVoices() : [];
  if (g === "m") return pt.find((v) => MAL_RE.test(v.name)) || pt.find((v) => !FEM_RE.test(v.name)) || pt[0] || all[0] || null;
  return pt.find((v) => FEM_RE.test(v.name)) || pt.find((v) => !MAL_RE.test(v.name)) || pt[0] || all[0] || null;
}
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  chosenVoice = voiceByGender("f"); // padrao: feminina (Maria Sarah)
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
  loadMascot(); // ja temos token: garante o mascote
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
  loadMascot();
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
// Mascote Maria Sarah: usa o cache; senao baixa do cofre (M365), encolhe e cacheia.
function applyMascot(url) {
  if (!url) return;
  document.querySelectorAll(".mascot-img").forEach((im) => { im.src = url; im.style.display = ""; });
  document.querySelectorAll(".mascot-emoji").forEach((e) => { e.style.display = "none"; });
}
function shrinkImage(blob, maxW) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL("image/png")); } catch (e) { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = URL.createObjectURL(blob);
  });
}
// Acha a melhor imagem da Maria Sarah no cofre: prefere a INDIVIDUAL (nome com app/avatar/perfil/
// individual/sozinha/recorte) e penaliza folha de personagem (character/sheet/masconte/folha). Senao, a mais nova.
async function findMascotItem() {
  if (!window._cofreToken) return null;
  try {
    const data = await graph(`/drives/${cfg.driveId}/root/search(q='sarah')?$top=30&$select=id,name,file,lastModifiedDateTime`, window._cofreToken);
    const imgs = (data.value || []).filter((it) => it.file && /\.(png|jpe?g|webp)$/i.test(it.name) && /sarah|sarinha|mascote|masconte/i.test(it.name));
    if (!imgs.length) return null;
    const score = (n) => { n = (n || "").toLowerCase(); let s = 0; if (/(app|avatar|perfil|individual|sozinh|icon|recorte|crop)/.test(n)) s += 10; if (/(character|sheet|folha|masconte|v2|v3)/.test(n)) s -= 5; return s; };
    imgs.sort((a, b) => score(b.name) - score(a.name) || (new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)));
    return imgs[0];
  } catch (e) { return null; }
}
async function loadMascot() {
  let cached = null; try { cached = JSON.parse(localStorage.getItem(MASCOT_KEY) || "null"); } catch (e) { cached = null; }
  if (cached && cached.url) applyMascot(cached.url); // mostra o cache na hora
  if (!window._cofreToken) return; // sem M365 ainda; tenta de novo apos conectar
  const item = await findMascotItem();
  const id = item ? item.id : MASCOT_ITEM; // fallback: a folha do _ASSETS
  if (cached && cached.id === id && cached.url) return; // ja e a imagem atual
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/items/${id}/content`, { headers: { Authorization: "Bearer " + window._cofreToken } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = await shrinkImage(blob, 520);
    if (url) { try { localStorage.setItem(MASCOT_KEY, JSON.stringify({ id, url })); } catch (e) { /* cota cheia: usa so nesta sessao */ } applyMascot(url); }
  } catch (e) { /* silencioso */ }
}
// Extrai palavras-chave da pergunta (tira acento e palavras vazias) para buscar no cofre.
function searchTerms(text) {
  const stop = new Set(["consulta", "consultar", "planilha", "arquivo", "arquivos", "tera", "havera", "informacao", "informacoes", "sobre", "qual", "quais", "dados", "dado", "para", "por", "com", "que", "essa", "esse", "isso", "minha", "meu", "the", "and", "uma", "tem", "vai", "esta", "aqui"]);
  return (String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9_]{3,}/g) || [])
    .filter((w) => !stop.has(w)).slice(0, 6).join(" ");
}
// Busca AUTONOMA na Base DAMHA (cofre): acha o arquivo mais relevante e devolve o conteudo.
async function cofreAutoSearch(qText) {
  if (!window._cofreToken) return null;
  const term = searchTerms(qText) || String(qText).slice(0, 40);
  let data;
  try { data = await graph(`/drives/${cfg.driveId}/root/search(q='${encodeURIComponent(term)}')?$top=8&$select=id,name,file,folder`, window._cofreToken); }
  catch (e) { return null; }
  const files = (data.value || []).filter((it) => it.file && /\.(md|txt|csv|json)$/i.test(it.name));
  if (!files.length) return null;
  const top = files[0];
  let body = "";
  try { body = await graph(`/drives/${cfg.driveId}/items/${top.id}/content`, window._cofreToken, true); }
  catch (e) { return null; }
  if (!body) return null;
  return { title: top.name, body: String(body).slice(0, 12000) }; // limita o tamanho enviado
}
// Contexto da Base DAMHA: arquivo aberto manualmente OU busca autonoma no cofre (respeita egress).
async function getBaseContext(qText) {
  const manual = pickCtxNote();
  if (manual) return manual;
  if (!togState("togCerebro") || !window._cofreToken || cfg.egress === "local") return null;
  let found = null;
  try { found = await cofreAutoSearch(qText); } catch (e) { found = null; }
  if (!found) return null;
  if (cfg.egress === "hibrido" && !confirm(`Achei "${found.title}" na Base DAMHA. Anexar a esta pergunta?`)) return null;
  return found;
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
      .filter((it) => it.folder || /\.md$/i.test(it.name) || SHEET_RE.test(it.name))
      .sort((a, b) => (b.folder ? 1 : 0) - (a.folder ? 1 : 0) || a.name.localeCompare(b.name))
      .forEach((it) => {
        const li = document.createElement("li");
        const isSheet = SHEET_RE.test(it.name);
        li.textContent = (it.folder ? "\u{1F4C1} " : isSheet ? "\u{1F4CA} " : "\u{1F4C4} ") + it.name;
        li.onclick = () => it.folder ? (folderStack.push({ id: it.id, name: it.name }), listFolder())
                          : isSheet ? openSheet(it.id, it.name)
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
// Le uma planilha (.xlsx/.xlsb/.csv) da Base DAMHA: mostra um MENU de abas e a tabela da aba escolhida.
let _wb = null, _wbName = "";
async function openSheet(id, name) {
  el("noteTitle").textContent = name;
  el("sheetTabs").innerHTML = "";
  el("noteBody").textContent = "Lendo planilha...";
  el("noteView").classList.remove("hidden");
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/items/${id}/content`, { headers: { Authorization: "Bearer " + window._cofreToken } });
    if (!res.ok) throw new Error("Graph " + res.status);
    const buf = await res.arrayBuffer();
    if (typeof XLSX === "undefined") { el("noteBody").textContent = "O leitor de planilha ainda nao carregou. Verifique a conexao e reabra."; return; }
    _wb = XLSX.read(buf, { type: "array" }); _wbName = name;
    const tabs = el("sheetTabs"); tabs.innerHTML = "";
    const sel = (btn, fn) => { [...tabs.children].forEach((c) => c.classList.remove("on")); btn.classList.add("on"); fn(); };
    const resumo = document.createElement("button");
    resumo.className = "chip-s on"; resumo.textContent = "\u{1F4CB} Resumo";
    resumo.onclick = () => sel(resumo, showInventory);
    tabs.appendChild(resumo);
    (_wb.SheetNames || []).forEach((sn) => {
      const b = document.createElement("button");
      b.className = "chip-s"; b.textContent = "\u{1F4D1} " + sn;
      b.onclick = () => sel(b, () => showSheet(sn));
      tabs.appendChild(b);
    });
    showInventory(); // abre mostrando o levantamento de todas as abas
  } catch (e) {
    el("noteBody").textContent = "Erro ao ler planilha: " + e.message;
  }
}
// Levantamento: lista todas as abas, suas colunas (1a linha preenchida) e nº de linhas.
function showInventory() {
  if (!_wb) return;
  const lines = (_wb.SheetNames || []).map((sn) => {
    const rows = XLSX.utils.sheet_to_json(_wb.Sheets[sn], { header: 1, defval: "" });
    const header = rows.find((r) => r.some((c) => String(c).trim() !== "")) || [];
    const cols = header.slice(0, 20).map((c) => String(c).trim()).filter(Boolean).join(", ");
    return `• ${sn} — ${rows.length} linhas\n   colunas: ${cols || "(vazio)"}`;
  }).join("\n\n");
  const txt = `Levantamento da planilha "${_wbName}" — ${(_wb.SheetNames || []).length} abas:\n\n${lines}`;
  el("noteBody").textContent = txt;
  lastOpenedNote = { title: `${_wbName} — levantamento`, body: txt };
  const btn = el("noteAnalyze");
  btn.textContent = "Analisar com IA";
  btn.classList.toggle("hidden", cfg.egress === "local");
  btn.onclick = () => analyzeNote(lastOpenedNote.title, txt);
}
function showSheet(sn) {
  if (!_wb || !sn) return;
  const rows = XLSX.utils.sheet_to_json(_wb.Sheets[sn], { header: 1, raw: false, defval: "" });
  const compact = rows.slice(0, 40).map((r) => r.slice(0, 12).map((c) => String(c)).join(" | ")).join("\n");
  const txt = `Planilha: ${_wbName}\nAba: ${sn}\n\n${compact}` + (rows.length > 40 ? `\n... (+${rows.length - 40} linhas)` : "");
  el("noteBody").textContent = txt;
  lastOpenedNote = { title: `${_wbName} — ${sn}`, body: txt };
  const btn = el("noteAnalyze");
  btn.textContent = "Plotar/analisar com IA";
  btn.classList.toggle("hidden", cfg.egress === "local");
  btn.onclick = () => analyzeNote(lastOpenedNote.title, txt);
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
  document.querySelectorAll("#projBrowser .pcards").forEach((n) => n.remove()); // limpa cards anteriores
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
    const items = (data.value || []).sort((a, b) => (b.folder ? 1 : 0) - (a.folder ? 1 : 0) || b.name.localeCompare(a.name));
    ul.innerHTML = "";
    const cards = document.createElement("div"); cards.className = "pcards";
    items.forEach((it) => {
      const isHtml = it.file && /\.html?$/i.test(it.name);
      if (it.folder) {
        const p = prettyProj(it.name);
        const c = document.createElement("button");
        c.className = "pcard";
        c.innerHTML = `<span class="pcard-ic">\u{1F4C1}</span><span class="pcard-t">${escapeHtml(p.title)}</span>${p.date ? `<span class="pcard-d">${escapeHtml(p.date)}</span>` : ""}`;
        c.onclick = () => { projStack.push({ id: it.id, name: it.name }); listProj(); };
        cards.appendChild(c);
      } else {
        const li = document.createElement("li");
        li.textContent = (isHtml ? "\u{1F310} " : "\u{1F4C4} ") + it.name;
        li.onclick = () => { if (isHtml) openHtml(it.id, it.name); else if (it.webUrl) window.open(it.webUrl, "_blank"); };
        ul.appendChild(li);
      }
    });
    if (cards.children.length) ul.before(cards);
    if (!cards.children.length && !ul.children.length) ul.innerHTML = "<li class='muted'>Pasta vazia.</li>";
  } catch (e) {
    ul.innerHTML = `<li class='muted'>Erro: ${e.message}</li>`;
  }
}
// Titulo/data legiveis a partir do nome da pasta do projeto (ex.: 2026.06.08_ANALISE_RISCO_SOJA)
function prettyProj(name) {
  const m = name.match(/^(\d{4}[.\-]\d{2}(?:[.\-]\d{2})?)[_\s.\-]*(.*)$/);
  const date = m ? m[1].replace(/-/g, ".") : "";
  let title = (m && m[2] ? m[2] : name).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  title = title.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return { date, title: title || name };
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
  initTheme();
  renderSuggest();
  initReport();
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
  el("relWa").onclick = relWhats; el("relShare").onclick = relShare; el("relPdf").onclick = relPdf;
  el("chatWa").onclick = chatWhats; el("chatShare").onclick = chatShare; el("chatPdf").onclick = chatPdf;
  el("cmClose").onclick = closeChartModal;
  el("cmPng").onclick = downloadPng;
  el("cmPdf").onclick = chartPdf;
  el("cmShare").onclick = chartShare;
  el("cmCopy").onclick = copyPng;
  document.querySelectorAll("#chartModal [data-ct]").forEach((b) => { b.onclick = () => { _modalType = b.dataset.ct; drawModal(); }; });
  el("chartModal").addEventListener("click", (e) => { if (e.target === el("chartModal")) closeChartModal(); });
  // Voz aplica na hora (corrige "nao troca") + toca amostra
  el("voiceSel").onchange = () => { applyVoiceLive(); speakWith("Pronto, voz trocada. Eu sou a Maria Sarah.", cfg.pitch, cfg.rate, cfg.voiceName); };
  el("voicePitch").oninput = applyVoiceLive;
  el("voiceRate").oninput = applyVoiceLive;
  document.querySelectorAll("[data-pp]").forEach((b) => {
    b.onclick = () => {
      const [p, r] = b.dataset.pp.split(",").map(Number);
      const g = b.dataset.voice; // "f" feminina, "m" masculina, ou vazio = automatica
      const v = g ? voiceByGender(g) : null;
      const vn = v ? v.name : "";
      el("voiceSel").value = vn;
      el("voicePitch").value = p; el("voiceRate").value = r;
      applyVoiceLive();
      speakWith((b.dataset.say || "Oi! Eu sou a Maria Sarah, sua copiloto da Damha Agro."), p, r, vn);
    };
  });
  armOpenSound();
  el("saveCfg").onclick = saveCfg;
  el("keyTest").onclick = testKey;
  // Trocar de provedor/modelo SALVA na hora (antes so valia apos "Salvar" -> chat usava o provedor errado).
  el("provider").onchange = () => { populateModels(el("provider").value); saveCfg(); };
  el("model").onchange = saveCfg;
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
  loadMascot(); // mostra o mascote na hora se ja estiver em cache
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
