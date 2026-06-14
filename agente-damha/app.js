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
  model: "gemini-2.0-flash",
  egress: "hibrido",
  // Client ID do registro Azure "Agente DAMHA" (publico, nao e segredo)
  azureClient: "934b3c6e-db97-434a-aff0-dd6d8b3b82d8",
  // driveId do cofre (CLAUDE.md secao 3)
  driveId: "b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4",
};
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
const SYSTEM_PROMPT = `Voce e o Agente DAMHA, parceira de debate e pensamento critico de Daniel — NAO validadora.
Questione premissas frageis (logica, emocional, estrategica), aponte vieses, racionalizacoes, riscos e a visao contraria mais forte.
Diferencie fato, interpretacao e opiniao; sinalize incerteza; nunca invente dados, fontes ou cenarios.
Regra primordial: nada comeca do zero — o cofre Obsidian e a fonte mestra; em conflito, o cofre vence.
Tom natural, humano, direto e elegante. Conclusoes comecam com "Enfim.". Datas em DD/MM/YYYY.
Quando receber o conteudo de uma nota do cofre como contexto, trate-a como fonte e raciocine sobre ela.`;

let cfg = loadCfg();
let history = [];          // historico da conversa [{role, content}]
let pendingNoteContext = null; // nota aprovada para envio (egress hibrido)
let msalApp = null;
let folderStack = [];      // navegacao do cofre

/* ---------- Config ---------- */
function loadCfg() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("agenteDamhaCfg") || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
function saveCfg() {
  cfg = {
    apiKey: el("apiKey").value.trim(),
    provider: el("provider").value,
    model: el("model").value.trim(),
    egress: el("egress").value,
    azureClient: el("azureClient").value.trim(),
    driveId: el("driveId").value.trim() || DEFAULTS.driveId,
  };
  localStorage.setItem("agenteDamhaCfg", JSON.stringify(cfg));
  el("cfgStatus").textContent = "Salvo neste aparelho. " + new Date().toLocaleTimeString("pt-BR");
}
// Versoes selecionaveis por provedor
const MODELS = {
  gemini: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  claude: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o-mini", "gpt-4o"],
};
function populateModels(provider, selected) {
  const sel = el("model");
  sel.innerHTML = "";
  (MODELS[provider] || []).forEach((m) => {
    const o = document.createElement("option");
    o.value = m; o.textContent = m;
    if (m === selected) o.selected = true;
    sel.appendChild(o);
  });
}
function hydrateCfgForm() {
  el("apiKey").value = cfg.apiKey;
  el("provider").value = cfg.provider || "gemini";
  populateModels(cfg.provider || "gemini", cfg.model);
  el("egress").value = cfg.egress;
  el("azureClient").value = cfg.azureClient;
  el("driveId").value = cfg.driveId;
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

async function sendMessage() {
  const text = el("input").value.trim();
  if (!text) return;
  if (!cfg.apiKey) { addMsg("Configure a chave da API em Config (Gemini ou Claude).", "err"); return; }

  el("input").value = "";
  addMsg(text, "user");

  // Egress hibrido: anexa a nota aprovada (uma vez) ao conteudo do usuario.
  let userContent = text;
  if (pendingNoteContext) {
    userContent = `Contexto (nota do cofre "${pendingNoteContext.title}"):\n\n${pendingNoteContext.body}\n\n---\nPergunta: ${text}`;
    setStatus(`Enviando com a nota "${pendingNoteContext.title}".`);
    pendingNoteContext = null;
  }
  history.push({ role: "user", content: userContent });

  setStatus("Pensando...");
  try {
    const reply = cfg.provider === "claude" ? await callClaude()
                : cfg.provider === "openai" ? await callOpenAI()
                : await callGemini();
    history.push({ role: "assistant", content: reply });
    addMsg(reply, "bot");
    setStatus("");
    if (el("ttsOn").checked) speak(reply);
  } catch (e) {
    addMsg(e.message || ("Falha: " + e), "err");
    setStatus("");
  }
}

async function callClaude() {
  const model = (cfg.model || "").startsWith("claude") ? cfg.model : "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM_PROMPT, messages: history }),
  });
  if (!res.ok) throw new Error(`Erro Claude (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("").trim();
}

async function callGemini() {
  const model = (cfg.model || "").startsWith("gemini") ? cfg.model : "gemini-2.0-flash";
  const contents = history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body = { contents, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, generationConfig: { maxOutputTokens: 1500 } };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Erro Gemini (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim()
    || "(resposta vazia — veja se o modelo em Config existe)";
}

async function callOpenAI() {
  const model = (cfg.model || "").startsWith("gpt") ? cfg.model : "gpt-4o-mini";
  const msgs = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.apiKey },
    body: JSON.stringify({ model, max_tokens: 1500, messages: msgs }),
  });
  if (!res.ok) throw new Error(`Erro OpenAI (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
}

function setStatus(s) { el("status").textContent = s; }

/* ---------- Voz: saida (TTS) ---------- */
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
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
  recog.onend = () => { recording = false; el("micBtn").classList.remove("rec"); };
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
    if (resp && resp.accessToken) { window._cofreToken = resp.accessToken; await openCofreRoot(); return; }
  } catch (e) { addMsg("Erro ao voltar do login: " + e.message, "err"); }
  const acc = app.getAllAccounts()[0];
  if (acc) {
    try { const r = await app.acquireTokenSilent({ scopes: SCOPES, account: acc }); window._cofreToken = r.accessToken; }
    catch { /* precisa de login interativo */ }
  }
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
    try { const r = await app.acquireTokenSilent({ scopes: SCOPES, account: acc }); window._cofreToken = r.accessToken; await openCofreRoot(); return; }
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
window.addEventListener("DOMContentLoaded", () => {
  hydrateCfgForm();
  renderProjetos();
  renderNucleo();
  initSpeech();
  initNav();
  el("sendBtn").onclick = sendMessage;
  el("micBtn").onclick = toggleMic;
  el("saveCfg").onclick = saveCfg;
  el("provider").onchange = () => populateModels(el("provider").value);
  el("cofreLogin").onclick = cofreLogin;
  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  // erros visiveis (em vez de falhar em silencio)
  window.addEventListener("error", (ev) => { el("cofreStatus").textContent = "Erro: " + ev.message; });
  window.addEventListener("unhandledrejection", (ev) => { el("cofreStatus").textContent = "Falha: " + ((ev.reason && ev.reason.message) || ev.reason); });
  el("cofreStatus").textContent = "Build v1.9 · app " + APP_CLIENT_ID.slice(0, 8);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  welcome();
  initAuthOnLoad();
});

function welcome() {
  if (!cfg.apiKey) {
    addMsg("Ola, Daniel. Sou o Agente DAMHA (nome provisorio).\n\n" +
      "Para conversar, abra Config, escolha o Provedor (Gemini tem plano gratis) e cole a chave da API. " +
      "Tudo fica so neste aparelho.\n\n" +
      "Quando estiver pronto, e so falar (botao do microfone) ou escrever.", "bot");
  } else {
    addMsg("Ola, Daniel. Pronto. Fale ou escreva — e lembre que sou parceira de debate, nao validadora.", "bot");
  }
}
