/* ===========================================================================
   Agente DAMHA — PWA cliente (roda 100% no aparelho, sem servidor nosso)
   - Voz: Web Speech API (entrada) + SpeechSynthesis (saida)
   - Claude: chamada direta a api.anthropic.com (chave fica no localStorage)
   - Cofre: Microsoft Graph via MSAL (login M365 do proprio Daniel)
   - Egress: hibrido com confirmacao (padrao) — nada do cofre sai sem aprovar
   =========================================================================== */

const DEFAULTS = {
  apiKey: "",
  model: "claude-sonnet-4-6",
  egress: "hibrido",
  azureClient: "",
  // driveId do cofre (CLAUDE.md secao 3)
  driveId: "b!1kJQvOKGPUaoCtP7BwPBCspAmqVU5CBNqGAvu6RBywKZB41v4RwsSoZLFB47yXm4",
};
// Pasta raiz do cofre (CLAUDE.md secao 3)
const ROOT_FOLDER = "01KCR6ZALNPTVWS2LBS5HYFDHIWJ3QGS7E";

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
    model: el("model").value,
    egress: el("egress").value,
    azureClient: el("azureClient").value.trim(),
    driveId: el("driveId").value.trim() || DEFAULTS.driveId,
  };
  localStorage.setItem("agenteDamhaCfg", JSON.stringify(cfg));
  el("cfgStatus").textContent = "Salvo neste aparelho. " + new Date().toLocaleTimeString("pt-BR");
}
function hydrateCfgForm() {
  el("apiKey").value = cfg.apiKey;
  el("model").value = cfg.model;
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
  if (!cfg.apiKey) { addMsg("Configure a chave da API Anthropic em Config.", "err"); return; }

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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: history,
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      addMsg(`Erro da API (${res.status}): ${errTxt.slice(0, 300)}`, "err");
      setStatus("");
      return;
    }
    const data = await res.json();
    const reply = (data.content || []).map((b) => b.text || "").join("").trim();
    history.push({ role: "assistant", content: reply });
    addMsg(reply, "bot");
    setStatus("");
    if (el("ttsOn").checked) speak(reply);
  } catch (e) {
    addMsg("Falha de rede: " + e.message, "err");
    setStatus("");
  }
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

/* ---------- Cofre (M365 / Graph) ---------- */
function initMsal() {
  if (!cfg.azureClient) return null;
  return new msal.PublicClientApplication({
    auth: {
      clientId: cfg.azureClient,
      authority: "https://login.microsoftonline.com/common",
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: "localStorage" },
  });
}
async function getToken() {
  if (!msalApp) msalApp = initMsal();
  if (!msalApp) { alert("Informe o Azure Client ID em Config."); return null; }
  await msalApp.initialize();
  const scopes = ["Files.Read.All", "Sites.Read.All", "User.Read"];
  const accounts = msalApp.getAllAccounts();
  try {
    if (accounts.length) {
      const r = await msalApp.acquireTokenSilent({ scopes, account: accounts[0] });
      return r.accessToken;
    }
  } catch { /* cai para popup */ }
  const r = await msalApp.acquireTokenPopup({ scopes });
  return r.accessToken;
}
async function graph(path, token, asText = false) {
  const res = await fetch("https://graph.microsoft.com/v1.0" + path, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) throw new Error("Graph " + res.status);
  return asText ? res.text() : res.json();
}
async function cofreLogin() {
  const token = await getToken();
  if (!token) return;
  window._cofreToken = token;
  el("cofreAuth").classList.add("hidden");
  el("cofreBrowser").classList.remove("hidden");
  folderStack = [{ id: ROOT_FOLDER, name: "Cofre" }];
  await listFolder();
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
    const ok = confirm(`Enviar a nota "${title}" para o Claude (Anthropic)?\n\nEla e Uso Interno e Confidencial. So confirme se quiser que o conteudo seja analisado.`);
    if (!ok) return;
  }
  pendingNoteContext = { title, body };
  location.hash = "#conversa";
  el("input").value = `Analise a nota "${title}": `;
  el("input").focus();
  setStatus(`Nota "${title}" pronta para enviar na proxima mensagem.`);
}

/* ---------- Projetos (atalhos) ---------- */
const PROJETOS = [
  { nome: "Painel Dolar Futuros", url: "#" },
  { nome: "Mission Control Mercado", url: "#" },
  { nome: "Painel Commodities", url: "#" },
  { nome: "USD/BRL Hedge", url: "#" },
];
function renderProjetos() {
  const ul = el("projetosList"); ul.innerHTML = "";
  PROJETOS.forEach((p) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = p.url; a.textContent = p.nome;
    li.appendChild(a); ul.appendChild(li);
  });
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

/* ---------- Init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  hydrateCfgForm();
  renderProjetos();
  initSpeech();
  initScrollSpy();
  el("sendBtn").onclick = sendMessage;
  el("micBtn").onclick = toggleMic;
  el("saveCfg").onclick = saveCfg;
  el("cofreLogin").onclick = cofreLogin;
  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
});
