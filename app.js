
/* Tuinlog MVP — 5 boeken + detail sheets
   - Logboek: start/stop/pauze, items toevoegen
   - Afrekenboek: bundel logs, per regel Factuur/Cash dropdown
   - Klanten: detail toont logs + afrekeningen
   - Producten: beheerlijst, gebruikt in logs/afrekeningen
   - Status kleuren: logs afgeleid van afrekening.status
*/

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

const STORAGE_KEY = "tuinlog_mvp_v1";
const START_TOP_LIMIT = 8;
const $ = (s) => document.querySelector(s);
const NAV_TRANSITION_MS = 240;
const NAV_TRANSITION_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const SETTLEMENT_LIST_DEFAULTS = {
  statusFilter: ["draft", "calculated"],
  onlyInvoices: false,
  sortKey: "date",
  sortDir: "desc"
};

const uid = () => Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
const now = () => Date.now();
const todayISO = () => new Date().toISOString().slice(0,10);
const esc = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function fmtMoney(n){
  const v = Number(n||0);
  return "€" + v.toFixed(2).replace(".", ",");
}
function fmtMoney0(n){
  const v = Number(n||0);
  return "€" + String(Math.round(v));
}
function pad2(n){ return String(n).padStart(2,"0"); }
function parseLocalYMD(ymd){
  const [y, m, d] = String(ymd || "").split("-").map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function formatLocalYMD(dateObj){
  const dt = dateObj instanceof Date ? dateObj : new Date(dateObj);
  if (!Number.isFinite(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dayStartLocal(dateLike){
  const dt = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
}
function shiftMsByDays(msOrIsoOrDate, dayDelta){
  const dt = msOrIsoOrDate instanceof Date ? msOrIsoOrDate : new Date(msOrIsoOrDate);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Date(dt.getTime() + dayDelta * 86400000);
}
function fmtClock(ms){
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function durMsToHM(ms){
  const m = Math.max(0, Math.floor(ms/60000));
  const h = Math.floor(m/60);
  const mm = m%60;
  return `${h}u ${pad2(mm)}m`;
}
function calculateDuration(start, end) {
  const [sh, sm] = String(start || "").split(":").map(Number);
  const [eh, em] = String(end || "").split(":").map(Number);

  if (![sh, sm, eh, em].every(Number.isFinite)) return "0u 00m";

  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const diff = Math.max(0, endMin - startMin);

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  return `${hours}u ${minutes.toString().padStart(2, "0")}m`;
}
function getSegmentMinutes(segment){
  const start = fmtTimeInput(segment?.start);
  const end = fmtTimeInput(segment?.end);
  if (!start || !end) return 0;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;

  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}
function formatMinutesAsDuration(totalMinutes){
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}u ${String(m).padStart(2, "0")}m`;
}
function formatDurationCompact(totalMinutes){
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}u${String(m).padStart(2, "0")}m`;
}
function round2(n){ return Math.round((Number(n||0))*100)/100; }
function roundToNearestHalf(n){
  return Math.round((Number(n || 0) * 2)) / 2;
}
function formatDatePretty(isoDate){
  if (!isoDate) return "";
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))
    ? String(isoDate)
    : formatLocalYMD(new Date(isoDate));
  if (!ymd) return String(isoDate);
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (!Number.isFinite(dt.getTime())) return String(isoDate);
  const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const monthNames = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const yy = String(y).slice(-2);
  return `${dayNames[dt.getDay()]} ${d} ${monthNames[m - 1]} ${yy}`;
}
function formatDateNoWeekday(isoDate){
  if (!isoDate) return "";
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))
    ? String(isoDate)
    : formatLocalYMD(new Date(isoDate));
  if (!ymd) return String(isoDate);
  const [y, m, d] = ymd.split("-").map(Number);
  const monthNames = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const yy = String(y).slice(-2);
  return `${d} ${monthNames[m - 1]} ${yy}`;
}
function formatLogDatePretty(isoDate){
  return formatDatePretty(isoDate);
}
function formatMoneyEUR(amount){
  return fmtMoney(amount);
}
function formatMoneyEUR0(amount){
  return fmtMoney0(amount);
}
function moneyOrBlank(amount){
  const v = Number(amount || 0);
  return v === 0 ? "" : formatMoneyEUR(v);
}
function fmtTimeInput(ms){
  if (!Number.isFinite(ms)) return "";
  return fmtClock(ms);
}
function parseLogTimeToMs(isoDate, value){
  if (!value) return null;
  const baseDate = formatLocalYMD(new Date(isoDate));
  if (!baseDate) return null;
  const parsed = new Date(`${baseDate}T${value}:00`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function setLogDay(log, newYMD){
  if (!log || !newYMD) return false;
  const oldBase = dayStartLocal(log.date);
  const newBase = parseLocalYMD(newYMD);
  if (!oldBase || !newBase) return false;

  const dayDelta = Math.round((newBase.getTime() - oldBase.getTime()) / 86400000);
  if (!dayDelta) return false;

  const shiftedLogDate = shiftMsByDays(log.date, dayDelta);
  log.date = shiftedLogDate ? formatLocalYMD(shiftedLogDate) : formatLocalYMD(newBase);

  if (Array.isArray(log.segments)){
    for (const segment of log.segments){
      if (segment.start != null){
        const shiftedStart = shiftMsByDays(segment.start, dayDelta);
        if (shiftedStart) segment.start = shiftedStart.getTime();
      }
      if (segment.end != null){
        const shiftedEnd = shiftMsByDays(segment.end, dayDelta);
        if (shiftedEnd) segment.end = shiftedEnd.getTime();
      }
    }
  }

  return true;
}

function normalizeTheme(theme){
  return theme === "day" ? "day" : "night";
}

function syncThemeColorWithChromeBg(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--chrome-bg").trim();
  if (bg) meta.setAttribute("content", bg);
}

function applyTheme(theme){
  const selected = normalizeTheme(theme);
  document.body.setAttribute("data-theme", selected);
  syncThemeColorWithChromeBg();
}

window.addEventListener("DOMContentLoaded", syncThemeColorWithChromeBg);

function confirmDelete(label){
  return confirm(`Zeker verwijderen?\n\n${label}\n\nDit kan niet ongedaan gemaakt worden.`);
}
function confirmAction(label){
  return confirm(label);
}

function ensureModalRoot(){
  let root = document.getElementById("appModalRoot");
  if (root) return root;
  root = document.createElement("div");
  root.id = "appModalRoot";
  document.body.appendChild(root);
  return root;
}

function closeModal(){
  const root = document.getElementById("appModalRoot");
  if (!root) return;
  root.innerHTML = "";
}

function openConfirmModal({ title, message, confirmText = "Bevestigen", cancelText = "Annuleren", danger = false }){
  return new Promise((resolve)=>{
    const root = ensureModalRoot();
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="item-title" id="modalTitle">${esc(title || "Bevestigen")}</div>
          <div class="small modal-message">${esc(message || "")}</div>
          <div class="row modal-actions">
            <button class="btn" id="modalCancelBtn">${esc(cancelText)}</button>
            <button class="btn ${danger ? "danger" : "primary"}" id="modalConfirmBtn">${esc(confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    const finish = (value)=>{
      closeModal();
      resolve(value);
    };

    root.querySelector("#modalCancelBtn")?.addEventListener("click", ()=> finish(false));
    root.querySelector("#modalConfirmBtn")?.addEventListener("click", ()=> finish(true));
    root.querySelector(".modal-backdrop")?.addEventListener("click", (e)=>{
      if (e.target.classList.contains("modal-backdrop")) finish(false);
    });
  });
}

function openTextConfirmModal({ title, message, expectedText, confirmText = "Definitief wissen", cancelText = "Annuleren" }){
  return new Promise((resolve)=>{
    const root = ensureModalRoot();
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitleTextConfirm">
          <div class="item-title" id="modalTitleTextConfirm">${esc(title || "Bevestigen")}</div>
          <div class="small modal-message">${esc(message || "")}</div>
          <label for="modalConfirmInput">Typ <span class="mono">${esc(expectedText)}</span> om verder te gaan</label>
          <input id="modalConfirmInput" autocomplete="off" />
          <div class="row modal-actions">
            <button class="btn" id="modalCancelBtn">${esc(cancelText)}</button>
            <button class="btn danger" id="modalConfirmBtn" disabled>${esc(confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    const input = root.querySelector("#modalConfirmInput");
    const confirmBtn = root.querySelector("#modalConfirmBtn");
    const finish = (value)=>{
      closeModal();
      resolve(value);
    };

    input?.addEventListener("input", ()=>{
      const valid = (input.value || "").trim().toUpperCase() === String(expectedText || "").trim().toUpperCase();
      confirmBtn.disabled = !valid;
    });

    root.querySelector("#modalCancelBtn")?.addEventListener("click", ()=> finish(false));
    confirmBtn?.addEventListener("click", ()=> finish(true));
    root.querySelector(".modal-backdrop")?.addEventListener("click", (e)=>{
      if (e.target.classList.contains("modal-backdrop")) finish(false);
    });
  });
}

// ---------- State ----------
function defaultState(){
  return {
    schemaVersion: 1,
    settings: { hourlyRate: 38, vatRate: 0.21, theme: "night" },
    customers: [
      { id: uid(), nickname:"Jules", name:"", address:"Heverlee, Leuven", createdAt: now() },
      { id: uid(), nickname:"Noor", name:"", address:"Kessel-Lo, Leuven", createdAt: now() },
    ],
    products: [
      { id: uid(), name:"Werk", unit:"uur", unitPrice:38, vatRate:0.21, defaultBucket:"invoice" },
      { id: uid(), name:"Groen", unit:"keer", unitPrice:38, vatRate:0.21, defaultBucket:"invoice" },
    ],
    logs: [],
    settlements: [],
    activeLogId: null,
    ui: {},
    logbook: {
      statusFilter: "open",
      showFilters: false,
      customerId: "all",
      period: "all",
      groupBy: "date",
      sortDir: "desc"
    },
    settlementList: {
      ...SETTLEMENT_LIST_DEFAULTS
    }
  };
}

function safeParseState(raw){
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function migrateState(st){
  if (!st || typeof st !== "object" || Array.isArray(st)) return defaultState();

  let version = Number.isInteger(st.schemaVersion) ? st.schemaVersion : 0;

  while (version < 1){
    switch (version){
      case 0:
        st.schemaVersion = 1;
        version = 1;
        break;
      default:
        st.schemaVersion = 1;
        version = 1;
        break;
    }
  }

  if (!Number.isInteger(st.schemaVersion) || st.schemaVersion < 1) st.schemaVersion = 1;
  return st;
}

function validateAndRepairState(st){
  if (!st || typeof st !== "object" || Array.isArray(st)) return defaultState();

  if (!Array.isArray(st.customers)) st.customers = [];
  if (!Array.isArray(st.logs)) st.logs = [];
  if (!Array.isArray(st.settlements)) st.settlements = [];
  if (!Array.isArray(st.products)) st.products = [];
  if (!st.settings || typeof st.settings !== "object" || Array.isArray(st.settings)) st.settings = {};
  if (!st.ui || typeof st.ui !== "object" || Array.isArray(st.ui)) st.ui = {};

  return st;
}

function ensureUIPreferences(st){
  st.ui = st.ui || {};
  st.logbook = st.logbook || {};
  st.settlementList = st.settlementList || {};

  if (!["open", "paid", "all"].includes(st.logbook.statusFilter)){
    st.logbook.statusFilter = ["open", "paid", "all"].includes(st.ui.logFilter) ? st.ui.logFilter : "open";
  }
  if (!("showFilters" in st.logbook)) st.logbook.showFilters = Boolean(st.ui.showLogFilters);
  if (!("customerId" in st.logbook)) st.logbook.customerId = st.ui.logCustomerId || "all";
  if (!("period" in st.logbook)){
    const legacyMap = { "7d": "week", "30d": "30d", "90d": "month", "all": "all" };
    st.logbook.period = legacyMap[st.ui.logPeriod] || "all";
  }
  if (!["all", "week", "month", "30d"].includes(st.logbook.period)) st.logbook.period = "all";
  if (!["date", "customer", "workTime", "productTotal", "status"].includes(st.logbook.groupBy)) st.logbook.groupBy = "date";
  if (!["desc", "asc"].includes(st.logbook.sortDir)) st.logbook.sortDir = "desc";

  const normalizedStatusFilter = Array.isArray(st.settlementList.statusFilter)
    ? [...new Set(st.settlementList.statusFilter.filter(status => ["draft", "calculated", "paid"].includes(status)))]
    : [];
  st.settlementList.statusFilter = normalizedStatusFilter.length
    ? normalizedStatusFilter
    : [...SETTLEMENT_LIST_DEFAULTS.statusFilter];
  if (typeof st.settlementList.onlyInvoices !== "boolean") st.settlementList.onlyInvoices = SETTLEMENT_LIST_DEFAULTS.onlyInvoices;
  if (!["date", "invoiceNumber"].includes(st.settlementList.sortKey)) st.settlementList.sortKey = SETTLEMENT_LIST_DEFAULTS.sortKey;
  if (!["desc", "asc"].includes(st.settlementList.sortDir)) st.settlementList.sortDir = SETTLEMENT_LIST_DEFAULTS.sortDir;

  if (!("editLogId" in st.ui)) st.ui.editLogId = null;
  if (!("editSettlementId" in st.ui)) st.ui.editSettlementId = null;
  if (st.ui.settlementEditModes && !st.ui.editSettlementId){
    const activeId = Object.entries(st.ui.settlementEditModes).find(([, isEditing]) => Boolean(isEditing))?.[0] || null;
    st.ui.editSettlementId = activeId;
  }
  delete st.ui.settlementEditModes;
  delete st.ui.logFilter;
  delete st.ui.showLogFilters;
  delete st.ui.logCustomerId;
  delete st.ui.logPeriod;
}

function isSettlementEditing(settlementId){
  return state.ui.editSettlementId === settlementId;
}

function toggleEditSettlement(settlementId){
  actions.setEditSettlement(settlementId);
}

function ensureCoreProducts(st){
  st.products = st.products || [];
  const coreProducts = [
    { name:"Werk", unit:"uur", unitPrice:38, vatRate:0.21, defaultBucket:"invoice" },
    { name:"Groen", unit:"keer", unitPrice:38, vatRate:0.21, defaultBucket:"invoice" },
  ];
  for (const core of coreProducts){
    const exists = st.products.find(p => (p.name||"").trim().toLowerCase() === core.name.toLowerCase());
    if (!exists){
      st.products.push({ id: uid(), ...core });
    }
  }
}

function ensureDemoProducts(st){
  st.products = st.products || [];
  const demoExtras = [
    { name:"Meststof", unit:"zak", unitPrice:12.5, vatRate:0.21, defaultBucket:"invoice" },
    { name:"Hakselhout", unit:"m³", unitPrice:35, vatRate:0.21, defaultBucket:"invoice" },
    { name:"Anti-worteldoek", unit:"rol", unitPrice:18, vatRate:0.21, defaultBucket:"invoice" },
    { name:"Transport", unit:"rit", unitPrice:15, vatRate:0.21, defaultBucket:"invoice" },
    { name:"Machine huur", unit:"dag", unitPrice:45, vatRate:0.21, defaultBucket:"invoice" },
  ];
  for (const demoExtra of demoExtras){
    const exists = st.products.find(p => (p.name || "").trim().toLowerCase() === demoExtra.name.toLowerCase());
    if (!exists){
      st.products.push({ id: uid(), ...demoExtra, demo: true });
    }
  }
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw){
    const st = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    return st;
  }
  const parsed = safeParseState(raw);
  if (!parsed.ok){
    const st = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    return st;
  }
  const st = validateAndRepairState(migrateState(parsed.value));

  // migrations
  if (!st.settings) st.settings = { hourlyRate: 38, vatRate: 0.21, theme: "night" };
  if (!("hourlyRate" in st.settings)) st.settings.hourlyRate = 38;
  if (!("vatRate" in st.settings)) st.settings.vatRate = 0.21;
  if (!("theme" in st.settings)) st.settings.theme = "night";
  st.settings.theme = normalizeTheme(st.settings.theme);
  if (!st.customers) st.customers = [];
  if (!st.products) st.products = [];
  if (!st.logs) st.logs = [];
  if (!st.settlements) st.settlements = [];
  if (!("activeLogId" in st)) st.activeLogId = null;
  ensureUIPreferences(st);

  for (const c of st.customers){
    if (!("demo" in c)) c.demo = false;
  }
  ensureUniqueCustomerNicknames(st);
  for (const p of st.products){
    if (!("demo" in p)) p.demo = false;
  }

  ensureCoreProducts(st);

  // settlement status default
  for (const s of st.settlements){
    if (!s.status) s.status = "draft";
    if (!s.lines) s.lines = [];
    if (!s.logIds) s.logIds = [];
    if (!("markedCalculated" in s)) s.markedCalculated = s.status === "calculated";
    if (!("isCalculated" in s)) s.isCalculated = Boolean(s.markedCalculated || s.status === "calculated" || s.status === "paid" || s.calculatedAt);
    if (!("calculatedAt" in s)) s.calculatedAt = s.isCalculated ? (s.createdAt || now()) : null;
    if (!("invoicePaid" in s)) s.invoicePaid = false;
    if (!("cashPaid" in s)) s.cashPaid = false;
    if (!("invoiceAmount" in s)) s.invoiceAmount = 0;
    if (!("cashAmount" in s)) s.cashAmount = 0;
    if (!("invoiceLocked" in s)) s.invoiceLocked = Boolean(s.isCalculated);
    syncSettlementDatesFromLogs(s, st);
    ensureSettlementInvoiceDefaults(s);
    syncSettlementAmounts(s);
    if (!("demo" in s)) s.demo = false;
  }
  // log fields
  for (const l of st.logs){
    if (!l.segments) l.segments = [];
    if (!l.items) l.items = [];
    if (!l.date) l.date = todayISO();
    if (!("demo" in l)) l.demo = false;
  }

  ensureUIPreferences(st);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(st));

  return st;
}

function saveState(nextState = state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)); }

const DEMO = {
  firstNames: ["Jan", "Els", "Koen", "Sofie", "Lotte", "Tom", "An", "Pieter", "Nina", "Wim", "Bram", "Fien", "Arne", "Joke", "Raf", "Mira", "Tine", "Milan"],
  lastNames: ["Peeters", "Janssens", "Van den Broeck", "Wouters", "Claes", "Lambrechts", "Maes", "Vermeulen", "Hermans", "Goossens", "De Smet", "Schreurs", "Leclercq", "Van Acker", "Bogaert", "Pieters", "Nijs", "Declercq"],
  streets: ["Naamsesteenweg", "Tiensevest", "Diestsesteenweg", "Tervuursesteenweg", "Geldenaaksebaan", "Kapucijnenvoer", "Ridderstraat", "Brusselsestraat", "Parkstraat", "Molenstraat", "Blandenstraat"],
  zones: ["Heverlee", "Kessel-Lo", "Wilsele", "Herent", "Leuven", "Wijgmaal", "Haasrode", "Bertem"],
  nicknames: ["Jules", "Noor", "Milo", "Tess", "Lina", "Bram", "Nina", "Otis", "Fien", "Wout", "Lotte", "Ibe", "Mats", "Rosa", "Yara", "Lio", "Cis", "Mona", "Sem", "Bo"]
};

function normalizeNickname(value){
  return String(value || "").trim().toLowerCase();
}

function findCustomerByNickname(st, nickname, excludeId = null){
  const key = normalizeNickname(nickname);
  if (!key) return null;
  return (st.customers || []).find(c => c.id !== excludeId && normalizeNickname(c.nickname) === key) || null;
}

function ensureUniqueCustomerNicknames(st){
  const used = new Set();
  for (const customer of (st.customers || [])){
    const original = String(customer.nickname || "").trim();
    if (!original) continue;

    const base = original;
    let candidate = base;
    let n = 2;
    while (used.has(normalizeNickname(candidate))){
      candidate = `${base} ${n}`;
      n += 1;
    }
    customer.nickname = candidate;
    used.add(normalizeNickname(candidate));
  }
}

function ri(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function rf(min, max){ return Math.random() * (max - min) + min; }
function pick(arr){ return arr[ri(0, arr.length - 1)]; }
function demoDateISO(daysBack){
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0,10);
}

function ensureStateSafetyAfterMutations(st){
  const logIds = new Set(st.logs.map(l => l.id));
  for (const s of st.settlements){
    s.logIds = (s.logIds||[]).filter(id => logIds.has(id));
  }
  if (st.activeLogId && !logIds.has(st.activeLogId)) st.activeLogId = null;
  const active = currentView();
  if (active.view === "logDetail" && !logIds.has(active.id)) popView();
  if (active.view === "customerDetail" && !st.customers.some(c => c.id === active.id)) popView();
  if (active.view === "productDetail" && !st.products.some(p => p.id === active.id)) popView();
  if (active.view === "settlementDetail" && !st.settlements.some(x => x.id === active.id)) popView();
}

function settlementTotals(settlement){
  return getSettlementTotals(settlement);
}

// ---------- Demo seeding (deterministic, period-based, realistic chronology) ----------
function createSeededRandom(seed = "demo-v2"){
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++){
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const t = (h ^= h >>> 16) >>> 0;
    return t / 4294967296;
  };
}

function seedDemoPeriod(st, { months = 24, force = false, seed = "demo-v2" } = {}){
  const hasDemo = (st.customers||[]).some(c => c.demo) || (st.logs||[]).some(l => l.demo) || (st.settlements||[]).some(s => s.demo);
  if (!force && hasDemo) return false;

  ensureCoreProducts(st);
  ensureDemoProducts(st);
  const workProduct = st.products.find(p => (p.name||"").trim().toLowerCase() === "werk");
  const greenProduct = st.products.find(p => (p.name||"").trim().toLowerCase() === "groen");
  if (!workProduct || !greenProduct) return false;

  const rnd = createSeededRandom(`${seed}|${months}`);
  const sri = (min, max)=> Math.floor(rnd() * (max - min + 1)) + min;
  const srf = (min, max)=> rnd() * (max - min) + min;
  const spick = (arr)=> arr[sri(0, arr.length - 1)];
  const chance = (p)=> rnd() < p;

  const formatISO = (d)=> `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const startOfDay = (d)=> { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const addDays = (d, n)=> { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monthDiff = (a, b)=> (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

  const DEMO_NOTES = [
    "Haag gesnoeid voor- en achterkant",
    "Gazon gemaaid en borders bijgewerkt",
    "Onkruid gewied moestuin",
    "Snoeiafval afgevoerd",
    "Conifeer teruggesnoeid",
    "Rozen gesnoeid en bemest",
    "Oprit onkruidvrij gemaakt",
    "Nieuwe border aangelegd",
    "Bladeren geruimd",
    "Terras schoongemaakt en onkruid verwijderd",
    "Fruitbomen gesnoeid",
    "Herfstonderhoud",
    "Lenteschoonmaak",
    "Taxus in vorm gesnoeid"
  ];

  const rhythmList = ["direct","direct","direct","monthly","monthly","monthly","monthly","monthly","monthly","monthly","quarterly","quarterly","quarterly","quarterly","quarterly"];
  const shuffledRhythms = rhythmList.slice();
  for (let i = shuffledRhythms.length - 1; i > 0; i--){
    const j = sri(0, i);
    [shuffledRhythms[i], shuffledRhythms[j]] = [shuffledRhythms[j], shuffledRhythms[i]];
  }

  const usedNames = new Set();
  const nicknames = DEMO.nicknames.slice();
  for (let i = nicknames.length - 1; i > 0; i--){
    const j = sri(0, i);
    [nicknames[i], nicknames[j]] = [nicknames[j], nicknames[i]];
  }

  const nowDate = startOfDay(new Date());
  const endDate = new Date(nowDate);
  const startDate = startOfDay(new Date(nowDate));
  startDate.setMonth(startDate.getMonth() - months);
  const mondayOffset = (startDate.getDay() + 6) % 7;
  startDate.setDate(startDate.getDate() - mondayOffset);

  const customers = [];
  for (let i = 0; i < 15; i++){
    let fn, ln, key;
    do {
      fn = spick(DEMO.firstNames);
      ln = spick(DEMO.lastNames);
      key = `${fn}|${ln}`;
    } while (usedNames.has(key));
    usedNames.add(key);

    const createdAtDate = addDays(startDate, sri(0, Math.max(1, Math.floor((endDate - startDate) / 86400000))));
    customers.push({
      id: uid(),
      nickname: nicknames[i] || `${fn} ${ln}`,
      name: `${fn} ${ln}`,
      address: `${spick(DEMO.streets)} ${sri(1, 180)}, ${spick(DEMO.zones)}, Leuven`,
      createdAt: createdAtDate.getTime(),
      demo: true,
      frequent: i < 10,
      settlementRhythm: shuffledRhythms[i]
    });
  }

  const frequentCustomers = customers.filter(c => c.frequent);
  const rareCustomers = customers.filter(c => !c.frequent);
  const otherProducts = (st.products || []).filter(p => p.id !== workProduct.id && p.id !== greenProduct.id);

  const logs = [];
  const usedCustomerDate = new Set();

  function seasonDayBias(month){
    if ([11,0,1].includes(month)) return 0.48;
    if ([2,3,4].includes(month)) return 0.74;
    if ([5,6,7].includes(month)) return 0.82;
    return 0.68;
  }

  function createLog(customer, dayDate, slotIndex){
    const dateISO = formatISO(dayDate);
    const key = `${customer.id}-${dateISO}`;
    if (usedCustomerDate.has(key)) return null;
    usedCustomerDate.add(key);

    const isEvening = chance(slotIndex === 0 ? 0.04 : 0.09);
    const startHour = isEvening ? sri(17, 19) : (chance(0.78) ? sri(7, 9) : sri(8, 10));
    const startMinuteChoices = isEvening ? [0, 15, 30] : [0, 15, 30, 45];
    const startMinute = spick(startMinuteChoices);
    const startMs = new Date(`${dateISO}T${pad2(startHour)}:${pad2(startMinute)}:00`).getTime();

    const firstWorkMin = isEvening ? sri(60, 130) : sri(85, 230);
    const withBreak = !isEvening && chance(0.46);
    const breakMin = withBreak ? sri(15, 45) : 0;
    const secondWorkMin = isEvening ? 0 : (chance(0.62) ? sri(55, 190) : 0);

    const firstEnd = startMs + firstWorkMin * 60000;
    const breakEnd = firstEnd + breakMin * 60000;
    const finalEnd = breakEnd + secondWorkMin * 60000;

    const segments = [{ id: uid(), type: "work", start: startMs, end: firstEnd }];
    if (breakMin > 0) segments.push({ id: uid(), type: "break", start: firstEnd, end: breakEnd });
    if (secondWorkMin > 0) segments.push({ id: uid(), type: "work", start: breakEnd, end: finalEnd });

    const greenQty = round2(sri(0, 6) / 2);
    const items = [
      { id: uid(), productId: greenProduct.id, qty: greenQty, unitPrice: 38, note: "" }
    ];

    const smallExtras = otherProducts.filter(p => (Number(p.unitPrice || p.price) || 0) <= 20);
    const bigExtras = otherProducts.filter(p => (Number(p.unitPrice || p.price) || 0) > 20);
    const pool = chance(0.8) ? smallExtras : bigExtras;
    const extraChance = pool === smallExtras ? 0.02 : 0.005;
    if (pool.length && chance(extraChance)){
      const extra = spick(pool);
      items.push({
        id: uid(),
        productId: extra.id,
        qty: round2(Math.max(1, srf(1, 3))),
        unitPrice: Number(extra.price || extra.unitPrice || 25) || 25,
        note: chance(0.4) ? "Aanvullend materiaal" : ""
      });
    }

    return {
      id: uid(),
      customerId: customer.id,
      date: dateISO,
      createdAt: startMs,
      closedAt: finalEnd,
      note: chance(0.32) ? spick(DEMO_NOTES) : "",
      segments,
      items,
      demo: true
    };
  }

  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)){
    if (cursor > endDate) break;
    const dow = cursor.getDay();
    const month = cursor.getMonth();
    if (dow === 0) continue;
    if (dow === 6 && !chance(0.06)) continue;

    const span = Math.max(1, monthDiff(startDate, endDate));
    const progress = monthDiff(startDate, cursor) / span;
    const dayChance = Math.min(0.9, seasonDayBias(month) + (progress * 0.08));
    if (!chance(dayChance)) continue;

    const maxCustomers = chance(0.1) ? 3 : (chance(0.45) ? 2 : 1);
    const selected = [];
    while (selected.length < maxCustomers){
      const pool = chance(0.77) ? frequentCustomers : rareCustomers;
      if (!pool.length) break;
      const customer = spick(pool);
      if (!selected.some(c => c.id === customer.id)) selected.push(customer);
      if (selected.length >= customers.length) break;
    }

    selected.forEach((customer, idx)=>{
      const log = createLog(customer, cursor, idx);
      if (!log) return;
      if (new Date(log.date) > endDate) return;
      logs.push(log);
    });
  }

  logs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const logsByCustomer = new Map();
  for (const log of logs){
    if (!logsByCustomer.has(log.customerId)) logsByCustomer.set(log.customerId, []);
    logsByCustomer.get(log.customerId).push(log);
  }

  function makeLinesFromLogs(logsArr){
    const summary = { workQty: 0, greenQty: 0 };
    for (const log of logsArr){
      summary.workQty += sumWorkMs(log) / 3600000;
      for (const it of (log.items || [])){
        if (it.productId === greenProduct.id) summary.greenQty += Number(it.qty) || 0;
      }
    }
    summary.workQty = round2(summary.workQty);
    summary.greenQty = round2(summary.greenQty);

    const modeRoll = rnd();
    const mode = modeRoll < 0.38 ? "invoice" : (modeRoll < 0.72 ? "cash" : "mixed");
    const lines = [];
    const addLine = ({ bucket, productId, description, unit, qty, unitPrice, vatRate })=>{
      const quantity = round2(Number(qty) || 0);
      if (quantity <= 0) return;
      lines.push({ id: uid(), bucket, productId, description, unit, qty: quantity, unitPrice, vatRate });
    };

    if (mode === "invoice"){
      addLine({ bucket: "invoice", productId: workProduct.id, description: "Werk", unit: "uur", qty: summary.workQty, unitPrice: 38, vatRate: 0.21 });
      addLine({ bucket: "invoice", productId: greenProduct.id, description: "Groen", unit: "keer", qty: summary.greenQty, unitPrice: 38, vatRate: 0.21 });
    } else if (mode === "cash"){
      addLine({ bucket: "cash", productId: workProduct.id, description: "Werk", unit: "uur", qty: summary.workQty, unitPrice: 38, vatRate: 0 });
      addLine({ bucket: "cash", productId: greenProduct.id, description: "Groen", unit: "keer", qty: summary.greenQty, unitPrice: 38, vatRate: 0 });
    } else {
      const invoiceWorkQty = round2(Math.max(0.5, summary.workQty * srf(0.45, 0.78)));
      const cashWorkQty = round2(Math.max(0, summary.workQty - invoiceWorkQty));
      const invoiceGreenQty = round2(Math.max(0, summary.greenQty * srf(0.3, 0.7)));
      const cashGreenQty = round2(Math.max(0, summary.greenQty - invoiceGreenQty));
      addLine({ bucket: "invoice", productId: workProduct.id, description: "Werk", unit: "uur", qty: invoiceWorkQty, unitPrice: 38, vatRate: 0.21 });
      addLine({ bucket: "cash", productId: workProduct.id, description: "Werk", unit: "uur", qty: cashWorkQty, unitPrice: 38, vatRate: 0 });
      addLine({ bucket: "invoice", productId: greenProduct.id, description: "Groen", unit: "keer", qty: invoiceGreenQty, unitPrice: 38, vatRate: 0.21 });
      addLine({ bucket: "cash", productId: greenProduct.id, description: "Groen", unit: "keer", qty: cashGreenQty, unitPrice: 38, vatRate: 0 });
    }
    return lines;
  }

  const dateWithBusinessTime = (isoDate)=>{
    const hour = sri(9, 16);
    const minOptions = [10, 20, 30, 40];
    return new Date(`${isoDate}T${pad2(hour)}:${pad2(spick(minOptions))}:00`).getTime();
  };

  const nextMonthInvoiceDate = (lastLogDate)=>{
    const d = new Date(`${lastLogDate}T00:00:00`);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const day = sri(1, 7);
    return formatISO(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day));
  };

  const nextQuarterInvoiceDate = (lastLogDate)=>{
    const d = new Date(`${lastLogDate}T00:00:00`);
    const nextQuarterMonth = Math.floor(d.getMonth() / 3) * 3 + 3;
    const q = new Date(d.getFullYear(), nextQuarterMonth, 1);
    return formatISO(new Date(q.getFullYear(), q.getMonth(), sri(1, 10)));
  };

  const settlements = [];

  function buildSettlement(customer, groupedLogs){
    if (!groupedLogs.length) return null;
    const sortedLogs = groupedLogs.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const lastLog = sortedLogs[sortedLogs.length - 1];
    let invoiceDate = lastLog.date;

    if (customer.settlementRhythm === "direct"){
      invoiceDate = formatISO(addDays(new Date(`${lastLog.date}T00:00:00`), sri(0, 3)));
    } else if (customer.settlementRhythm === "monthly"){
      invoiceDate = nextMonthInvoiceDate(lastLog.date);
    } else {
      invoiceDate = nextQuarterInvoiceDate(lastLog.date);
    }
    const today = todayISO();
    if (invoiceDate > today) invoiceDate = today;
    if (invoiceDate < lastLog.date) invoiceDate = lastLog.date;

    const createdAt = dateWithBusinessTime(invoiceDate);
    const lines = makeLinesFromLogs(sortedLogs);
    if (!lines.length) return null;

    const ageDays = (endDate.getTime() - createdAt) / 86400000;
    let status = "draft";
    if (ageDays > 60) status = chance(0.97) ? "calculated" : "draft";
    else if (ageDays > 21) status = chance(0.85) ? "calculated" : "draft";
    else status = chance(0.35) ? "calculated" : "draft";

    const settlement = {
      id: uid(),
      customerId: customer.id,
      date: invoiceDate,
      invoiceDate,
      createdAt,
      logIds: sortedLogs.map(l => l.id),
      lines,
      status,
      invoicePaid: false,
      cashPaid: false,
      invoiceNumber: null,
      demo: true
    };

    const totals = settlementTotals(settlement);
    if (status !== "draft"){
      const payChance = ageDays > 120 ? 0.98 : (ageDays > 45 ? 0.93 : 0.75);
      settlement.invoicePaid = totals.invoiceTotal > 0 ? chance(payChance) : false;
      settlement.cashPaid = totals.cashTotal > 0 ? chance(payChance) : false;
    }
    return settlement;
  }

  for (const customer of customers){
    const customerLogs = (logsByCustomer.get(customer.id) || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!customerLogs.length) continue;

    if (customer.settlementRhythm === "direct"){
      for (const log of customerLogs){
        const settlement = buildSettlement(customer, [log]);
        if (settlement) settlements.push(settlement);
      }
      continue;
    }

    const groups = new Map();
    for (const log of customerLogs){
      const d = new Date(`${log.date}T00:00:00`);
      const key = customer.settlementRhythm === "monthly"
        ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
        : `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(log);
    }

    for (const groupedLogs of groups.values()){
      const settlement = buildSettlement(customer, groupedLogs);
      if (settlement) settlements.push(settlement);
    }
  }

  const todayIso = todayISO();
  const draftSettlements = settlements
    .filter(s => s.status === "draft")
    .sort((a, b) => String(b.invoiceDate || "").localeCompare(String(a.invoiceDate || "")));
  for (const settlement of draftSettlements.slice(6)){
    if (String(settlement.invoiceDate || "") > todayIso) continue;
    settlement.status = "calculated";
  }

  const demoCalculated = settlements.filter(s => s.status !== "draft");
  demoCalculated.sort((a, b)=>{
    const byDate = String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || ""));
    if (byDate !== 0) return byDate;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  let nextInvoice = (st.settlements || []).reduce((max, settlement)=>{
    if (!isSettlementCalculated(settlement)) return max;
    const digits = String(settlement.invoiceNumber || "").match(/(\d+)/g) || [];
    const value = Number(digits.join(""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  for (const settlement of demoCalculated){
    settlement.status = "calculated";
    settlement.isCalculated = true;
    settlement.markedCalculated = true;
    settlement.invoiceLocked = true;
    settlement.invoiceNumber = settlementHasInvoiceComponent(settlement) ? `F${++nextInvoice}` : null;
    settlement.calculatedAt = settlement.createdAt;
  }

  for (const settlement of settlements){
    if (settlement.status === "draft"){
      settlement.invoicePaid = false;
      settlement.cashPaid = false;
      settlement.invoiceNumber = null;
      settlement.invoiceLocked = false;
      settlement.isCalculated = false;
      settlement.markedCalculated = false;
      settlement.calculatedAt = null;
    }
  }

  const cleanCustomers = customers.map(({ frequent, settlementRhythm, ...rest }) => rest);
  st.customers = [...cleanCustomers, ...(st.customers || [])];
  st.logs = [...logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), ...(st.logs || [])];
  st.settlements = [...settlements.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), ...(st.settlements || [])];
  ensureStateSafetyAfterMutations(st);
  return true;
}

function seedDemoMonths(st, { months = 24, force = false, seed = "demo-v2" } = {}){
  return seedDemoPeriod(st, { months, force, seed });
}

function clearDemoData(st){
  const removedLogIds = new Set((st.logs||[]).filter(l => l.demo).map(l => l.id));
  st.customers = (st.customers||[]).filter(c => !c.demo);
  st.products = (st.products||[]).filter(p => !p.demo);
  st.logs = (st.logs||[]).filter(l => !l.demo);
  st.settlements = (st.settlements||[])
    .filter(s => !s.demo)
    .map(s => ({ ...s, logIds: (s.logIds||[]).filter(id => !removedLogIds.has(id)) }));
  ensureStateSafetyAfterMutations(st);
}

let state = loadState();

// ---------- Computations ----------
function sumWorkMs(log){
  let t=0;
  for (const s of (log.segments||[])){
    if (s.type !== "work") continue;
    const end = s.end ?? now();
    t += Math.max(0, end - s.start);
  }
  return t;
}
function customerMinutesLastYear(){
  const totals = new Map();
  const yearAgoMs = now() - 365 * 86400000;

  for (const log of (state.logs || [])){
    if (!log?.customerId) continue;
    const startedAt = Number(log.createdAt || 0);
    if (startedAt < yearAgoMs) continue;
    const minutes = Math.floor(sumWorkMs(log) / 60000);
    totals.set(log.customerId, (totals.get(log.customerId) || 0) + minutes);
  }

  return totals;
}
function sumBreakMs(log){
  let t=0;
  for (const s of (log.segments||[])){
    if (s.type !== "break") continue;
    const end = s.end ?? now();
    t += Math.max(0, end - s.start);
  }
  return t;
}
function sumItemsAmount(log){
  return round2((log.items||[]).reduce((acc,it)=> acc + (Number(it.qty)||0)*(Number(it.unitPrice)||0), 0));
}
function getStartTime(log){
  const firstWorkSegment = (log.segments || [])
    .filter(segment => segment?.type === "work" && Number.isFinite(segment.start))
    .sort((a, b) => a.start - b.start)[0];
  const startMs = firstWorkSegment?.start ?? log.startAt ?? log.startedAt ?? null;
  return Number.isFinite(startMs) ? fmtClock(startMs) : "—";
}
function getTotalWorkDuration(log){
  const totalWorkMinutes = Math.floor(sumWorkMs(log) / 60000);
  const compact = formatDurationCompact(totalWorkMinutes);
  return compact.endsWith("m") ? compact.slice(0, -1) : compact;
}
function countExtraProducts(log){
  return (log.items || []).reduce((count, item) => {
    return isOtherProduct(item) ? count + 1 : count;
  }, 0);
}
function isWorkProduct(productOrItem){
  const product = productOrItem?.productId ? getProduct(productOrItem.productId) : productOrItem;
  if (!product) return false;
  return isWorkProductId(product.id) || (product.unit || "").trim().toLowerCase() === "uur";
}
function isWorkProductId(productId){
  const product = getProduct(productId);
  if (!product) return false;
  const name = (product.name || "").trim().toLowerCase();
  return ["werk", "werk (uur)", "arbeid"].includes(name);
}
function findGreenProduct(){
  const aliases = ["groen", "snoeiafval"];
  return state.products.find(product => aliases.includes((product.name || "").trim().toLowerCase())) || null;
}
function isGreenProduct(productOrItem){
  const product = productOrItem?.productId ? getProduct(productOrItem.productId) : productOrItem;
  if (!product) return false;
  const name = (product.name || "").trim().toLowerCase();
  return ["groen", "snoeiafval"].includes(name);
}
function isOtherProduct(productOrItem){
  return !isWorkProduct(productOrItem) && !isGreenProduct(productOrItem);
}
function splitLogItems(log){
  const greenProduct = findGreenProduct();
  const items = log?.items || [];
  const greenItem = items.find(item => greenProduct && item.productId === greenProduct.id) || items.find(item => isGreenProduct(item));
  const greenItemQty = round2(Number(greenItem?.qty) || 0);
  const otherItems = items.filter(item => !isGreenProduct(item) && !isWorkProductId(item.productId));
  return { greenItemQty, otherItems };
}
function bindStepButton(btn, onTap, onHold){
  let pressTimer = null;
  let didLongPress = false;
  let isPressing = false;

  const clearPress = ()=>{
    if (pressTimer){
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    isPressing = false;
  };

  const down = (e)=>{
    if (isPressing) return;
    isPressing = true;
    didLongPress = false;
    e.preventDefault();
    e.stopPropagation();
    pressTimer = setTimeout(()=>{
      if (!isPressing) return;
      didLongPress = true;
      onHold();
    }, 450);
  };

  const up = (e)=>{
    e.preventDefault();
    e.stopPropagation();
    if (!isPressing) return;
    const wasLongPress = didLongPress;
    clearPress();
    if (!wasLongPress) onTap();
  };

  btn.classList.add("no-select");
  btn.addEventListener("contextmenu", (e)=>{
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);

  btn.addEventListener("touchstart", down, { passive:false });
  btn.addEventListener("touchend", up, { passive:false });
  btn.addEventListener("touchcancel", up, { passive:false });
  btn.addEventListener("touchmove", (e)=>{
    if (!isPressing) return;
    e.preventDefault();
    e.stopPropagation();
  }, { passive:false });

  btn.addEventListener("click", (e)=>{
    if (!didLongPress) return;
    didLongPress = false;
    e.preventDefault();
    e.stopPropagation();
  });
}
function adjustLogGreenQty(logId, delta){
  actions.editLog(logId, (draft)=>{
    draft.items = draft.items || [];
    const greenProduct = findGreenProduct();
    if (!greenProduct) return;
    let target = draft.items.find(item => item.productId === greenProduct.id) || draft.items.find(item => isGreenProduct(item));
    if (!target){
      target = { id: uid(), productId: greenProduct.id, qty: 0, unitPrice: 0, note: "" };
      draft.items.push(target);
    }
    const nextQty = Math.max(0, round2((Number(target.qty) || 0) + delta));
    if (nextQty <= 0){
      draft.items = draft.items.filter(item => item.id !== target.id);
      return;
    }
    target.qty = nextQty;
    target.unitPrice = 0;
  });
}
function findSettlementQuickLine(lines, bucket, kind){
  const bucketLines = (lines || []).filter(line => (line.bucket || "invoice") === bucket);
  const normalizedKind = kind === "green" ? "groen" : "werk";
  const product = (state.products || []).find(p => (p.name || "").trim().toLowerCase() === normalizedKind) || null;

  if (product){
    const byProductId = bucketLines.find(line => line.productId === product.id);
    if (byProductId) return byProductId;
  }

  return bucketLines.find(line => {
    const label = String(line.name || line.description || pname(line.productId) || "").trim().toLowerCase();
    return label === normalizedKind;
  }) || null;
}
function formatQuickQty(value){
  const rounded = round2(Number(value) || 0);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
function adjustSettlementQuickQty(settlementId, bucket, kind, delta){
  actions.editSettlement(settlementId, (draft)=>{
    draft.lines = draft.lines || [];
    ensureDefaultSettlementLines(draft);
    const line = findSettlementQuickLine(draft.lines, bucket, kind);
    if (!line) return;
    const oppositeBucket = bucket === "cash" ? "invoice" : "cash";
    const oppositeLine = findSettlementQuickLine(draft.lines, oppositeBucket, kind);

    const computed = computeSettlementFromLogsInState(state, draft.customerId, draft.logIds || []);
    const isKind = (item)=> kind === "work" ? isWorkProduct(item) : isGreenProduct(item);
    const computedTotalQty = round2((computed.lines || [])
      .filter(isKind)
      .reduce((total, item)=> total + (Number(item.qty) || 0), 0));
    const fallbackCurrentTotal = round2((Number(line.qty) || 0) + (Number(oppositeLine?.qty) || 0));
    const totalQty = computedTotalQty > 0 ? computedTotalQty : fallbackCurrentTotal;

    const rawNextQty = round2((Number(line.qty) || 0) + Number(delta || 0));
    const nextQty = Math.max(0, Math.min(totalQty, rawNextQty));
    line.qty = nextQty;
    if (oppositeLine) oppositeLine.qty = round2(Math.max(0, totalQty - nextQty));
  });
}
function countGreenItems(log){
  return round2((log.items || []).reduce((total, item)=>{
    if (!isGreenProduct(item)) return total;
    return total + (Number(item.qty) || 0);
  }, 0));
}
function getCustomer(id){ return state.customers.find(c => c.id === id) || null; }
function cname(id){ const c=getCustomer(id); return c ? (c.nickname || c.name || "Klant") : "Klant"; }
function getProduct(id){ return state.products.find(p => p.id === id) || null; }
function pname(id){ const p=getProduct(id); return p ? p.name : "Product"; }

function currentOpenSegment(log){
  return (log.segments||[]).find(s => s.end == null) || null;
}
function closeOpenSegment(log){
  const seg = currentOpenSegment(log);
  if (seg) seg.end = now();
}
function openSegment(log, type){
  log.segments = log.segments || [];
  log.segments.push({ id: uid(), type, start: now(), end: null });
}

// ---------- Status helpers ----------
function statusClassFromStatus(s){
  if (s === "linked" || s === "draft") return "status-linked";
  if (s === "calculated") return "status-calculated";
  if (s === "paid") return "status-paid";
  return "";
}
function getLogVisualState(log){
  const state = logStatus(log.id);
  if (state === "paid") return { state: "paid", color: "#00a05a" };
  if (state === "calculated") return { state: "calculated", color: "#ff8c00" };
  if (state === "linked") return { state: "linked", color: "#ffcc00" };
  return { state: "free", color: "#93a0b5" };
}
function getSettlementTotals(settlement){
  // Nieuw pad: gebruik allocations als bron van waarheid
  if (settlement && settlement.allocations){
    return getTotalsFromAllocations(settlement);
  }
  // Legacy pad: lees uit lines
  const invoiceTotals = bucketTotals(settlement?.lines, "invoice");
  const cashTotals = bucketTotals(settlement?.lines, "cash");
  return {
    invoiceSubtotal: invoiceTotals.subtotal,
    invoiceVat: invoiceTotals.vat,
    invoiceTotal: invoiceTotals.total,
    cashSubtotal: cashTotals.subtotal,
    cashTotal: cashTotals.subtotal
  };
}

function settlementHasInvoiceComponent(settlement, totals = getSettlementTotals(settlement || {})){
  return (
    Number(settlement?.invoiceAmount ?? 0) > 0 ||
    Number(totals?.invoiceTotal ?? 0) > 0 ||
    Number(settlement?.cardAmount ?? 0) > 0
  );
}

function getNextInvoiceNumber(settlements = state.settlements || []){
  const highest = (settlements || []).reduce((max, settlement)=>{
    if (!isSettlementCalculated(settlement)) return max;
    const digits = String(settlement?.invoiceNumber || "").match(/(\d+)/g) || [];
    const value = Number(digits.join(""));
    if (!Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);
  return `F${highest + 1}`;
}

function latestLinkedLogDate(settlement, sourceState = state){
  const linkedDates = (settlement?.logIds || [])
    .map(id => sourceState.logs.find(l => l.id === id)?.date)
    .filter(Boolean)
    .sort();
  return linkedDates[linkedDates.length - 1] || "";
}

function syncSettlementDatesFromLogs(settlement, sourceState = state){
  if (!settlement) return;
  const fallbackDate = todayISO();

  const manual = String(settlement.dateOverride || "").trim();
  if (manual){
    settlement.date = manual;
    if (!settlement.invoiceLocked) settlement.invoiceDate = manual;
    if (!settlement.invoiceDate) settlement.invoiceDate = manual;
    return;
  }

  const maxLogDate = latestLinkedLogDate(settlement, sourceState);
  if (maxLogDate){
    settlement.date = maxLogDate;
    if (!settlement.invoiceLocked) settlement.invoiceDate = maxLogDate;
  } else if (!settlement.date){
    settlement.date = fallbackDate;
  }

  if (!settlement.invoiceDate){
    settlement.invoiceDate = settlement.date || fallbackDate;
  }
  settlement.invoiceDate = settlement.date || fallbackDate;
}

function ensureSettlementInvoiceDefaults(settlement){
  if (!settlement) return;

  const totals = getSettlementTotals(settlement);
  const invoiceTotal = Number(totals?.invoiceTotal || 0);
  if (invoiceTotal <= 0){
    settlement.invoiceNumber = null;
  }

  if (!settlement.invoiceDate){
    settlement.invoiceDate = settlement.date || todayISO();
  }
}

function lockInvoice(settlement){
  if (!settlement) return;
  settlement.invoiceLocked = true;
}
function isSettlementCalculated(settlement){
  return Boolean(
    settlement?.isCalculated ||
    settlement?.markedCalculated ||
    settlement?.status === "calculated" ||
    settlement?.status === "paid" ||
    settlement?.calculatedAt
  );
}
function getSettlementAmounts(settlement){
  const totals = getSettlementTotals(settlement || {});
  return {
    invoice: Number(settlement?.invoiceAmount ?? totals.invoiceTotal ?? 0),
    cash: Number(settlement?.cashAmount ?? totals.cashTotal ?? 0)
  };
}
function getSettlementPaymentFlags(settlement){
  return {
    invoicePaid: Boolean(settlement?.invoicePaid),
    cashPaid: Boolean(settlement?.cashPaid)
  };
}
function getSettlementIconPresentation(settlement){
  const calculated = isSettlementCalculated(settlement);
  const amounts = getSettlementAmounts(settlement);
  const flags = getSettlementPaymentFlags(settlement);

  const icons = [
    {
      type: "invoice",
      show: calculated && amounts.invoice > 0,
      color: flags.invoicePaid ? "green" : "orange"
    },
    {
      type: "cash",
      show: calculated && amounts.cash > 0,
      color: flags.cashPaid ? "green" : "orange"
    }
  ];

  /*
    Sanity examples:
    - not calculated -> [] (no icons shown because both show=false)
    - calculated + invoice>0 + cash=0 -> [invoice icon]
    - calculated + invoice>0 + cash>0 -> [invoice + cash]
    - paid=true -> green, paid=false -> orange
  */
  return icons;
}
function getLogPresentation(log, sourceState){
  const settlement = (sourceState?.settlements || []).find(s => (s.logIds || []).includes(log?.id));
  if (!settlement) return { state: "free" };

  const icons = getSettlementIconPresentation(settlement);
  const visibleIcons = icons.filter(icon => icon.show);
  const allVisiblePaid = visibleIcons.length > 0 && visibleIcons.every(icon => icon.color === "green");

  if (allVisiblePaid) return { state: "paid", settlement };
  if (isSettlementCalculated(settlement)) return { state: "calculated", settlement };
  return { state: "linked", settlement };
}
function getSettlementVisualState(settlement){
  if (!settlement) return { state: "open", accentClass: "card-accent--open", navClass: "nav--linked" };
  const iconPresentation = getSettlementIconPresentation(settlement);
  const visibleIcons = iconPresentation.filter(icon => icon.show);
  const isPaid = visibleIcons.length > 0 && visibleIcons.every(icon => icon.color === "green");
  if (isPaid){
    return { state: "paid", accentClass: "card-accent--paid", navClass: "nav--paid" };
  }
  if (isSettlementCalculated(settlement)){
    return { state: "calculated", accentClass: "card-accent--calculated", navClass: "nav--calculated" };
  }
  return { state: "draft", accentClass: "card-accent--open", navClass: "nav--linked" };
}
function isSettlementPaid(settlement){
  return getSettlementVisualState(settlement).state === "paid";
}
function settlementColorClass(settlement){
  return getSettlementVisualState(settlement).accentClass;
}
function settlementForLog(logId){
  return state.settlements.find(a => (a.logIds||[]).includes(logId)) || null;
}
function getLinkedAfrekeningIdForLog(log){
  if (!log) return null;

  const directIds = [log.afrekeningId, log.settlementId, log.linkedAfrekeningId]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const inferredIds = (state.settlements || [])
    .filter(settlement => (settlement.logIds || []).includes(log.id))
    .map(settlement => settlement.id)
    .filter(Boolean);

  const linkedIds = [...new Set([...directIds, ...inferredIds])];
  if (!linkedIds.length) return null;
  if (linkedIds.length > 1){
    console.warn("Multiple linked afrekeningen found for log; using first", {
      logId: log.id,
      afrekeningIds: linkedIds
    });
  }
  return linkedIds[0] || null;
}
function getAfrekeningById(id){
  if (!id) return null;
  return (state.settlements || []).find(settlement => settlement.id === id) || null;
}
function settlementVisualState(settlement){
  const visual = getSettlementVisualState(settlement);
  if (visual.state === "paid") return "paid";
  if (visual.state === "calculated") return "calculated";
  return "linked";
}
function logStatus(logId){
  const log = state.logs.find(item => item.id === logId);
  return getLogPresentation(log, state).state;
}
function isLogLinkedElsewhere(logId, currentSettlementId){
  return state.settlements.some(s =>
    s.id !== currentSettlementId &&
    (s.logIds || []).includes(logId)
  );
}
function getWorkLogStatus(logId){
  return logStatus(logId);
}
function renderLogCard(log){
  const st = getWorkLogStatus(log.id);
  const cls = statusClassFromStatus(st);
  const startTime = getStartTime(log);
  const workDuration = getTotalWorkDuration(log);
  const totalWorkLabel = durMsToHM(sumWorkMs(log));
  const extraProducts = countExtraProducts(log);
  const extraLabel = extraProducts > 0 ? `<span>+${extraProducts}</span>` : "";

  return `
    <div class="item ${cls}" data-open-log="${log.id}">
      <div class="item-main">
        <div class="item-title">${esc(cname(log.customerId))}</div>
        <div class="meta-text" style="margin-top:2px;">
          <span>${esc(formatLogDatePretty(log.date))}</span> · <span>Start ${esc(startTime)}</span> · <span>${esc(workDuration)}</span>${extraLabel ? ` · ${extraLabel}` : ""}
        </div>
      </div>
      <div class="amount-prominent">${esc(totalWorkLabel)}</div>
    </div>
  `;
}

function statusLabelNL(s){
  if (s === "draft") return "draft";
  if (s === "calculated") return "berekend";
  if (s === "paid") return "betaald";
  return s || "";
}

// ---------- Lines & totals ----------
function lineAmount(line){ return round2((Number(line.qty)||0) * (Number(line.unitPrice)||0)); }
function lineVat(line){
  const r = Number(line.vatRate ?? state.settings.vatRate ?? 0.21);
  const bucket = line.bucket || "invoice";
  if (bucket === "cash") return 0;
  return round2(lineAmount(line) * r);
}
function bucketTotals(lines, bucket){
  const arr = (lines||[]).filter(l => (l.bucket||"invoice") === bucket);
  const subtotal = round2(arr.reduce((a,l)=> a + lineAmount(l), 0));
  const vat = round2(arr.reduce((a,l)=> a + lineVat(l), 0));
  const total = round2(subtotal + vat);
  return { subtotal, vat, total };
}

function settlementPaymentState(settlement){
  const invoiceTotals = bucketTotals(settlement.lines, "invoice");
  const cashTotals = bucketTotals(settlement.lines, "cash");
  const { invoiceTotal, cashTotal } = getSettlementTotals(settlement);
  const hasInvoice = settlementHasInvoiceComponent(settlement, { invoiceTotal, cashTotal });
  const hasCash = cashTotal > 0;
  const isPaid = getSettlementVisualState(settlement).state === "paid";
  return { invoiceTotals, cashTotals, invoiceTotal, cashTotal, hasInvoice, hasCash, isPaid };
}

function syncSettlementStatus(settlement){
  if (!settlement) return;
  settlement.isCalculated = isSettlementCalculated(settlement);
  const iconPresentation = getSettlementIconPresentation(settlement).filter(icon => icon.show);
  const isPaid = iconPresentation.length > 0 && iconPresentation.every(icon => icon.color === "green");
  if (isPaid && settlement.isCalculated){
    settlement.status = "paid";
  } else {
    settlement.status = settlement.isCalculated ? "calculated" : "draft";
  }
  syncSettlementAmounts(settlement);
}

function computeSettlementFromLogsInState(sourceState, customerId, logIds){
  let workMs = 0;
  const itemMap = new Map(); // productId -> {qty, unitPrice}
  for (const id of logIds){
    const log = sourceState.logs.find(l => l.id === id);
    if (!log) continue;
    workMs += sumWorkMs(log);
    for (const it of (log.items||[])){
      const key = it.productId || "free";
      const raw = Number(it.unitPrice) || 0;
      const prod = key === "free" ? null : sourceState.products.find(p => p.id === key);
      const fallback = Number(prod?.unitPrice) || 0;
      const effective = raw > 0 ? raw : (fallback > 0 ? fallback : 0);
      if (!itemMap.has(key)) itemMap.set(key, { qty:0, unitPrice: effective });
      const cur = itemMap.get(key);
      cur.qty += Number(it.qty)||0;
      if (raw > 0) cur.unitPrice = raw;
      else if ((Number(cur.unitPrice) || 0) <= 0 && fallback > 0) cur.unitPrice = fallback;
    }
  }
  const hours = roundToNearestHalf(workMs / 3600000);

  // build lines: labour + grouped items
  const lines = [];
  const labourProduct = sourceState.products.find(p => {
    const n = (p.name||"").toLowerCase();
    return n === "werk" || n === "arbeid";
  });
  if (hours > 0){
    lines.push({
      id: uid(),
      productId: labourProduct?.id || null,
      description: labourProduct?.name || "Werk",
      unit: labourProduct?.unit || "uur",
      qty: hours,
      unitPrice: Number(sourceState.settings.hourlyRate||38),
      vatRate: labourProduct?.vatRate ?? 0.21,
      bucket: "invoice"
    });
  }
  for (const [productId, v] of itemMap.entries()){
    const prod = sourceState.products.find(p => p.id === productId);
    lines.push({
      id: uid(),
      productId,
      description: prod?.name || "Product",
      unit: prod?.unit || "keer",
      qty: round2(v.qty),
      unitPrice: round2(v.unitPrice),
      vatRate: prod?.vatRate ?? 0.21,
      bucket: "invoice"
    });
  }

  return { workMs, hours, lines };
}

function computeSettlementFromLogs(customerId, logIds){
  return computeSettlementFromLogsInState(state, customerId, logIds);
}

// ---------- Allocation helpers (bron van waarheid = logs) ----------

/**
 * computeBaseTotals: lees werkuren + producten uit gekoppelde logs.
 * Returns { baseWorkHours, baseDate, productMap }
 * productMap: Map<productId, { qty, unitPrice, name, unit, vatRate }>
 */
function computeBaseTotals(settlement, sourceState = state){
  const logIds = settlement.logIds || [];
  let workMs = 0;
  let baseDate = "";
  const productMap = new Map();

  for (const id of logIds){
    const log = sourceState.logs.find(l => l.id === id);
    if (!log) continue;
    workMs += sumWorkMs(log);
    if (log.date > baseDate) baseDate = log.date;
    for (const item of (log.items || [])){
      const key = item.productId || "free";
      const raw = Number(item.unitPrice) || 0;
      const prod = key === "free" ? null : sourceState.products.find(p => p.id === key);
      const fallback = Number(prod?.unitPrice) || 0;
      const effective = raw > 0 ? raw : (fallback > 0 ? fallback : 0);
      if (!productMap.has(key)){
        productMap.set(key, {
          qty: 0,
          unitPrice: effective,
          name: prod?.name || item.name || item.description || "Product",
          unit: prod?.unit || "keer",
          vatRate: prod?.vatRate ?? 0.21
        });
      }
      const cur = productMap.get(key);
      cur.qty += Number(item.qty) || 0;
      if (raw > 0) cur.unitPrice = raw;
      else if ((Number(cur.unitPrice) || 0) <= 0 && fallback > 0) cur.unitPrice = fallback;
    }
  }
  const baseWorkHours = roundToNearestHalf(workMs / 3600000);
  return { baseWorkHours, baseDate, productMap };
}

function runGreenAllocationUnitPriceSanityCheck(sourceState = state){
  const groen = (sourceState.products || []).find(p => (p.name || "").toLowerCase() === "groen");
  if (!groen?.id) return;
  const testLogId = `sanity-log-${uid()}`;
  const settlement = { id: `sanity-settlement-${uid()}`, logIds: [testLogId], allocations: {} };
  const checkState = {
    ...sourceState,
    logs: [
      ...(sourceState.logs || []),
      {
        id: testLogId,
        customerId: null,
        date: todayISO(),
        createdAt: now(),
        closedAt: null,
        segments: [],
        items: [{ productId: groen.id, qty: 2, unitPrice: 0 }]
      }
    ]
  };
  buildAllocationsFromLogs(settlement, checkState);
  const groenAlloc = settlement.allocations?.[`p:${groen.id}`];
  const totals = getTotalsFromAllocations(settlement);
  if (!groenAlloc) console.warn("Sanity check failed: Groen allocation missing.");
  if ((Number(groenAlloc?.unitPrice) || 0) !== (Number(groen.unitPrice) || 0)){
    console.warn("Sanity check failed: Groen unitPrice fallback not applied.", { allocation: groenAlloc, product: groen });
  }
  if ((Number(totals.invoiceSubtotal) || 0) <= 0){
    console.warn("Sanity check failed: Groen not included in settlement totals.", { totals, allocation: groenAlloc });
  }
}

/**
 * buildAllocationsFromLogs: bouw settlement.allocations op uit logs.
 * Bewaart bestaande cashQty verdeling indien baseQty gelijk bleef.
 * Migreert vanuit oude `lines` structuur als er nog geen allocations zijn.
 */
function buildAllocationsFromLogs(settlement, sourceState = state){
  const { baseWorkHours, baseDate, productMap } = computeBaseTotals(settlement, sourceState);
  const labourProduct = sourceState.products.find(p => {
    const n = (p.name || "").toLowerCase();
    return n === "werk" || n === "arbeid";
  });
  const hourlyRate = Number(sourceState.settings.hourlyRate || 38);
  const oldAllocations = settlement.allocations || null;
  const oldLines = settlement.lines || [];
  const newAllocations = {};

  // Work hours
  if (baseWorkHours > 0){
    let cashQty = 0;
    if (oldAllocations?.work && round2(oldAllocations.work.baseQty) === baseWorkHours){
      cashQty = Math.min(oldAllocations.work.cashQty || 0, baseWorkHours);
    } else if (!oldAllocations){
      // Migreer vanuit oude lines
      const cashWorkLine = oldLines.find(l => (l.bucket || "invoice") === "cash" && isWorkProduct(l));
      cashQty = Math.min(Number(cashWorkLine?.qty) || 0, baseWorkHours);
    }
    cashQty = round2(Math.max(0, Math.min(baseWorkHours, cashQty)));
    newAllocations.work = {
      baseQty: baseWorkHours,
      invoiceQty: round2(baseWorkHours - cashQty),
      cashQty,
      unitPrice: hourlyRate,
      productId: labourProduct?.id || null,
      name: labourProduct?.name || "Werk",
      unit: labourProduct?.unit || "uur",
      vatRate: labourProduct?.vatRate ?? 0.21
    };
  }

  // Products
  for (const [productId, info] of productMap.entries()){
    const key = `p:${productId}`;
    const baseQty = round2(info.qty);
    let cashQty = 0;
    if (oldAllocations?.[key] && round2(oldAllocations[key].baseQty) === baseQty){
      cashQty = Math.min(oldAllocations[key].cashQty || 0, baseQty);
    } else if (!oldAllocations){
      const cashLine = oldLines.find(l => (l.bucket || "invoice") === "cash" && l.productId === productId);
      cashQty = Math.min(Number(cashLine?.qty) || 0, baseQty);
    }
    cashQty = round2(Math.max(0, Math.min(baseQty, cashQty)));
    newAllocations[key] = {
      baseQty,
      invoiceQty: round2(baseQty - cashQty),
      cashQty,
      unitPrice: round2(info.unitPrice),
      productId: productId !== "free" ? productId : null,
      name: info.name,
      unit: info.unit,
      vatRate: info.vatRate
    };
  }

  settlement.allocations = newAllocations;
  // Datum consistency: settlement.date = max(log.date)
  if (baseDate) settlement.date = baseDate;
  return newAllocations;
}

/**
 * shiftAllocation: verschuif qty tussen factuur en cash voor één item.
 * key = "work" | "p:<productId>"
 * direction = "toCash" | "toInvoice"
 * Invariant: invoiceQty + cashQty == baseQty
 */
function shiftAllocation(settlement, key, direction, step){
  if (isSettlementCalculated(settlement)) return;
  const alloc = (settlement.allocations || {})[key];
  if (!alloc) return;
  let cashQty = alloc.cashQty;
  if (direction === "toCash") cashQty = round2(cashQty + step);
  else if (direction === "toInvoice") cashQty = round2(cashQty - step);
  cashQty = Math.max(0, Math.min(alloc.baseQty, cashQty));
  alloc.cashQty = round2(cashQty);
  alloc.invoiceQty = round2(alloc.baseQty - cashQty);
}

/**
 * getTotalsFromAllocations: bereken subtotalen vanuit allocations.
 * Factuur is incl BTW, cash is excl BTW.
 */
function getTotalsFromAllocations(settlement){
  // try-catch is vereist: typeof geeft ook ReferenceError voor let-variabelen in TDZ.
  // getTotalsFromAllocations wordt aangeroepen vanuit validateAndRepairState() TIJDENS
  // let state = loadState(), dus state is nog niet geïnitialiseerd.
  let btwRate = 0.21;
  try { btwRate = Number(state?.settings?.vatRate ?? 0.21); } catch(e) { /* TDZ */ }
  const allocs = settlement.allocations || {};
  let invoiceExcl = 0;
  let cashExcl = 0;
  for (const alloc of Object.values(allocs)){
    invoiceExcl += (alloc.invoiceQty || 0) * (alloc.unitPrice || 0);
    cashExcl += (alloc.cashQty || 0) * (alloc.unitPrice || 0);
  }
  invoiceExcl = round2(invoiceExcl);
  cashExcl = round2(cashExcl);
  const invoiceVat = round2(invoiceExcl * btwRate);
  const invoiceTotal = round2(invoiceExcl + invoiceVat);
  const cashTotal = round2(cashExcl);
  return { invoiceSubtotal: invoiceExcl, invoiceVat, invoiceTotal, cashSubtotal: cashExcl, cashTotal };
}

// ---------- UI state ----------
const ui = {
  navStack: [{ view: "logs" }],
  transition: null,
  logDetailSegmentEditId: null,
  logDateEditSnapshot: {},
  customerDetailEditingId: null,
  customerDetailDrafts: {},
  productDetailEditingId: null,
  productDetailDrafts: {},
  activeLogQuickAdd: {
    open: false,
    productId: null,
    qty: "1"
  }
};

if (!state.ui?.demoDefaultLoaded){
  const changed = seedDemoPeriod(state, { months: 24, force: false, seed: "demo-v2" });
  state.ui = state.ui || {};
  state.ui.demoDefaultLoaded = true;
  if (changed) saveState(state);
}

// Guardrail: keep state mutations inside actions + commit.
function commit(){
  state = validateAndRepairState(state);
  saveState(state);
  render();
}

const actions = {
  startLog(customerId){
    if (!customerId || state.activeLogId) return null;
    const log = {
      id: uid(), customerId, date: todayISO(), createdAt: now(), closedAt: null,
      note: "", segments: [], items: []
    };
    openSegment(log, "work");
    state.logs.unshift(log);
    state.activeLogId = log.id;
    commit();
    return log;
  },
  pauseLog(logId){
    const log = state.logs.find(l => l.id === logId);
    if (!log) return;
    const seg = currentOpenSegment(log);
    if (!seg) openSegment(log, "work");
    else if (seg.type === "work"){ closeOpenSegment(log); openSegment(log, "break"); }
    else { closeOpenSegment(log); openSegment(log, "work"); }
    commit();
  },
  stopLog(logId){
    const log = state.logs.find(l => l.id === logId);
    if (!log) return;
    closeOpenSegment(log);
    log.closedAt = now();
    state.activeLogId = null;
    ui.activeLogQuickAdd.open = false;
    commit();
  },
  addGreenToLog(logId){
    // Zelfde mechanisme als de + in log detail
    adjustLogGreenQty(logId, +1);
    // adjustLogGreenQty gebruikt actions.editLog -> commit gebeurt daar al
  },
  editLog(logId, updater){
    const log = state.logs.find(l => l.id === logId);
    if (!log || typeof updater !== "function") return;
    updater(log);
    commit();
  },
  deleteLog(logId){
    state.logs = state.logs.filter(x => x.id !== logId);
    delete ui.logDateEditSnapshot[logId];
    if (state.activeLogId === logId) state.activeLogId = null;
    for (const s of state.settlements){
      s.logIds = (s.logIds || []).filter(id => id !== logId);
      syncSettlementDatesFromLogs(s);
      ensureSettlementInvoiceDefaults(s);
    }
    commit();
  },
  createSettlement(customerId = state.customers[0]?.id || ""){
    const invoiceDate = todayISO();
    const s = {
      id: uid(), customerId, date: invoiceDate, createdAt: now(), logIds: [], lines: [],
      status: "draft", markedCalculated: false, isCalculated: false, calculatedAt: null,
      invoiceAmount: 0, cashAmount: 0, invoicePaid: false, cashPaid: false,
      invoiceNumber: null,
      invoiceDate,
      invoiceLocked: false
    };
    state.settlements.unshift(s);
    commit();
    return s;
  },
  linkLogToSettlement(logId, settlementId){
    // Ontkoppel de log uit alle afrekeningen (inclusief calculated: geen wijziging voor die)
    for (const s of state.settlements){
      if (isSettlementCalculated(s)) continue; // geen wijziging aan calculated settlements
      s.logIds = (s.logIds || []).filter(x => x !== logId);
      if (s.logIds.length === 0) s.allocations = {};
      else buildAllocationsFromLogs(s);
    }
    if (settlementId === "none") return commit();
    if (settlementId === "new"){
      const log = state.logs.find(l => l.id === logId);
      if (!log) return;
      const s = {
        id: uid(), customerId: log.customerId, date: log.date || todayISO(),
        createdAt: now(), logIds: [logId], lines: [], allocations: {},
        status: "draft", markedCalculated: false, isCalculated: false, calculatedAt: null,
        invoiceAmount: 0, cashAmount: 0, invoicePaid: false, cashPaid: false,
        invoiceNumber: null, invoiceDate: log.date || todayISO(), invoiceLocked: false
      };
      buildAllocationsFromLogs(s);
      syncSettlementAmounts(s);
      state.settlements.unshift(s);
      commit();
      return s;
    }
    const s = state.settlements.find(x => x.id === settlementId);
    if (!s) return commit();
    if (isSettlementCalculated(s)) return commit(); // geen link aan calculated
    s.logIds = Array.from(new Set([...(s.logIds || []), logId]));
    buildAllocationsFromLogs(s);
    syncSettlementAmounts(s);
    commit();
    return s;
  },
  calculateSettlement(settlementId){
    const settlement = state.settlements.find(x => x.id === settlementId);
    if (!settlement) return { ok: false, reason: "not_found" };
    calculateSettlement(settlement);
    commit();
    return { ok: true };
  },
  setInvoicePaid(settlementId, paid){
    const s = state.settlements.find(x => x.id === settlementId);
    if (!s) return;
    s.invoicePaid = Boolean(paid);
    syncSettlementStatus(s);
    commit();
  },
  setCashPaid(settlementId, paid){
    const s = state.settlements.find(x => x.id === settlementId);
    if (!s) return;
    s.cashPaid = Boolean(paid);
    syncSettlementStatus(s);
    commit();
  },
  deleteSettlement(settlementId){
    state.settlements = state.settlements.filter(x => x.id !== settlementId);
    if (state.ui.editSettlementId === settlementId) state.ui.editSettlementId = null;
    commit();
  },
  editSettlement(settlementId, updater){
    const settlement = state.settlements.find(x => x.id === settlementId);
    if (!settlement || typeof updater !== "function") return;
    updater(settlement);
    syncSettlementDatesFromLogs(settlement);
    ensureSettlementInvoiceDefaults(settlement);
    commit();
  },
  updateSettlementField(settlementId, field, value){
    const settlement = state.settlements.find(x => x.id === settlementId);
    if (!settlement) return;
    settlement[field] = value;
    commit();
  },
  addProduct(product){ state.products.unshift(product); commit(); return product; },
  updateSettings(hourlyRate, vatRate, theme = state.settings.theme){
    state.settings.hourlyRate = round2(hourlyRate);
    state.settings.vatRate = round2(vatRate);
    state.settings.theme = normalizeTheme(theme);
    commit();
  },
  setTheme(theme){
    state.settings.theme = normalizeTheme(theme);
    commit();
  },
  setEditLog(logId){
    state.ui.editLogId = state.ui.editLogId === logId ? null : logId;
    if (state.ui.editLogId !== logId) ui.logDetailSegmentEditId = null;
    commit();
  },
  setEditSettlement(settlementId){
    state.ui.editSettlementId = state.ui.editSettlementId === settlementId ? null : settlementId;
    commit();
  },
  setLogbook(partial){ state.logbook = { ...(state.logbook || {}), ...partial }; commit(); },
  addCustomer(customer){ state.customers.unshift(customer); commit(); return customer; },
  updateCustomer(customerId, patch){
    if ("nickname" in patch){
      const duplicate = findCustomerByNickname(state, patch.nickname, customerId);
      if (duplicate) return { ok: false, error: "duplicate_nickname" };
    }
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return { ok: false, error: "not_found" };
    Object.assign(c, patch);
    commit();
    return { ok: true };
  },
  deleteCustomer(customerId){ state.customers = state.customers.filter(x => x.id !== customerId); commit(); },
  updateProduct(productId, patch){
    const p = state.products.find(x => x.id === productId);
    if (!p) return;
    Object.assign(p, patch);
    commit();
  },
  deleteProduct(productId){ state.products = state.products.filter(x => x.id !== productId); commit(); },
  setBackupFeedback(type, text){
    state.ui = state.ui || {};
    state.ui.backupFeedback = { type, text };
    commit();
  }
};

function toggleEditLog(logId){
  const isLeavingEdit = state.ui.editLogId === logId;
  if (!isLeavingEdit){
    const log = state.logs.find(item => item.id === logId);
    if (log) ui.logDateEditSnapshot[logId] = log.date || "";
  } else {
    delete ui.logDateEditSnapshot[logId];
  }
  actions.setEditLog(logId);
}

function cancelLogDateEditIfNeeded(){
  const active = currentView();
  if (active.view !== "logDetail") return;
  const logId = active.id;
  if (state.ui.editLogId !== logId) return;
  const originalDate = ui.logDateEditSnapshot[logId];
  if (originalDate == null) return;

  const log = state.logs.find(item => item.id === logId);
  if (log && log.date !== originalDate){
    log.date = originalDate;
    saveState(state);
  }

  state.ui.editLogId = null;
  ui.logDetailSegmentEditId = null;
  delete ui.logDateEditSnapshot[logId];
}

function cancelDetailEditIfNeeded(){
  const active = currentView();
  if (active.view === "customerDetail" && ui.customerDetailEditingId === active.id){
    ui.customerDetailEditingId = null;
    delete ui.customerDetailDrafts[active.id];
  }
  if (active.view === "productDetail" && ui.productDetailEditingId === active.id){
    ui.productDetailEditingId = null;
    delete ui.productDetailDrafts[active.id];
  }
}

function preferredWorkProduct(){
  return state.products.find(p => (p.name||"").trim().toLowerCase() === "werk") || state.products[0] || null;
}

function addProductToLog(logId, productId, qty, unitPrice){
  const log = state.logs.find(l => l.id === logId);
  if (!log) return false;
  const product = state.products.find(p => p.id === productId) || preferredWorkProduct();
  if (!product) return false;

  const parsedQty = Number(String(qty ?? "").replace(",", "."));
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return false;

  const priceSource = unitPrice ?? product.unitPrice ?? 0;
  const parsedUnitPrice = Number(String(priceSource).replace(",", "."));
  const safeUnitPrice = Number.isFinite(parsedUnitPrice) ? parsedUnitPrice : 0;

  log.items = log.items || [];
  log.items.push({
    id: uid(),
    productId: product.id,
    qty: parsedQty,
    unitPrice: safeUnitPrice,
    note: ""
  });
  return true;
}

function currentView(){
  return ui.navStack[ui.navStack.length - 1] || { view: "logs" };
}

function updateTabs(){
  const key = ui.navStack[0]?.view || "logs";
  const showDetailBack = ui.navStack.length > 1;
  const navMeer = $("#nav-meer");

  $("#tab-logs").classList.toggle("hidden", key !== "logs");
  $("#tab-settlements").classList.toggle("hidden", key !== "settlements");
  $("#tab-meer").classList.toggle("hidden", key !== "meer");

  $("#nav-logs").classList.toggle("active", key === "logs");
  $("#nav-settlements").classList.toggle("active", key === "settlements");
  $("#nav-meer").classList.toggle("active", key === "meer");

  $("#nav-logs").setAttribute("aria-selected", String(key === "logs"));
  $("#nav-settlements").setAttribute("aria-selected", String(key === "settlements"));
  navMeer.setAttribute("aria-selected", String(!showDetailBack && key === "meer"));
  navMeer.setAttribute("aria-label", showDetailBack ? "Terug" : "Meer");
  navMeer.setAttribute("title", showDetailBack ? "Terug" : "Meer");
  navMeer.classList.toggle("tab-back", showDetailBack);
  $("#nav-logs").setAttribute("aria-label", "Logboek");
  $("#nav-logs").setAttribute("title", "Logboek");
  $("#nav-settlements").setAttribute("aria-label", "Geld");
  $("#nav-settlements").setAttribute("title", "Geld");
  navMeer.innerHTML = showDetailBack
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
}

function viewTitle(viewState){
  const view = viewState?.view;
  if (view === "logs") return "Logboek";
  if (view === "settlements") return "Afrekeningen";
  if (view === "meer") return "Meer";
  if (view === "customers") return "Klanten";
  if (view === "products") return "Producten";
  if (view === "settings") return "Instellingen";
  if (view === "settlementListOptions") return "Filter & sorteer";
  if (view === "logDetail"){
    const l = state.logs.find(x => x.id === viewState.id);
    return l ? `${cname(l.customerId)} · ${l.date}` : "Werklog";
  }
  if (view === "settlementDetail"){
    const s = state.settlements.find(x => x.id === viewState.id);
    return s ? `${cname(s.customerId)}${s.date ? ` · ${s.date}` : ""}` : "Afrekening";
  }
  if (view === "settlementLogOverview") return "Afrekening log-overzicht";
  if (view === "customerDetail"){
    const c = state.customers.find(x => x.id === viewState.id);
    return c ? (c.nickname || c.name || "Klant") : "Klant";
  }
  if (view === "productDetail"){
    const p = state.products.find(x => x.id === viewState.id);
    return p ? (p.name || "Product") : "Product";
  }
  if (view === "newLog") return "Nieuwe werklog";
  return "Tuinlog";
}

function renderTopbar(){
  const active = currentView();
  const topbar = document.querySelector(".topbar");
  const subtitleEl = $("#topbarSubtitle");
  const metricEl = $("#topbarMetric");
  const btnNew = $("#btnNewLog");
  const rightInfoEl = $("#topbarRightInfo");
  let linkedCustomerId = "";
  topbar.classList.remove("nav--free", "nav--linked", "nav--calculated", "nav--paid");
  subtitleEl.classList.add("hidden");
  subtitleEl.textContent = "";
  metricEl.classList.add("hidden");
  metricEl.textContent = "";
  rightInfoEl?.classList.add("hidden");
  if (rightInfoEl) rightInfoEl.textContent = "";
  btnNew.classList.remove("topbar-edit");

  if (active.view === "logDetail"){
    const log = state.logs.find(x => x.id === active.id);
    if (log){
      const visual = getLogVisualState(log);
      topbar.classList.add(`nav--${visual.state}`);
      $("#topbarTitle").textContent = cname(log.customerId);
      const totalMinutes = Math.floor(sumWorkMs(log) / 60000);
      if (rightInfoEl){
        rightInfoEl.textContent = formatDurationCompact(totalMinutes);
        rightInfoEl.classList.remove("hidden");
      }
      linkedCustomerId = log.customerId || "";
    } else {
      $("#topbarTitle").textContent = viewTitle(active);
    }
  } else if (active.view === "settlementDetail"){
    const settlement = state.settlements.find(x => x.id === active.id);
    if (settlement){
      const visual = getSettlementVisualState(settlement);
      topbar.classList.add(visual.navClass);
      $("#topbarTitle").textContent = cname(settlement.customerId);
      subtitleEl.textContent = formatDatePretty(settlement.date);
      subtitleEl.classList.remove("hidden");
      const invoiceNo = String(settlement.invoiceNumber || "").trim();
      if (rightInfoEl){
        if (invoiceNo){
          rightInfoEl.textContent = invoiceNo.toUpperCase();
          rightInfoEl.classList.remove("hidden");
        } else {
          rightInfoEl.textContent = "";
          rightInfoEl.classList.add("hidden");
        }
      }
      linkedCustomerId = settlement.customerId || "";
    } else {
      $("#topbarTitle").textContent = viewTitle(active);
    }
  } else {
    $("#topbarTitle").textContent = viewTitle(active);
  }
  topbar.dataset.customerId = linkedCustomerId;

  const showBack = ui.navStack.length > 1;
  const isSettlementDetail = active.view === "settlementDetail";
  const settlement = isSettlementDetail ? state.settlements.find(x => x.id === active.id) : null;

  $("#btnBack")?.classList.add("hidden");

  if (isSettlementDetail && settlement){
    btnNew.classList.add("hidden");
    return;
  }

  const isSettlementsRoot = !showBack && active.view === "settlements";
  btnNew.innerHTML = isSettlementsRoot
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h8" stroke-linecap="round"/><path d="M16 6h4" stroke-linecap="round"/><circle cx="14" cy="6" r="2"/><path d="M4 12h4" stroke-linecap="round"/><path d="M12 12h8" stroke-linecap="round"/><circle cx="10" cy="12" r="2"/><path d="M4 18h10" stroke-linecap="round"/><path d="M18 18h2" stroke-linecap="round"/><circle cx="16" cy="18" r="2"/></svg>`
    : `<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  btnNew.classList.toggle("hidden", showBack);
  btnNew.setAttribute("aria-label", isSettlementsRoot ? "Filter & sorteer" : "Nieuwe werklog");
  btnNew.setAttribute("title", isSettlementsRoot ? "Filter & sorteer" : "Nieuwe werklog");
}

function setTab(key){
  ui.navStack = [{ view: key }];
  ui.transition = null;
  render();
}

function pushView(viewState){
  ui.transition = "push";
  ui.navStack.push(viewState);
  render();
}

function popView(){
  if (ui.navStack.length <= 1) return;
  cancelLogDateEditIfNeeded();
  cancelDetailEditIfNeeded();
  ui.transition = "pop";
  ui.navStack.pop();
  render();
}

function popViewInstant(){
  if (ui.navStack.length <= 1) return;
  cancelLogDateEditIfNeeded();
  cancelDetailEditIfNeeded();
  ui.transition = null;
  ui.navStack.pop();
  render();
}


$("#nav-logs").addEventListener("click", ()=>setTab("logs"));
$("#nav-settlements").addEventListener("click", ()=>setTab("settlements"));
$("#nav-meer").addEventListener("click", ()=>{
  if (ui.navStack.length > 1){
    popView();
    return;
  }
  setTab("meer");
});

$("#btnBack")?.addEventListener("click", popView);
$(".topbar")?.addEventListener("click", (event)=>{
  if (event.target.closest("button")) return;
  const active = currentView();
  if (active.view !== "logDetail" && active.view !== "settlementDetail") return;
  const customerId = event.currentTarget?.dataset?.customerId;
  if (!customerId) return;
  if (ui.navStack.some(v => v.view === "customerDetail" && v.id === customerId)) return;
  pushView({ view: "customerDetail", id: customerId });
});
$("#btnNewLog").onclick = ()=>{
  const active = currentView();
  if (active.view === "settlementDetail"){
    const settlement = state.settlements.find(x => x.id === active.id);
    if (!settlement) return;
    toggleEditSettlement(settlement.id);
    return;
  }
  if (ui.navStack.length > 1) return;
  if (active.view === "settlements"){
    pushView({ view: "settlementListOptions" });
    return;
  }
  pushView({ view: "newLog" });
};

function createSettlement(){
  return actions.createSettlement();
}

function startWorkLog(customerId){
  if (!customerId) return;
  if (state.activeLogId){
    alert("Er is al een actieve werklog.");
    return;
  }
  const log = actions.startLog(customerId);
  if (!log) return;
  if (ui.navStack.length > 1) popView();
}

function openSheet(type, id){
  const map = {
    "log": "logDetail",
    "customer": "customerDetail",
    "product": "productDetail",
    "settlement": "settlementDetail",
    "new-log": "newLog"
  };
  const view = map[type];
  if (!view) return;
  pushView(id ? { view, id } : { view });
}
function closeSheet(){
  popView();
}


function measureBottomTabbarHeight(){
  const tabbar = document.getElementById("bottomTabbar");
  if (!tabbar) return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-tabbar-height")) || 90;
  return Math.round(tabbar.getBoundingClientRect().height) || 90;
}

function measureMoreActionBarHeight(){
  const bar = document.getElementById("moreActionBar");
  if (!bar || bar.classList.contains("hidden")) return 0;
  return Math.round(bar.getBoundingClientRect().height) || 0;
}

function setBottomBarHeights({ statusVisible = false } = {}){
  const root = document.documentElement;
  const bottomHeight = measureBottomTabbarHeight();
  root.style.setProperty("--bottom-tabbar-height", `${bottomHeight}px`);
  root.style.setProperty("--tabbar-height", `${bottomHeight}px`);

  const statusHost = document.getElementById("statusTabbarHost");
  if (!statusVisible || !statusHost || !statusHost.firstElementChild){
    root.style.setProperty("--status-tabbar-height", "0px");
    if (statusHost) statusHost.style.bottom = `${bottomHeight}px`;
    return;
  }

  statusHost.style.bottom = `${bottomHeight}px`;
  const statusHeight = Math.round(statusHost.firstElementChild.getBoundingClientRect().height) || 0;
  root.style.setProperty("--status-tabbar-height", `${statusHeight}px`);
}

function clearStatusTabbar(){
  const host = document.getElementById("statusTabbarHost");
  if (!host) return;
  host.innerHTML = "";
  host.classList.add("hidden");
  setBottomBarHeights({ statusVisible: false });
}

function setStatusTabbar(htmlString){
  const host = document.getElementById("statusTabbarHost");
  if (!host) return;
  host.classList.remove("hidden");
  host.innerHTML = `
    <div class="status-tabbar" role="group" aria-label="Afrekening status acties">
      <div class="status-tabbar-inner">${htmlString}</div>
    </div>
  `;
  setBottomBarHeights({ statusVisible: true });
}

function measureDetailActionBarHeight(){
  const host = document.getElementById("detailActionbarHost");
  if (!host || host.classList.contains("hidden") || !host.firstElementChild) return 0;
  return Math.round(host.firstElementChild.getBoundingClientRect().height) || 0;
}

function clearDetailActionBar(){
  const host = document.getElementById("detailActionbarHost");
  if (!host) return;
  host.innerHTML = "";
  host.classList.add("hidden");
  document.documentElement.style.setProperty("--detail-actionbar-height", "0px");
}

function setDetailActionBar({ className = "", html = "" } = {}){
  const host = document.getElementById("detailActionbarHost");
  if (!host) return;
  host.classList.remove("hidden");
  host.innerHTML = `
    <div class="detail-actionbar ${className}" role="group" aria-label="Detail acties">
      <div class="detail-actionbar-inner">${html}</div>
    </div>
  `;
  document.documentElement.style.setProperty("--detail-actionbar-height", `${measureDetailActionBarHeight()}px`);
}

function syncMoreActionRow(){
  const active = currentView();
  const row = document.getElementById("moreActionBar");
  const themeBtn = document.getElementById("moreThemeToggle");
  const customersBtn = document.getElementById("moreNavCustomers");
  const productsBtn = document.getElementById("moreNavProducts");
  const settingsBtn = document.getElementById("moreNavSettings");
  if (!row || !themeBtn || !customersBtn || !productsBtn || !settingsBtn) return;

  const show = active.view === "meer";
  if (!show){
    row.classList.add("hidden");
    row.setAttribute("aria-hidden", "true");
    document.documentElement.style.setProperty("--more-actionbar-height", "0px");
    return;
  }

  row.classList.remove("hidden");
  row.setAttribute("aria-hidden", "false");

  const selectedTheme = normalizeTheme(state.settings?.theme);
  const isDay = selectedTheme === "day";
  themeBtn.classList.toggle("is-active", true);
  themeBtn.innerHTML = isDay
    ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke-linecap="round"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  themeBtn.setAttribute("aria-label", isDay ? "Schakel naar nachtmodus" : "Schakel naar dagmodus");
  themeBtn.setAttribute("title", isDay ? "Schakel naar nachtmodus" : "Schakel naar dagmodus");

  if (!themeBtn.dataset.bound){
    themeBtn.addEventListener("click", ()=>{
      const nextTheme = normalizeTheme(state.settings?.theme) === "day" ? "night" : "day";
      actions.setTheme(nextTheme);
    });
    themeBtn.dataset.bound = "true";
  }

  const view = currentView().view;
  customersBtn.classList.toggle("is-active", view === "customers");
  productsBtn.classList.toggle("is-active", view === "products");
  settingsBtn.classList.toggle("is-active", view === "settings");

  const openFromMore = (target)=>{
    pushView({ view: target });
  };

  if (!customersBtn.dataset.bound){
    customersBtn.addEventListener("click", ()=> openFromMore("customers"));
    customersBtn.dataset.bound = "true";
  }
  if (!productsBtn.dataset.bound){
    productsBtn.addEventListener("click", ()=> openFromMore("products"));
    productsBtn.dataset.bound = "true";
  }
  if (!settingsBtn.dataset.bound){
    settingsBtn.addEventListener("click", ()=> openFromMore("settings"));
    settingsBtn.dataset.bound = "true";
  }

  document.documentElement.style.setProperty("--more-actionbar-height", `${measureMoreActionBarHeight()}px`);
}

function syncViewUiState(){
  const active = currentView();
  document.body.dataset.view = active.view || "logs";
  syncMoreActionRow();

  if (active.view !== "customerDetail" && active.view !== "productDetail"){
    clearDetailActionBar();
  }

  const host = document.getElementById("statusTabbarHost");
  if (!host) return;
  const hasStatus = Boolean(host.querySelector(".status-tabbar"));
  if (!hasStatus){
    clearStatusTabbar();
    return;
  }

  host.classList.remove("hidden");
  setBottomBarHeights({ statusVisible: true });
}

// ---------- Render ----------
function render(){
  applyTheme(state.settings?.theme);
  syncViewUiState();
  const root = ui.navStack[0]?.view || "logs";
  updateTabs();
  if (root === "logs") renderLogs();
  if (root === "settlements") renderSettlements();
  if (root === "meer") renderMeer();

  renderTopbar();

  const detailPage = $("#detailPage");
  const rootPage = $("#rootPage");
  if (ui.navStack.length > 1){
    detailPage.classList.remove("hidden");
    renderSheet();
    if (ui.transition === "push"){
      detailPage.className = "page enter";
      rootPage.className = "page active";
      requestAnimationFrame(()=>{
        detailPage.className = "page active";
        rootPage.className = "page exitLeft";
      });
    } else {
      detailPage.className = "page active";
      rootPage.className = "page exitLeft";
    }
  } else {
    clearStatusTabbar();
    if (ui.transition === "pop" && !detailPage.classList.contains("hidden")){
      detailPage.className = "page active";
      rootPage.className = "page exitLeft";
      requestAnimationFrame(()=>{
        detailPage.className = "page enter";
        rootPage.className = "page active";
      });
      setTimeout(()=>{
        detailPage.className = "page hidden";
        detailPage.innerHTML = '<div class="page-inner"><div class="detail-head"><div id="sheetTitle" class="hidden"></div><div class="sheet-actions" id="sheetActions"></div></div><div class="sheet-body" id="sheetBody"></div></div>';
      }, NAV_TRANSITION_MS);
    } else {
      detailPage.className = "page hidden";
      rootPage.className = "page active";
    }
  }
  ui.transition = null;
}

function getLogbookPeriodStart(period){
  const current = new Date();
  if (period === "week"){
    const d = new Date(current);
    const offset = (d.getDay() + 6) % 7;
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - offset);
    return d.getTime();
  }
  if (period === "month"){
    return new Date(current.getFullYear(), current.getMonth(), 1).getTime();
  }
  if (period === "30d"){
    return now() - (30 * 86400000);
  }
  return null;
}

function logStatusBucket(status){
  if (status === "paid") return "paid";
  if (status === "calculated") return "calculated";
  return "open";
}

function logStatusLabel(status){
  const bucket = logStatusBucket(status);
  if (bucket === "paid") return "Betaald";
  if (bucket === "calculated") return "Berekend";
  return "Open";
}

function compareByDirection(a, b, dir){
  return dir === "asc" ? (a > b ? 1 : a < b ? -1 : 0) : (a < b ? 1 : a > b ? -1 : 0);
}

function applyFiltersAndSort(logs){
  const cfg = state.logbook || {};
  const statusFilter = cfg.statusFilter || "open";
  const customerId = cfg.customerId || "all";
  const period = cfg.period || "all";
  const groupBy = cfg.groupBy || "date";
  const sortDir = cfg.sortDir || "desc";
  const minTimestamp = getLogbookPeriodStart(period);

  const filtered = logs.filter(log => {
    const status = getWorkLogStatus(log.id);
    const isPaid = status === "paid";
    if (statusFilter === "open" && isPaid) return false;
    if (statusFilter === "paid" && !isPaid) return false;
    if (customerId !== "all" && log.customerId !== customerId) return false;

    if (minTimestamp != null){
      const ts = log.createdAt || new Date(`${log.date}T00:00:00`).getTime();
      if (Number.isFinite(ts) && ts < minTimestamp) return false;
    }
    return true;
  });

  const decorated = filtered.map(log => ({
    log,
    status: getWorkLogStatus(log.id),
    customer: cname(log.customerId),
    dateValue: log.createdAt || new Date(`${log.date}T00:00:00`).getTime() || 0,
    workTimeValue: sumWorkMs(log),
    productValue: sumItemsAmount(log)
  }));

  decorated.sort((a,b) => {
    if (groupBy === "customer"){
      const byCustomer = compareByDirection(a.customer.localeCompare(b.customer, "nl"), 0, sortDir);
      if (byCustomer !== 0) return byCustomer;
      return compareByDirection(a.dateValue, b.dateValue, "desc");
    }
    if (groupBy === "workTime"){
      const byWork = compareByDirection(a.workTimeValue, b.workTimeValue, sortDir);
      if (byWork !== 0) return byWork;
      return compareByDirection(a.dateValue, b.dateValue, "desc");
    }
    if (groupBy === "productTotal"){
      const byProduct = compareByDirection(a.productValue, b.productValue, sortDir);
      if (byProduct !== 0) return byProduct;
      return compareByDirection(a.dateValue, b.dateValue, "desc");
    }
    if (groupBy === "status"){
      const order = { open: 0, calculated: 1, paid: 2 };
      const byStatus = compareByDirection(order[logStatusBucket(a.status)] ?? 0, order[logStatusBucket(b.status)] ?? 0, sortDir);
      if (byStatus !== 0) return byStatus;
      return compareByDirection(a.dateValue, b.dateValue, "desc");
    }
    return compareByDirection(a.dateValue, b.dateValue, sortDir);
  });

  if (groupBy === "workTime" || groupBy === "productTotal"){
    return [{ header: "", logs: decorated.map(x => x.log) }];
  }

  const grouped = new Map();
  for (const item of decorated){
    let key = "all";
    let header = "";
    if (groupBy === "date"){
      key = item.log.date;
      header = formatLogDatePretty(item.log.date);
    } else if (groupBy === "customer"){
      key = item.log.customerId || "unknown";
      header = item.customer;
    } else if (groupBy === "status"){
      key = logStatusBucket(item.status);
      header = logStatusLabel(item.status);
    }

    if (!grouped.has(key)) grouped.set(key, { header, logs: [] });
    grouped.get(key).logs.push(item.log);
  }
  return [...grouped.values()];
}

function renderLogs(){
  const el = $("#tab-logs");
  const active = state.activeLogId ? state.logs.find(l => l.id === state.activeLogId) : null;
  const logbook = state.logbook || {};
  const statusFilter = logbook.statusFilter || "open";
  const showFilters = Boolean(logbook.showFilters);
  const customerId = logbook.customerId || "all";
  const period = logbook.period || "all";
  const groupBy = logbook.groupBy || "date";
  const sortDir = logbook.sortDir || "desc";

  // Timer-first: idle or active state
  let timerBlock = "";
  if (active){
    const isPaused = currentOpenSegment(active)?.type === "break";
    const greenCount = countGreenItems(active);
    timerBlock = `
      <div class="timer-active">
        <div class="timer-active-customer">${esc(cname(active.customerId))}</div>
        <div class="timer-active-elapsed">${durMsToHM(sumWorkMs(active))}</div>
        <div class="timer-active-meta"><span class="timer-state-dot ${isPaused ? "is-paused" : "is-running"}"></span>${isPaused ? "Pauze actief" : "Timer loopt"} · gestart ${fmtClock(active.createdAt)}</div>
        <div class="timer-green-feedback ${greenCount > 0 ? "has-items" : ""}">${greenCount > 0 ? `🌿 Groen toegevoegd: ${greenCount}x` : "Nog geen groen toegevoegd"}</div>
        <div class="timer-active-actions">
          <button class="timer-action-btn pause-btn ${isPaused ? "is-paused" : "is-running"}" id="btnPause" title="${isPaused ? "Hervat werk" : "Pauze"}" aria-label="${isPaused ? "Hervat werk" : "Pauze"}">
            ${isPaused
              ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6l10 6-10 6z" stroke-linejoin="round"/></svg>`
              : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14M16 5v14" stroke-linecap="round"/></svg>`}
          </button>
          <button class="timer-action-btn green-btn" id="btnAddGreen" title="Voeg 1x groen toe" aria-label="Voeg 1x groen (snoeiafval) toe">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19c-3.5 0-6-2.6-6-6.2 0-3.8 2.8-6.6 6.9-7.8.8 4.7 3.8 6.7 5.1 8.8 1.3 2.2-.5 5.2-6 5.2z" stroke-linejoin="round"/><path d="M12 19v-6" stroke-linecap="round"/></svg>
          </button>
          <button class="timer-action-btn stop-btn" id="btnStop" title="Stop" aria-label="Stop werklog">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>
          </button>
        </div>
      </div>
    `;
  } else {
    const totals = customerMinutesLastYear();
    const favorites = state.customers.filter(c => c.favorite);
    const autoSorted = [...state.customers].sort((a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0));

    let selected;
    if (favorites.length > 0){
      selected = [...favorites];
      for (const customer of autoSorted){
        if (selected.some(item => item.id === customer.id)) continue;
        selected.push(customer);
        if (selected.length >= START_TOP_LIMIT) break;
      }
    } else {
      selected = autoSorted.slice(0, START_TOP_LIMIT);
    }

    selected.sort((a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0));
    const cloud = selected.slice(0, START_TOP_LIMIT).map(c => `
      <button class="cloud-chip" data-start-customer="${esc(c.id)}">
        ${esc(c.nickname || c.name || "Klant")}
      </button>
    `).join("");

    timerBlock = `
      <div class="start-block">
        <div class="timer-idle timer-idle--compact">
          ${cloud ? `<div class="start-cloud recent-customers recent-customers--compact">${cloud}</div>` : `<div class="timer-idle-sub">Maak eerst een klant aan via Meer</div>`}
        </div>
      </div>
    `;
  }

  const sections = applyFiltersAndSort([...state.logs]);
  const list = sections.some(section => section.logs.length)
    ? sections.map(section => `
      ${section.header ? `<div class="log-group-header">${esc(section.header)}</div>` : ""}
      ${section.logs.map(renderLogCard).join("")}
    `).join("")
    : `<div class="meta-text" style="padding:8px 4px;">Geen logs voor deze filter.</div>`;

  const customerOptions = [`<option value="all">Alle klanten</option>`, ...state.customers
    .slice()
    .sort((a,b)=>(a.nickname||a.name||"").localeCompare(b.nickname||b.name||""))
    .map(c => `<option value="${esc(c.id)}" ${customerId === c.id ? "selected" : ""}>${esc(c.nickname||c.name||"Klant")}</option>`)
  ].join("");

  const groupOptions = [
    { value: "date", label: "Datum" },
    { value: "customer", label: "Klant" },
    { value: "workTime", label: "Werktijd" },
    { value: "productTotal", label: "Producten €" },
    { value: "status", label: "Status" }
  ].map(opt => `<option value="${opt.value}" ${groupBy === opt.value ? "selected" : ""}>${opt.label}</option>`).join("");

  el.innerHTML = `<div class="stack stack-tight stack-logs">${timerBlock}<div class="logs-section-header"><div class="log-toolbar"><div class="category-wrap"><div class="category-pill"><select id="logGroupBy" aria-label="Categorie">${groupOptions}</select><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div><button class="icon-toggle icon-toggle-neutral" id="btnLogSortDir" aria-label="Sorteerrichting" title="Sorteerrichting" style="width:34px;height:34px;min-height:34px;">${sortDir === "desc" ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M8 9l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M8 15l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</button><button class="btn btn-filters ${showFilters ? "is-active" : ""}" id="btnToggleLogFilters" aria-expanded="${showFilters}" style="min-height:34px;padding:5px 8px;"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;"><path d="M4 6h16M7 12h10M10 18h4" stroke-linecap="round"/></svg></button></div></div>${showFilters ? `<div class="log-filter-row"><div class="log-chip"><label>Status</label><div class="segmented" role="group" aria-label="Status filter"><button class="seg-btn ${statusFilter === "open" ? "is-active" : ""}" data-log-status="open">Open</button><button class="seg-btn ${statusFilter === "paid" ? "is-active" : ""}" data-log-status="paid">Betaald</button><button class="seg-btn ${statusFilter === "all" ? "is-active" : ""}" data-log-status="all">Alles</button></div></div><div class="log-chip"><label for="logCustomerFilter">Klant</label><select id="logCustomerFilter">${customerOptions}</select></div><div class="log-chip"><label for="logPeriodFilter">Periode</label><select id="logPeriodFilter"><option value="all" ${period === "all" ? "selected" : ""}>Alles</option><option value="week" ${period === "week" ? "selected" : ""}>Deze week</option><option value="month" ${period === "month" ? "selected" : ""}>Deze maand</option><option value="30d" ${period === "30d" ? "selected" : ""}>Laatste 30 dagen</option></select></div><div class="log-chip log-chip-reset"><button class="btn" id="btnResetLogFilters">Reset filters</button></div></div>` : ""}<div class="flat-list">${list}</div></div>`;

  // Timer-first actions
  if (active){
    $("#btnPause")?.addEventListener("click", ()=>{
      actions.pauseLog(active.id);
    });
    $("#btnAddGreen")?.addEventListener("click", ()=>{
      actions.addGreenToLog(active.id);
    });
    $("#btnStop")?.addEventListener("click", ()=>{
      actions.stopLog(active.id);
    });
    // Tap timer block to open active log detail
    $(".timer-active")?.addEventListener("click", (e)=>{
      if (e.target.closest("button")) return;
      openSheet("log", active.id);
    });
  } else {
    // Recent customer chips: start work directly
    el.querySelectorAll("[data-start-customer]").forEach(chip=>{
      chip.addEventListener("click", ()=>{
        const cid = chip.getAttribute("data-start-customer");
        if (cid) startWorkLog(cid);
      });
    });
  }

  el.querySelectorAll("[data-open-log]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("log", x.getAttribute("data-open-log")));
  });
  $("#btnToggleLogFilters")?.addEventListener("click", ()=>{

    actions.setLogbook({ showFilters: !state.logbook.showFilters });
    renderLogs();
  });
  $("#logGroupBy")?.addEventListener("change", ()=>{

    actions.setLogbook({ groupBy: $("#logGroupBy").value || "date" });
    renderLogs();
  });
  $("#btnLogSortDir")?.addEventListener("click", ()=>{

    actions.setLogbook({ sortDir: state.logbook.sortDir === "asc" ? "desc" : "asc" });
    renderLogs();
  });
  el.querySelectorAll("[data-log-status]").forEach(btn=>{
    btn.addEventListener("click", ()=>{

      actions.setLogbook({ statusFilter: btn.getAttribute("data-log-status") || "open" });
      renderLogs();
    });
  });
  $("#logCustomerFilter")?.addEventListener("change", ()=>{

    actions.setLogbook({ customerId: $("#logCustomerFilter").value || "all" });
    renderLogs();
  });
  $("#logPeriodFilter")?.addEventListener("change", ()=>{

    actions.setLogbook({ period: $("#logPeriodFilter").value || "all" });
    renderLogs();
  });
  $("#btnResetLogFilters")?.addEventListener("click", ()=>{

    actions.setLogbook({ statusFilter: "open", customerId: "all", period: "all" });
    renderLogs();
  });
}

function _attachSettingsHandlers(){
  const setBackupFeedback = (type, text)=>{
    state.ui = state.ui || {};
    state.ui.backupFeedback = { type, text };
    const feedbackEl = $("#backupFeedback");
    if (!feedbackEl) return;
    feedbackEl.textContent = text || "";
    feedbackEl.classList.remove("is-error", "is-success");
    if (text){
      feedbackEl.classList.add(type === "error" ? "is-error" : "is-success");
    }
  };

  const parseBackupFile = (file)=> new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(String(reader.result || ""));
    reader.onerror = ()=> reject(new Error("Bestand kon niet worden gelezen."));
    reader.readAsText(file);
  });

  const validateBackupPayload = (payload)=>{
    if (!payload || typeof payload !== "object") return "Ongeldige backup: JSON-object ontbreekt.";
    if (payload.version !== STORAGE_KEY) return "Ongeldige backup-versie. Alleen backups van TuinLog MVP v1 zijn toegestaan.";
    if (!payload.data || typeof payload.data !== "object") return "Ongeldige backup: data-object ontbreekt.";
    const required = ["customers", "logs", "settlements", "settings"];
    const missing = required.filter((key)=> !(key in payload.data));
    if (missing.length) return `Ongeldige backup: ontbrekende velden (${missing.join(", ")}).`;
    return "";
  };

  $("#saveSettings").onclick = ()=>{
    const hourly = Number(String($("#settingHourly").value).replace(",", ".") || "0");
    const vatPct = Number(String($("#settingVat").value).replace(",", ".") || "0");

    actions.updateSettings(hourly, vatPct / 100);
    alert("Instellingen opgeslagen.");
  };

  $("#fillDemoBtn").onclick = ()=>{
    if (!confirmAction("Demo data toevoegen voor 24 maanden (2 jaar)?")) return;
    const changed = seedDemoPeriod(state, { months: 24, force: false, seed: "demo-v2" });
    if (changed){

      commit();
    } else {
      alert("Demo data bestaat al. Wis eerst demo data om opnieuw te seeden.");
    }
  };

  $("#clearDemoBtn").onclick = ()=>{
    const demoRecordCount = state.customers.filter(c => c.demo).length + state.logs.filter(l => l.demo).length + state.settlements.filter(s => s.demo).length;
    if (!demoRecordCount){
      alert("Geen demo data om te wissen.");
      return;
    }
    if (!confirmAction("Alle demo records wissen? Echte data blijft behouden.")) return;
    clearDemoData(state);
    closeSheet();

    commit();
  };

  $("#resetAllBtn").onclick = ()=>{
    if (!confirmAction("Reset alles? Dit wist alle lokale data.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  $("#backupExportBtn").onclick = ()=>{
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw){
        setBackupFeedback("error", "Er is geen lokale data gevonden om te exporteren.");
        return;
      }
      const parsed = JSON.parse(raw);
      const payload = {
        exportedAt: new Date().toISOString(),
        version: STORAGE_KEY,
        data: parsed,
      };
      const today = new Date().toISOString().slice(0,10);
      const filename = `tuinlog-backup-${today}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupFeedback("success", `Backup opgeslagen als ${filename}.`);
    } catch {
      setBackupFeedback("error", "Backup exporteren is mislukt. Controleer of je data geldig is.");
    }
  };

  $("#backupImportBtn").onclick = ()=>{
    $("#backupImportInput")?.click();
  };

  $("#backupImportInput").onchange = async (event)=>{
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await parseBackupFile(file);
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        setBackupFeedback("error", "Import mislukt: bestand bevat geen geldige JSON.");
        event.target.value = "";
        return;
      }

      const validationError = validateBackupPayload(payload);
      if (validationError){
        setBackupFeedback("error", validationError);
        event.target.value = "";
        return;
      }

      const exportedAt = payload.exportedAt || "onbekende datum";
      const confirmed = await openConfirmModal({
        title: "Backup herstellen",
        message: `Weet je zeker dat je alle huidige data wilt vervangen door de backup van ${exportedAt}?`,
        confirmText: "Herstellen",
        cancelText: "Annuleren",
      });
      if (!confirmed){
        setBackupFeedback("error", "Herstel geannuleerd.");
        event.target.value = "";
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
      location.reload();
    } catch {
      setBackupFeedback("error", "Import mislukt: kon het backup-bestand niet verwerken.");
    } finally {
      event.target.value = "";
    }
  };

  $("#backupWipeBtn").onclick = async ()=>{
    const firstConfirm = await openConfirmModal({
      title: "Alles wissen",
      message: "Weet je zeker dat je alle data permanent wilt wissen? Dit kan niet ongedaan gemaakt worden.",
      confirmText: "Verder",
      cancelText: "Annuleren",
      danger: true,
    });
    if (!firstConfirm){
      setBackupFeedback("error", "Wissen geannuleerd.");
      return;
    }

    const secondConfirm = await openTextConfirmModal({
      title: "Laatste bevestiging",
      message: "Dit verwijdert alle lokale data definitief.",
      expectedText: "WISSEN",
      confirmText: "Definitief wissen",
      cancelText: "Annuleren",
    });
    if (!secondConfirm){
      setBackupFeedback("error", "Wissen geannuleerd.");
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };
}

function renderSettlements(){
  const el = $("#tab-settlements");
  const prefs = {
    ...SETTLEMENT_LIST_DEFAULTS,
    ...(state.settlementList || {})
  };
  const fallbackDateDesc = (a, b)=> String(b?.date || "").localeCompare(String(a?.date || ""));
  const parseInvoiceNumber = (value)=> {
    const digits = String(value || "").match(/(\d+)/g);
    if (!digits || !digits.length) return null;
    const parsed = Number(digits.join(""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const invoiceIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"></rect><path d="M2.5 10h19" stroke-linecap="round"></path><path d="M7 14.5h4" stroke-linecap="round"></path></svg>`;
  const cashIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="8.5" cy="12" r="3.5"></circle><circle cx="15.5" cy="12" r="3.5"></circle><path d="M12 8.5v7" stroke-linecap="round"></path></svg>`;

  const totalNotCalculatedExVat = round2(state.settlements.reduce((sum, settlement)=>{
    if (isSettlementCalculated(settlement)) return sum;
    const pay = settlementPaymentState(settlement);
    return sum + Number(pay.invoiceTotals?.subtotal || 0) + Number(pay.cashTotals?.subtotal || 0);
  }, 0));
  const totalInvoiceOutstanding = round2(state.settlements.reduce((sum, settlement)=>{
    if (!isSettlementCalculated(settlement)) return sum;
    const visual = getSettlementVisualState(settlement);
    if (visual.state === "paid") return sum;
    const pay = settlementPaymentState(settlement);
    if ((Number(pay.invoiceTotal) || 0) <= 0) return sum;
    return sum + Number(pay.invoiceTotal || 0);
  }, 0));
  const totalCashOutstanding = round2(state.settlements.reduce((sum, settlement)=>{
    if (!isSettlementCalculated(settlement)) return sum;
    const visual = getSettlementVisualState(settlement);
    if (visual.state === "paid") return sum;
    const pay = settlementPaymentState(settlement);
    if ((Number(pay.cashTotal) || 0) <= 0) return sum;
    return sum + Number(pay.cashTotal || 0);
  }, 0));

  const list = [...state.settlements]
    .filter((s)=>{
      const status = getSettlementVisualState(s).state;
      if (!prefs.statusFilter.includes(status)) return false;
      if (prefs.onlyInvoices && !settlementHasInvoiceComponent(s)) return false;
      return true;
    })
    .sort((a,b)=>{
      if (prefs.sortKey === "invoiceNumber"){
        const ai = parseInvoiceNumber(a?.invoiceNumber);
        const bi = parseInvoiceNumber(b?.invoiceNumber);
        if (ai == null && bi != null) return 1;
        if (ai != null && bi == null) return -1;
        if (ai != null && bi != null && ai !== bi){
          return prefs.sortDir === "asc" ? ai - bi : bi - ai;
        }
        return fallbackDateDesc(a, b);
      }

      const ad = String(a?.date || "");
      const bd = String(b?.date || "");
      if (!ad && bd) return 1;
      if (ad && !bd) return -1;
      if (ad !== bd){
        return prefs.sortDir === "asc" ? ad.localeCompare(bd) : bd.localeCompare(ad);
      }
      return 0;
    })
    .map(s=>{
      const customerName = cname(s.customerId);
      const invoiceNumber = String(s.invoiceNumber || "").trim();
      const titleText = invoiceNumber ? `${invoiceNumber} ${customerName}` : customerName;
      const pay = settlementPaymentState(s);
      const visual = getSettlementVisualState(s);
      const calculated = isSettlementCalculated(s);
      const flags = getSettlementPaymentFlags(s);
      const linkedLogs = (s.logIds||[])
        .map(id => state.logs.find(l => l.id === id))
        .filter(Boolean);
      const totalMinutes = Math.floor(linkedLogs.reduce((acc, log) => acc + sumWorkMs(log), 0) / 60000);
      const logbookTotals = settlementLogbookTotals(s);
      const invoiceAmt = round2(pay.invoiceTotal);
      const cashAmt = round2(pay.cashTotal);
      const showInvoice = calculated && invoiceAmt > 0;
      const showCash = calculated && cashAmt > 0;
      const invoiceToggleAttrs = showInvoice
        ? `data-toggle-paid="invoice" data-settlement-id="${s.id}" aria-label="Factuur ${flags.invoicePaid ? "betaald" : "open"}"`
        : `disabled aria-hidden="true" tabindex="-1"`;
      const cashToggleAttrs = showCash
        ? `data-toggle-paid="cash" data-settlement-id="${s.id}" aria-label="Cash ${flags.cashPaid ? "betaald" : "open"}"`
        : `disabled aria-hidden="true" tabindex="-1"`;
      const detailItems = [
        esc(formatDateNoWeekday(s.date)),
        `${(s.logIds||[]).length} logs`,
        formatDurationCompact(totalMinutes)
      ];
      if (logbookTotals.totalGreenUnits > 0){
        detailItems.push(`<span class="settlement-detail-item settlement-detail-item--green">Groen ${esc(String(formatQuickQty(logbookTotals.totalGreenUnits)))}</span>`);
      }
      if (logbookTotals.totalExtraProducts > 0){
        detailItems.push(`<span class="settlement-detail-item">Extra ${esc(String(formatQuickQty(logbookTotals.totalExtraProducts)))}</span>`);
      }

      return `
        <div class="item ${visual.accentClass}" data-open-settlement="${s.id}">
          <div class="settlement-card-grid">
            <div class="settlement-row-grid">
              <div class="item-main">
                <div class="item-title-row settlement-title-row">
                  <div class="item-title settlement-name" title="${esc(titleText)}">${esc(titleText)}</div>
                </div>
              </div>

              <div class="settlement-amount-group">
                <button class="amount-inline invoiceAmt ${flags.invoicePaid ? "is-paid" : "is-open"} ${showInvoice ? "" : "is-empty"}"
                        ${invoiceToggleAttrs}>
                  <span class="amount-inline-content mono tabular"><span class="amount-val">${showInvoice ? formatMoneyEUR0(invoiceAmt) : ""}</span></span>
                </button>
                <button class="amount-inline cashAmt ${flags.cashPaid ? "is-paid" : "is-open"} ${showCash ? "" : "is-empty"}"
                        ${cashToggleAttrs}>
                  <span class="amount-inline-content mono tabular"><span class="amount-val">${showCash ? formatMoneyEUR0(cashAmt) : ""}</span></span>
                </button>
              </div>
            </div>
            <div class="meta-text settlement-meta-row">${detailItems.join(" · ")}</div>
          </div>
        </div>
      `;
    }).join("");

  el.innerHTML = `
    <div class="stack">
      <div class="geld-header"><span class="geld-header-title">Afrekeningen</span></div>
      <div class="settlement-header-row mono tabular">
        <div class="settlement-header-left">${formatMoneyEUR0(totalNotCalculatedExVat)}</div>
        <div class="settlement-outstanding-breakdown">
          <span class="settlement-outstanding-col ${totalInvoiceOutstanding > 0 ? "is-open" : ""}">
            <span class="settlement-outstanding-content ${totalInvoiceOutstanding > 0 ? "" : "is-hidden"}">${invoiceIcon}<span>${totalInvoiceOutstanding > 0 ? formatMoneyEUR0(totalInvoiceOutstanding) : ""}</span></span>
          </span>
          <span class="settlement-outstanding-col ${totalCashOutstanding > 0 ? "is-open" : ""}">
            <span class="settlement-outstanding-content ${totalCashOutstanding > 0 ? "" : "is-hidden"}">${cashIcon}<span>${totalCashOutstanding > 0 ? formatMoneyEUR0(totalCashOutstanding) : ""}</span></span>
          </span>
        </div>
      </div>
      <div class="flat-list">${list || `<div class="meta-text" style="padding:8px 4px;">Nog geen afrekeningen.</div>`}</div>
    </div>
  `;

  el.querySelectorAll("[data-open-settlement]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("settlement", x.getAttribute("data-open-settlement")));
  });

  el.querySelectorAll("[data-toggle-paid]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();

      const id = btn.getAttribute("data-settlement-id");
      const kind = btn.getAttribute("data-toggle-paid");
      const s = state.settlements.find(x => x.id === id);
      if (!s) return;

      if (kind === "invoice") s.invoicePaid = !Boolean(s.invoicePaid);
      if (kind === "cash") s.cashPaid = !Boolean(s.cashPaid);

      syncSettlementStatus(s);
      saveState(state);
      renderSettlements();
    });
  });
}


// ---------- Meer tab ----------
function renderMeer(){
  const el = $("#tab-meer");
  el.innerHTML = `
    <div class="stack meer-layout"></div>
  `;
}

// ---------- Sheet rendering ----------
function renderSheet(){
  const active = currentView();
  const actions = $("#sheetActions");
  const body = $("#sheetBody");
  if (!actions || !body) return;
  actions.innerHTML = "";
  body.innerHTML = "";
  body.style.paddingBottom = "18px";
  clearStatusTabbar();
  clearDetailActionBar();
  setBottomBarHeights({ statusVisible: false });

  if (active.view === "customerDetail") renderCustomerSheet(active.id);
  if (active.view === "productDetail") renderProductSheet(active.id);
  if (active.view === "logDetail") renderLogSheet(active.id);
  if (active.view === "settlementDetail") renderSettlementSheet(active.id);
  if (active.view === "settlementLogOverview") renderSettlementLogOverviewSheet(active.id);
  if (active.view === "newLog") renderNewLogSheet();
  if (active.view === "customers") renderCustomersSheet();
  if (active.view === "products") renderProductsSheet();
  if (active.view === "settings") renderSettingsSheet();
  if (active.view === "settlementListOptions") renderSettlementListOptionsSheet();
}


function renderSettlementListOptionsSheet(){
  const body = $("#sheetBody");
  const prefs = {
    ...SETTLEMENT_LIST_DEFAULTS,
    ...(state.settlementList || {})
  };
  const hasStatus = (status)=> prefs.statusFilter.includes(status);

  body.innerHTML = `
    <div class="stack">
      <div class="card stack">
        <div class="item-title">Status</div>
        <button class="btn ${hasStatus("draft") ? "primary" : ""}" type="button" data-settlement-status="draft">Nog te berekenen</button>
        <button class="btn ${hasStatus("calculated") ? "primary" : ""}" type="button" data-settlement-status="calculated">Berekend</button>
        <button class="btn ${hasStatus("paid") ? "primary" : ""}" type="button" data-settlement-status="paid">Betaald</button>
      </div>

      <div class="card stack">
        <button class="btn ${prefs.onlyInvoices ? "primary" : ""}" type="button" id="toggleOnlyInvoices">Enkel facturen</button>
      </div>

      <div class="card stack">
        <div class="item-title">Sorteren op</div>
        <button class="btn ${prefs.sortKey === "date" ? "primary" : ""}" type="button" data-settlement-sortkey="date">Datum</button>
        <button class="btn ${prefs.sortKey === "invoiceNumber" ? "primary" : ""}" type="button" data-settlement-sortkey="invoiceNumber">Factuurnr</button>
        <button class="btn" type="button" id="toggleSettlementSortDir">${prefs.sortDir === "desc" ? "Nieuwste eerst" : "Oudste eerst"}</button>
      </div>
    </div>
  `;

  body.querySelectorAll("[data-settlement-status]").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      const status = btn.getAttribute("data-settlement-status");
      const selected = new Set((state.settlementList?.statusFilter || SETTLEMENT_LIST_DEFAULTS.statusFilter));
      if (selected.has(status)){
        if (selected.size <= 1) return;
        selected.delete(status);
      } else {
        selected.add(status);
      }
      state.settlementList = {
        ...SETTLEMENT_LIST_DEFAULTS,
        ...(state.settlementList || {}),
        statusFilter: [...selected]
      };
      saveState();
      renderSheet();
    });
  });

  $("#toggleOnlyInvoices")?.addEventListener("click", ()=>{
    state.settlementList = {
      ...SETTLEMENT_LIST_DEFAULTS,
      ...(state.settlementList || {}),
      onlyInvoices: !Boolean(state.settlementList?.onlyInvoices)
    };
    saveState();
    renderSheet();
  });

  body.querySelectorAll("[data-settlement-sortkey]").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      const sortKey = btn.getAttribute("data-settlement-sortkey");
      state.settlementList = {
        ...SETTLEMENT_LIST_DEFAULTS,
        ...(state.settlementList || {}),
        sortKey
      };
      saveState();
      renderSheet();
    });
  });

  $("#toggleSettlementSortDir")?.addEventListener("click", ()=>{
    state.settlementList = {
      ...SETTLEMENT_LIST_DEFAULTS,
      ...(state.settlementList || {}),
      sortDir: state.settlementList?.sortDir === "asc" ? "desc" : "asc"
    };
    saveState();
    renderSheet();
  });
}

function renderSheetKeepScroll(){
  const scroller =
    document.querySelector("#detailPage.active .page-inner")
    || document.querySelector("#detailPage .page-inner")
    || document.querySelector(".page.active .page-inner");
  const top = scroller ? scroller.scrollTop : 0;

  renderSheet();

  requestAnimationFrame(() => {
    const scroller2 =
      document.querySelector("#detailPage.active .page-inner")
      || document.querySelector("#detailPage .page-inner")
      || document.querySelector(".page.active .page-inner");
    if (!scroller2) return;
    scroller2.scrollTop = top;
    requestAnimationFrame(() => { scroller2.scrollTop = top; });
  });
}

function renderCustomersSheet(){
  const body = $("#sheetBody");
  const list = state.customers.map(c => `
    <div class="item" data-open-customer="${c.id}">
      <div class="item-main">
        <div class="item-title">${esc(c.nickname||c.name||"Klant")}</div>
        <div class="meta-text">${esc(c.address||"")}</div>
      </div>
    </div>
  `).join("");

  body.innerHTML = `
    <div class="stack">
      <div class="geld-header">
        <span class="geld-header-title">Klanten</span>
        <button class="btn" id="btnNewCustomer">Nieuwe klant</button>
      </div>
      <div class="flat-list">${list || `<div class="meta-text" style="padding:8px 4px;">Nog geen klanten.</div>`}</div>
    </div>
  `;

  body.querySelector("#btnNewCustomer")?.addEventListener("click", ()=>{
    const c = actions.addCustomer({ id: uid(), nickname:"", name:"", address:"", createdAt: now() });
    openSheet("customer", c.id);
  });

  body.querySelectorAll("[data-open-customer]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("customer", x.getAttribute("data-open-customer")));
  });
}

function renderProductsSheet(){
  const body = $("#sheetBody");
  const list = state.products.map(p => `
    <div class="item" data-open-product="${p.id}">
      <div class="item-main">
        <div class="item-title">${esc(p.name)}</div>
        <div class="meta-text">${esc(p.unit)} · ${fmtMoney(p.unitPrice)} · btw ${(Number(p.vatRate||0)*100).toFixed(0)}%</div>
      </div>
      <div class="amount-prominent">${fmtMoney(p.unitPrice)}</div>
    </div>
  `).join("");

  body.innerHTML = `
    <div class="stack">
      <div class="geld-header">
        <span class="geld-header-title">Producten</span>
        <button class="btn" id="btnNewProduct">Nieuw product</button>
      </div>
      <div class="flat-list">${list || `<div class="meta-text" style="padding:8px 4px;">Nog geen producten.</div>`}</div>
    </div>
  `;

  body.querySelector("#btnNewProduct")?.addEventListener("click", ()=>{
    const p = actions.addProduct({ id: uid(), name:"", unit:"keer", unitPrice:0, vatRate:0.21, defaultBucket:"invoice" });
    openSheet("product", p.id);
  });

  body.querySelectorAll("[data-open-product]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("product", x.getAttribute("data-open-product")));
  });
}

function renderSettingsSheet(){
  const body = $("#sheetBody");
  const demoCounts = {
    customers: state.customers.filter(c => c.demo).length,
    logs: state.logs.filter(l => l.demo).length,
    settlements: state.settlements.filter(a => a.demo).length,
  };

  body.innerHTML = `
    <div class="stack">
      <div class="card stack">
        <div class="item-title">Algemeen</div>
        <div class="row">
          <div style="flex:1; min-width:170px;">
            <label>Uurtarief</label>
            <input id="settingHourly" inputmode="decimal" value="${esc(String(state.settings.hourlyRate ?? 38))}" />
          </div>
          <div style="flex:1; min-width:170px;">
            <label>BTW %</label>
            <input id="settingVat" inputmode="decimal" value="${esc(String(round2(Number(state.settings.vatRate || 0) * 100)))}" />
          </div>
        </div>
        <button class="btn primary" id="saveSettings">Opslaan</button>
      </div>

      <div class="card stack">
        <div class="item-title">Demo data</div>
        <div class="meta-text">Demo records: klanten ${demoCounts.customers} · logs ${demoCounts.logs} · afrekeningen ${demoCounts.settlements}</div>
        <button class="btn" id="fillDemoBtn">Vul demo data (2 jaar)</button>
        <button class="btn danger" id="clearDemoBtn">Wis demo data</button>
      </div>

      <div class="card stack">
        <div class="item-title">Geavanceerd</div>
        <button class="btn danger" id="resetAllBtn">Reset alles</button>
      </div>

      <div class="card stack">
        <div class="item-title">Backup & Herstel</div>
        <div class="meta-text">Maak een reservekopie van je volledige lokale data of herstel een eerdere backup.</div>
        <div class="row">
          <button class="btn primary" id="backupExportBtn">Backup downloaden</button>
          <button class="btn" id="backupImportBtn">Backup importeren</button>
          <input id="backupImportInput" type="file" accept=".json,application/json" class="hidden" />
        </div>
        <button class="btn danger" id="backupWipeBtn">Alles wissen</button>
        <div class="meta-text" style="color:rgba(255,77,77,.92);">Let op: hiermee verwijder je alle klanten, werklogs en facturen permanent.</div>
        <div class="meta-text backup-feedback ${state.ui?.backupFeedback?.type === "error" ? "is-error" : "is-success"}" id="backupFeedback">${esc(state.ui?.backupFeedback?.text || "")}</div>
      </div>
    </div>
  `;

  // Re-attach settings event handlers
  _attachSettingsHandlers();
}

function renderNewLogSheet(){
  const active = state.activeLogId ? state.logs.find(l => l.id === state.activeLogId) : null;
  const customerOptions = state.customers.map(c => `<option value="${c.id}">${esc(c.nickname||c.name||"Klant")}</option>`).join("");

  $("#sheetTitle").textContent = "Nieuwe werklog";
  $("#sheetBody").innerHTML = `
    <div class="stack">
      ${active ? `
      <div class="card stack">
        <div class="item-title">Actieve werklog</div>
        <div class="small mono">${esc(cname(active.customerId))} • gestart ${fmtClock(active.createdAt)}</div>
        <button class="btn" id="btnOpenActiveFromNew">Open actieve werklog</button>
      </div>
      ` : ""}
      <div class="card stack">
        <div>
          <label>Klant</label>
          <select id="startCustomer">${customerOptions || `<option value="">(Geen klanten)</option>`}</select>
        </div>
        <button class="btn primary" id="btnStartFromSheet" ${(state.customers.length && !active) ? "" : "disabled"}>Start werk</button>
        ${state.customers.length ? "" : `<div class="small">Maak eerst een klant aan.</div>`}
      </div>
    </div>
  `;

  $("#btnStartFromSheet")?.addEventListener("click", ()=>{
    const cid = $("#startCustomer")?.value;
    startWorkLog(cid);
  });
  $("#btnOpenActiveFromNew")?.addEventListener("click", ()=>{
    if (!active) return;
    openSheet("log", active.id);
  });
}

function renderCustomerSheet(id){
  const c = getCustomer(id);
  if (!c){ closeSheet(); return; }
  const isEditing = ui.customerDetailEditingId === c.id;
  if (isEditing && !ui.customerDetailDrafts[c.id]){
    ui.customerDetailDrafts[c.id] = {
      nickname: c.nickname || "",
      name: c.name || "",
      address: c.address || ""
    };
  }
  const draft = ui.customerDetailDrafts[c.id] || {
    nickname: c.nickname || "",
    name: c.name || "",
    address: c.address || ""
  };

  $("#sheetTitle").textContent = "Klant";

  const logs = state.logs.filter(l => l.customerId === c.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const settlements = state.settlements.filter(s => s.customerId === c.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  $("#sheetActions").innerHTML = "";

  setDetailActionBar({
    className: "client-detail-actionbar",
    html: `
      <div class="client-detail-actionbar-left">
        ${isEditing ? `
          <button class="detail-delete-toggle" id="delCustomer" type="button" aria-label="Klant verwijderen" title="Klant verwijderen">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18" stroke-linecap="round"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v7M14 10v7" stroke-linecap="round"/></svg>
            <span>Verwijder</span>
          </button>
        ` : ""}
      </div>
      <div class="client-detail-actionbar-right">
        <button class="detail-edit-toggle" id="toggleClientEdit" type="button" aria-label="${isEditing ? "Klant opslaan" : "Klant bewerken"}" title="${isEditing ? "Klant opslaan" : "Klant bewerken"}">
          ${isEditing
            ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke-linejoin="round"/></svg>`}
        </button>
      </div>
    `
  });
  $("#sheetBody").style.paddingBottom = "calc(var(--detail-actionbar-height) + 18px)";

  $("#sheetBody").innerHTML = `
    <div class="stack client-detail-view">
      <div class="card stack">
        <div class="item-title">Gegevens</div>
        ${isEditing ? `
          <div>
            <label>Bijnaam</label>
            <input id="cNick" value="${esc(draft.nickname)}" />
          </div>
        ` : ""}
        <div class="row">
          <div style="flex:1; min-width:220px;">
            <label>Naam</label>
            ${isEditing ? `<input id="cName" value="${esc(draft.name)}" />` : `<div class="item-sub">${esc(c.name || "-")}</div>`}
          </div>
        </div>
        <div>
          <label>Adres</label>
          ${isEditing ? `<input id="cAddr" value="${esc(draft.address)}" />` : `<div class="item-sub">${esc(c.address || "-")}</div>`}
        </div>
      </div>

      <div class="card stack">
        <div class="item-title">Werklogs</div>
        <div class="list">
          ${logs.slice(0,20).map(l=>{
            const cls = statusClassFromStatus(getWorkLogStatus(l.id));
            return `
              <div class="item ${cls}" data-open-log="${l.id}">
                <div class="item-main">
                  <div class="item-title">${esc(l.date)}</div>
                  <div class="item-sub mono">Werk ${durMsToHM(sumWorkMs(l))} • Producten ${fmtMoney(sumItemsAmount(l))}</div>
                </div>
                <div class="item-right"><span class="badge">open</span></div>
              </div>
            `;
          }).join("") || `<div class="small">Geen logs.</div>`}
        </div>
      </div>

      <div class="card stack">
        <div class="item-title">Afrekeningen</div>
        <div class="list">
          ${settlements.slice(0,20).map(s=>{
            const cls = settlementColorClass(s);
            const totInv = bucketTotals(s.lines,"invoice");
            const totCash = bucketTotals(s.lines,"cash");
            const grand = round2(totInv.total + totCash.subtotal);
            return `
              <div class="item ${cls}" data-open-settlement="${s.id}">
                <div class="item-main">
                  <div class="item-title">${esc(formatDatePretty(s.date))}</div>
                  <div class="item-sub mono tabular">logs ${(s.logIds||[]).length} • totaal ${formatMoneyEUR(grand)}</div>
                </div>
              </div>
            `;
          }).join("") || `<div class="small">Geen afrekeningen.</div>`}
        </div>
      </div>
    </div>
  `;

  const syncDraft = ()=>{
    if (!ui.customerDetailDrafts[c.id]) return;
    ui.customerDetailDrafts[c.id].nickname = ($("#cNick")?.value || "").trim();
    ui.customerDetailDrafts[c.id].name = ($("#cName")?.value || "").trim();
    ui.customerDetailDrafts[c.id].address = ($("#cAddr")?.value || "").trim();
  };

  if (isEditing){
    ["#cNick", "#cName", "#cAddr"].forEach((selector)=>{
      $(selector)?.addEventListener("input", syncDraft);
    });
  }

  $("#toggleClientEdit")?.addEventListener("click", ()=>{
    if (!isEditing){
      ui.customerDetailEditingId = c.id;
      ui.customerDetailDrafts[c.id] = {
        nickname: c.nickname || "",
        name: c.name || "",
        address: c.address || ""
      };
      render();
      return;
    }

    syncDraft();
    const currentDraft = ui.customerDetailDrafts[c.id] || {};
    const result = actions.updateCustomer(c.id, {
      nickname: (currentDraft.nickname || "").trim(),
      name: (currentDraft.name || "").trim(),
      address: (currentDraft.address || "").trim()
    });
    if (result?.error === "duplicate_nickname"){
      alert("Bijnaam bestaat al. Kies een unieke bijnaam.");
      return;
    }
    ui.customerDetailEditingId = null;
    delete ui.customerDetailDrafts[c.id];
    render();
  });

  $("#delCustomer")?.addEventListener("click", ()=>{
    const hasLogs = state.logs.some(l => l.customerId === c.id);
    const hasSet = state.settlements.some(s => s.customerId === c.id);
    if (hasLogs || hasSet){ alert("Kan niet verwijderen: klant heeft logs/afrekeningen."); return; }
    if (!confirmDelete(`Klant: ${c.nickname||c.name||""}`)) return;
    actions.deleteCustomer(c.id);
    closeSheet();
  });

  $("#sheetBody").querySelectorAll("[data-open-log]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("log", x.getAttribute("data-open-log")));
  });
  $("#sheetBody").querySelectorAll("[data-open-settlement]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("settlement", x.getAttribute("data-open-settlement")));
  });
}

function renderProductSheet(id){
  const p = getProduct(id);
  if (!p){ closeSheet(); return; }
  const isEditing = ui.productDetailEditingId === p.id;
  if (isEditing && !ui.productDetailDrafts[p.id]){
    ui.productDetailDrafts[p.id] = {
      name: p.name || "",
      unit: p.unit || "keer",
      unitPrice: String(p.unitPrice ?? 0),
      vatRate: String(p.vatRate ?? 0.21),
      defaultBucket: p.defaultBucket || "invoice"
    };
  }
  const draft = ui.productDetailDrafts[p.id] || {
    name: p.name || "",
    unit: p.unit || "keer",
    unitPrice: String(p.unitPrice ?? 0),
    vatRate: String(p.vatRate ?? 0.21),
    defaultBucket: p.defaultBucket || "invoice"
  };

  $("#sheetTitle").textContent = "Product";
  $("#sheetActions").innerHTML = `<button class="btn danger" id="delProduct">Verwijder</button>`;

  setDetailActionBar({
    className: "product-detail-actionbar",
    html: `
      <button class="detail-edit-toggle" id="toggleProductEdit" type="button" aria-label="${isEditing ? "Product opslaan" : "Product bewerken"}" title="${isEditing ? "Product opslaan" : "Product bewerken"}">
        ${isEditing
          ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke-linejoin="round"/></svg>`}
      </button>
    `
  });
  $("#sheetBody").style.paddingBottom = "calc(var(--detail-actionbar-height) + 18px)";

  const usedInLogs = state.logs.filter(l => (l.items||[]).some(it => it.productId === p.id)).slice(0,10);
  const usedInSet = state.settlements.filter(s => (s.lines||[]).some(li => li.productId === p.id)).slice(0,10);

  $("#sheetBody").innerHTML = `
    <div class="stack product-detail-view">
      <div class="card stack">
        <div class="item-title">Gegevens</div>
        <div class="row">
          <div style="flex:2; min-width:220px;">
            <label>Naam</label>
            ${isEditing ? `<input id="pName" value="${esc(draft.name)}" />` : `<div class="item-sub">${esc(p.name || "-")}</div>`}
          </div>
          <div style="flex:1; min-width:140px;">
            <label>Eenheid</label>
            ${isEditing ? `<input id="pUnit" value="${esc(draft.unit)}" />` : `<div class="item-sub">${esc(p.unit || "-")}</div>`}
          </div>
        </div>
        <div class="row">
          <div style="flex:1; min-width:160px;">
            <label>Prijs per eenheid</label>
            ${isEditing ? `<input id="pPrice" inputmode="decimal" value="${esc(draft.unitPrice)}" />` : `<div class="item-sub mono">${esc(String(p.unitPrice ?? 0))}</div>`}
          </div>
          <div style="flex:1; min-width:160px;">
            <label>BTW (bv 0.21)</label>
            ${isEditing ? `<input id="pVat" inputmode="decimal" value="${esc(draft.vatRate)}" />` : `<div class="item-sub mono">${esc(String(p.vatRate ?? 0.21))}</div>`}
          </div>
          <div style="flex:1; min-width:160px;">
            <label>Default</label>
            ${isEditing
              ? `<select id="pBucket"><option value="invoice" ${draft.defaultBucket==="invoice"?"selected":""}>factuur</option><option value="cash" ${draft.defaultBucket==="cash"?"selected":""}>cash</option></select>`
              : `<div class="item-sub">${esc(p.defaultBucket === "cash" ? "cash" : "factuur")}</div>`}
          </div>
        </div>
      </div>

      <div class="card stack">
        <div class="item-title">Gebruikt in logs (recent)</div>
        <div class="list">
          ${usedInLogs.map(l=>`
            <div class="item" data-open-log="${l.id}">
              <div class="item-main">
                <div class="item-title">${esc(cname(l.customerId))}</div>
                <div class="item-sub mono">${esc(l.date)} • ${durMsToHM(sumWorkMs(l))}</div>
              </div>
              <div class="item-right"><span class="badge">open</span></div>
            </div>
          `).join("") || `<div class="small">Nog niet gebruikt.</div>`}
        </div>
      </div>

      <div class="card stack">
        <div class="item-title">Gebruikt in afrekeningen (recent)</div>
        <div class="list">
          ${usedInSet.map(s=>`
            <div class="item" data-open-settlement="${s.id}">
              <div class="item-main">
                <div class="item-title">${esc(cname(s.customerId))}</div>
                <div class="item-sub mono">${esc(s.date)} • ${statusLabelNL(s.status)}</div>
              </div>
              <div class="item-right"><span class="badge">open</span></div>
            </div>
          `).join("") || `<div class="small">Nog niet gebruikt.</div>`}
        </div>
      </div>
    </div>
  `;

  const syncDraft = ()=>{
    if (!ui.productDetailDrafts[p.id]) return;
    ui.productDetailDrafts[p.id].name = ($("#pName")?.value || "").trim();
    ui.productDetailDrafts[p.id].unit = ($("#pUnit")?.value || "").trim();
    ui.productDetailDrafts[p.id].unitPrice = ($("#pPrice")?.value || "").trim();
    ui.productDetailDrafts[p.id].vatRate = ($("#pVat")?.value || "").trim();
    ui.productDetailDrafts[p.id].defaultBucket = $("#pBucket")?.value || "invoice";
  };

  if (isEditing){
    ["#pName", "#pUnit", "#pPrice", "#pVat", "#pBucket"].forEach((selector)=>{
      $(selector)?.addEventListener("input", syncDraft);
      $(selector)?.addEventListener("change", syncDraft);
    });
  }

  $("#toggleProductEdit")?.addEventListener("click", ()=>{
    if (!isEditing){
      ui.productDetailEditingId = p.id;
      ui.productDetailDrafts[p.id] = {
        name: p.name || "",
        unit: p.unit || "keer",
        unitPrice: String(p.unitPrice ?? 0),
        vatRate: String(p.vatRate ?? 0.21),
        defaultBucket: p.defaultBucket || "invoice"
      };
      render();
      return;
    }

    syncDraft();
    const currentDraft = ui.productDetailDrafts[p.id] || {};
    actions.updateProduct(p.id, {
      name: (currentDraft.name || "").trim(),
      unit: (currentDraft.unit || "").trim() || "keer",
      unitPrice: Number(String(currentDraft.unitPrice || "0").replace(",", ".") || "0"),
      vatRate: Number(String(currentDraft.vatRate || "0.21").replace(",", ".") || "0.21"),
      defaultBucket: currentDraft.defaultBucket || "invoice"
    });
    ui.productDetailEditingId = null;
    delete ui.productDetailDrafts[p.id];
    render();
  });

  $("#delProduct").onclick = ()=>{
    const used = state.logs.some(l => (l.items||[]).some(it => it.productId === p.id))
      || state.settlements.some(s => (s.lines||[]).some(li => li.productId === p.id));
    if (used){ alert("Kan niet verwijderen: product is gebruikt."); return; }
    if (!confirmDelete(`Product: ${p.name}`)) return;
    actions.deleteProduct(p.id);
    closeSheet();
  };

  $("#sheetBody").querySelectorAll("[data-open-log]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("log", x.getAttribute("data-open-log")));
  });
  $("#sheetBody").querySelectorAll("[data-open-settlement]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("settlement", x.getAttribute("data-open-settlement")));
  });
}

function renderLogSheet(id){
  const log = state.logs.find(l => l.id === id);
  if (!log){ closeSheet(); return; }
  $("#sheetTitle").textContent = "Werklog";
  const linkedAfrekeningId = getLinkedAfrekeningIdForLog(log);
  const linkedAfrekening = getAfrekeningById(linkedAfrekeningId);
  const af = linkedAfrekening || settlementForLog(log.id);
  const locked = false;
  $("#sheetActions").innerHTML = "";

  const settlementOptions = buildSettlementSelectOptions(log.customerId, af?.id);

  const visual = getLogVisualState(log);
  const statusPillClass = visual.state === "paid" ? "pill-paid" : visual.state === "calculated" ? "pill-calc" : visual.state === "linked" ? "pill-open" : "pill-neutral";
  const statusLabel = visual.state === "free" ? "vrij" : visual.state === "linked" ? "gekoppeld" : visual.state === "calculated" ? "berekend" : "betaald";
  const isEditing = state.ui.editLogId === log.id;

  function renderSegments(currentLog, editing){
    const segments = currentLog.segments || [];

    return `
      <section class="compact-section stack">
        ${editing ? `<div class="row row-actions-end"><button class="btn" id="addSegment" type="button">+ segment</button></div>` : ""}
        <div class="compact-lines">
          ${segments.map(s=>{
            const start = s.start ? fmtClock(s.start) : "…";
            const end = s.end ? fmtClock(s.end) : "…";
            const segmentDuration = calculateDuration(start, end);
            if (!editing){
              return `<div class="segment-row segment-row-static mono"><div class="segment-row-main"><span>${s.type === "break" ? "Pauze" : "Werk"} ${start}–${end}</span><span class="segment-duration">${segmentDuration}</span></div></div>`;
            }
            const isOpen = ui.logDetailSegmentEditId === s.id;
            return `
              <div class="segment-row ${isOpen ? "is-open" : ""}">
                <button class="segment-row-btn mono" type="button" data-toggle-segment="${s.id}">
                  <span class="segment-row-main"><span>${s.type === "break" ? "Pauze" : "Werk"} ${start}–${end}</span><span class="segment-duration">${segmentDuration}</span></span>
                </button>
                ${isOpen ? `
                  <div class="segment-editor" data-segment-editor="${s.id}">
                    <div class="segment-grid">
                      <label>Start<input type="time" value="${esc(fmtTimeInput(s.start))}" data-edit-segment="${s.id}" data-field="start" /></label>
                      <label>Einde<input type="time" value="${esc(fmtTimeInput(s.end))}" data-edit-segment="${s.id}" data-field="end" /></label>
                      <label>Type
                        <select data-edit-segment="${s.id}" data-field="type">
                          <option value="work" ${s.type === "work" ? "selected" : ""}>work</option>
                          <option value="break" ${s.type === "break" ? "selected" : ""}>break</option>
                        </select>
                      </label>
                    </div>
                    <button class="iconbtn iconbtn-sm danger" type="button" data-del-segment="${s.id}" title="Verwijder segment" aria-label="Verwijder segment">
                      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 6h18" stroke-linecap="round"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                ` : ""}
              </div>
            `;
          }).join("") || `<div class="small">Geen segmenten.</div>`}
        </div>
      </section>
    `;
  }

  function renderLinkedAfrekeningRow(settlement){
    if (!settlement) return "";
    const metaParts = [];
    if (settlement.date) metaParts.push(formatDatePretty(settlement.date));
    metaParts.push(`#${String(settlement.id || "").slice(0, 8)}`);

    return `
      <section class="compact-section linked-afrekening-section">
        <button class="linked-afrekening-row" type="button" id="openLinkedAfrekening" aria-label="Open gekoppelde afrekening">
          <span class="linked-afrekening-left">
            <svg class="icon linked-afrekening-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M10.6 13.4l2.8-2.8" stroke-linecap="round"/><path d="M7.8 16.2l-1.4 1.4a3 3 0 1 1-4.2-4.2l1.4-1.4a3 3 0 0 1 4.2 0" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.2 7.8l1.4-1.4a3 3 0 1 1 4.2 4.2l-1.4 1.4a3 3 0 0 1-4.2 0" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>
              <span class="linked-afrekening-title">Afrekening</span>
              <span class="linked-afrekening-meta">${esc(metaParts.join(" · "))}</span>
            </span>
          </span>
          <span class="linked-afrekening-chevron" aria-hidden="true">›</span>
        </button>
      </section>
    `;
  }

  function renderLogHeader(currentLog, editing){
    const prettyDate = formatLogDatePretty(currentLog.date || "");
    const startTime = getStartTime(currentLog);
    const dateInputValue = formatLocalYMD(new Date(currentLog.date));
    const dateHeader = editing
      ? `
        <div class="log-detail-date-edit" role="group" aria-label="Datum bewerken">
          <svg class="icon log-detail-date-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 11h18" stroke-linecap="round"></path></svg>
          <input id="logDateInput" class="log-detail-date-input" type="date" value="${esc(dateInputValue)}" max="${formatLocalYMD(new Date())}" />
        </div>
      `
      : `<div class="log-detail-header-main">${esc(prettyDate || currentLog.date || "—")}</div>`;

    return `
      <section class="compact-section log-detail-header">
        ${dateHeader}
        <div class="log-detail-header-sub mono">${esc(startTime)}</div>
      </section>
    `;
  }

  function onTapLinkedAfrekening(afrekeningId){
    const settlement = getAfrekeningById(afrekeningId);
    if (!settlement) return;
    openSheet("settlement", settlement.id);
  }

  const linkedAfrekeningMetaParts = [];
  if (linkedAfrekening?.date) linkedAfrekeningMetaParts.push(formatDatePretty(linkedAfrekening.date));
  if (linkedAfrekening?.id) linkedAfrekeningMetaParts.push(`#${String(linkedAfrekening.id).slice(0, 8)}`);

  $("#sheetBody").innerHTML = `
    <div class="stack log-detail-compact">
      ${renderLogHeader(log, isEditing)}
      ${renderSegments(log, isEditing)}

      <section class="compact-section stack">
        <div class="row space">
          <div class="item-title">Producten</div>
        </div>
        <div class="log-lines-wrap">
          ${renderProducts(log, { context: "log", isEditing })}
        </div>
      </section>

      <section class="compact-section">
        <label>Notitie</label>
        <input id="logNote" value="${esc(log.note||"")}" />
      </section>

      <section class="compact-section log-detail-footer-actions">
        <span class="pill ${statusPillClass}">${statusLabel}</span>
        ${isEditing ? `<button class="btn danger" id="delLog">Verwijder</button>` : ""}
      </section>
    </div>
  `;

  setStatusTabbar(`
    <div class="status-log-link-wrap">
      <button class="statusbtn status-link status-icon-chip" id="btnLogSettlementPicker" type="button" aria-label="Koppel aan afrekening" title="Koppel aan afrekening">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10.6 13.4l2.8-2.8" stroke-linecap="round"/><path d="M7.8 16.2l-1.4 1.4a3 3 0 1 1-4.2-4.2l1.4-1.4a3 3 0 0 1 4.2 0" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.2 7.8l1.4-1.4a3 3 0 1 1 4.2 4.2l-1.4 1.4a3 3 0 0 1-4.2 0" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <select id="logSettlementPicker" class="status-picker-select" ${locked ? "disabled" : ""} aria-label="Afrekening koppelen">
        ${settlementOptions}
      </select>
    </div>
    ${linkedAfrekening?.id ? `
      <button class="status-linked-chip" id="btnOpenLinkedAfrekeningFromStatus" type="button" aria-label="Open gekoppelde afrekening" title="Open gekoppelde afrekening">
        <span class="title">Afrekening</span>
        <span class="meta mono">${esc(linkedAfrekeningMetaParts.join(" · "))}</span>
      </button>
    ` : ""}
    <div style="flex:1"></div>
    <button class="iconbtn" id="btnLogEdit" type="button" aria-label="${isEditing ? "Gereed" : "Bewerk"}" title="${isEditing ? "Gereed" : "Bewerk"}">
      ${isEditing
        ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
        : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L3.8 17.5z"></path><path d="M14 5l5 5"></path></svg>`}
    </button>
  `);
  document.getElementById("btnLogEdit")?.addEventListener("click", () => {
    toggleEditLog(id);
    renderSheet();
  });
  document.getElementById("btnLogSettlementPicker")?.addEventListener("click", ()=>{
    if (locked) return;
    openAfrekeningPickerForLog(log.id, { anchorEl: document.getElementById("logSettlementPicker") });
  });
  document.getElementById("btnOpenLinkedAfrekeningFromStatus")?.addEventListener("click", ()=>{
    if (!linkedAfrekening?.id) return;
    onTapLinkedAfrekening(linkedAfrekening.id);
  });

  // wire (autosave)
  $("#logNote").addEventListener("change", ()=>{
    actions.editLog(log.id, (draft)=>{
      draft.note = ($("#logNote").value||"").trim();
    });
  });

  $("#logDateInput")?.addEventListener("change", (event)=>{
    const nextDate = event.target?.value;
    if (!nextDate) return;
    if (nextDate > formatLocalYMD(new Date())) return;

    actions.editLog(log.id, (draft)=>{
      setLogDay(draft, nextDate);
    });
  });


  $("#addSegment")?.addEventListener("click", ()=>{
    const segId = uid();
    actions.editLog(log.id, (draft)=>{
      draft.segments = draft.segments || [];
      draft.segments.push({ id: segId, type: "work", start: null, end: null });
    });
    ui.logDetailSegmentEditId = segId;
    renderSheet();
  });

  $("#sheetBody").querySelectorAll("[data-toggle-segment]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const segmentId = btn.getAttribute("data-toggle-segment");
      ui.logDetailSegmentEditId = ui.logDetailSegmentEditId === segmentId ? null : segmentId;
      renderSheet();
    });
  });

  $("#sheetBody").querySelectorAll("[data-edit-segment]").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const segmentId = inp.getAttribute("data-edit-segment");
      const field = inp.getAttribute("data-field");
      const seg = (log.segments||[]).find(x => x.id === segmentId);
      if (!seg) return;

      if (field === "type"){
        if (!["work", "break"].includes(inp.value)){
          alert('Type moet "work" of "break" zijn.');
          renderSheet();
          return;
        }
      }

      if (field === "start" || field === "end"){
        const nextStart = field === "start" ? parseLogTimeToMs(log.date, inp.value) : seg.start;
        const nextEnd = field === "end" ? parseLogTimeToMs(log.date, inp.value) : seg.end;
        if (nextStart == null || nextEnd == null || !(nextEnd > nextStart)){
          alert("Segment ongeldig: einde moet later zijn dan start.");
          renderSheet();
          return;
        }
      }

      actions.editLog(log.id, (draft)=>{
        const target = (draft.segments||[]).find(x => x.id === segmentId);
        if (!target) return;
        if (field === "type") target.type = inp.value;
        if (field === "start" || field === "end"){
          target.start = field === "start" ? parseLogTimeToMs(draft.date, inp.value) : target.start;
          target.end = field === "end" ? parseLogTimeToMs(draft.date, inp.value) : target.end;
        }
      });
      renderSheet();
    });
  });

  $("#sheetBody").querySelectorAll("[data-del-segment]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const segmentId = btn.getAttribute("data-del-segment");
      if (!confirmDelete("Segment verwijderen")) return;
      actions.editLog(log.id, (draft)=>{
        draft.segments = (draft.segments||[]).filter(s => s.id !== segmentId);
      });
      if (ui.logDetailSegmentEditId === segmentId) ui.logDetailSegmentEditId = null;
      renderSheet();
    });
  });

  if (isEditing){
    $("#sheetBody").querySelectorAll("[data-del-log-item]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const itemId = btn.getAttribute("data-del-log-item");
        if (!confirmDelete("Item verwijderen")) return;
        actions.editLog(log.id, (draft)=>{
          draft.items = (draft.items||[]).filter(it => it.id !== itemId);
        });
        renderSheet();
      });
    });

    $("#sheetBody").querySelectorAll("[data-edit-log-item]").forEach(inp=>{
      inp.addEventListener("change", ()=>{
        const itemId = inp.getAttribute("data-edit-log-item");
        const field = inp.getAttribute("data-field");
        const it = (log.items||[]).find(x => x.id === itemId);
        if (!it) return;
        actions.editLog(log.id, (draft)=>{
          const target = (draft.items||[]).find(x => x.id === itemId);
          if (!target) return;
          if (field === "qty") target.qty = inp.value === "" ? null : Number(String(inp.value).replace(",", ".") || "0");
          if (field === "unitPrice") target.unitPrice = inp.value === "" ? null : Number(String(inp.value).replace(",", ".") || "0");
          if (field === "productId"){
            target.productId = inp.value;
            const p = getProduct(inp.value);
            if (p && (target.unitPrice == null || target.unitPrice === 0)) target.unitPrice = Number(p.unitPrice||0);
          }
        });
        renderSheet();
      });
    });

    $("#addProductItem")?.addEventListener("click", ()=>{
      const nextProduct = (state.products || []).find(product => isOtherProduct(product)) || null;
      if (!nextProduct) return;
      actions.editLog(log.id, (draft)=>{
        draft.items = draft.items || [];
        draft.items.push({ id: uid(), productId: nextProduct.id, qty: null, unitPrice: Number(nextProduct.unitPrice||0), note:"" });
      });
      renderSheet();
    });
  }

  $("#sheetBody").querySelectorAll("[data-green-qty-step]").forEach(btn=>{
    const baseStep = Number(btn.getAttribute("data-green-qty-step") || "0");
    bindStepButton(
      btn,
      ()=>{
        adjustLogGreenQty(log.id, baseStep);
        renderSheet();
      },
      ()=>{
        adjustLogGreenQty(log.id, baseStep > 0 ? 0.5 : -0.5);
        renderSheet();
      }
    );
  });

  $("#logSettlementPicker").onchange = ()=>{
    if (locked) return;
    const v = $("#logSettlementPicker").value;
    actions.linkLogToSettlement(log.id, v);
    renderSheet();
  };

  $("#delLog")?.addEventListener("click", ()=>{
    if (state.activeLogId === log.id){ alert("Stop eerst je actieve log."); return; }
    if (af){ alert("Ontkoppel eerst van afrekening (of verwijder afrekening)."); return; }
    if (!confirmDelete(`Werklog ${log.date} — ${cname(log.customerId)}`)) return;
    actions.deleteLog(log.id);
    closeSheet();
  });
}

function renderProducts(log, { context = "log", isEditing = false } = {}){
  if (context !== "log") return renderLogItems(log);

  const { greenItemQty, otherItems } = splitLogItems(log);
  const productOptions = state.products
    .filter(product => isOtherProduct(product))
    .map(p => `<option value="${p.id}">${esc(p.name)}${p.unit ? ` (${esc(p.unit)})` : ""}</option>`)
    .join("");

  const otherSubtotal = round2(otherItems.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0));

  const otherRowsEdit = otherItems.map(it=>{
    const productId = isOtherProduct(it) ? it.productId : state.products.find(product => isOtherProduct(product))?.id || "";
    const qtyValue = it.qty == null ? "" : String(it.qty);
    const unitPriceValue = it.unitPrice == null ? "" : String(it.unitPrice);
    return `
      <div class="log-item-row log-item-row-other">
        <div class="log-item-row-top">
          <select class="settlement-cell-input" data-edit-log-item="${it.id}" data-field="productId">
            ${productOptions.replace(`value="${productId}"`, `value="${productId}" selected`)}
          </select>
          <button class="iconbtn settlement-trash" data-del-log-item="${it.id}" title="Verwijder">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6l1 16h10l1-16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="log-item-row-bottom">
          <div class="log-item-cell">
            <label>qty</label>
            <input class="settlement-cell-input num" data-edit-log-item="${it.id}" data-field="qty" inputmode="decimal" value="${esc(qtyValue)}" />
          </div>
          <div class="log-item-cell">
            <label>€/eenheid</label>
            <input class="settlement-cell-input num" data-edit-log-item="${it.id}" data-field="unitPrice" inputmode="decimal" value="${esc(unitPriceValue)}" />
          </div>
          <div class="log-item-total num mono">${fmtMoney((Number(it.qty)||0)*(Number(it.unitPrice)||0))}</div>
        </div>
      </div>
    `;
  }).join("");

  const otherRowsCompact = otherItems.map(it=>{
    const qty = Number(it.qty) || 0;
    const total = round2(qty * (Number(it.unitPrice) || 0));
    return `
      <div class="log-other-row-compact">
        <span>${esc(pname(it.productId))}</span>
        <span class="mono tabular">${esc(String(round2(qty)))}${total > 0 ? ` <span class="log-other-meta">· ${fmtMoney(total)}</span>` : ""}</span>
      </div>
    `;
  }).join("");

  const showOtherSection = isEditing || otherItems.length > 0;

  return `
    <div class="log-items-list log-items-list-minimal">
      <div class="log-green-row green-row no-select">
        <span class="log-green-icon" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>
        </span>
        <div class="log-green-qty mono tabular">${esc(String(greenItemQty))}</div>
        <div class="log-green-controls">
          <button class="iconbtn iconbtn-sm" type="button" data-green-qty-step="-1" aria-label="Groen min">−</button>
          <button class="iconbtn iconbtn-sm" type="button" data-green-qty-step="1" aria-label="Groen plus">+</button>
        </div>
      </div>
      ${showOtherSection ? `
        <div class="log-other-items-wrap">
          <div class="log-other-head">
            <div class="item-sub">Andere producten</div>
            ${isEditing && productOptions ? `<button class="btn" id="addProductItem" type="button">+ Extra kost</button>` : ""}
          </div>
          ${isEditing ? `
            ${otherRowsEdit}
            <div class="item-sub mono">Subtotaal ${fmtMoney(otherSubtotal)}</div>
          ` : `${otherRowsCompact}`}
        </div>
      ` : ""}
    </div>
  `;
}

function renderLogItems(log){
  const productOptions = state.products
    .map(p => `<option value="${p.id}">${esc(p.name)}${p.unit ? ` (${esc(p.unit)})` : ""}</option>`)
    .join("");

  const rows = (log.items||[]).map(it=>{
    const productId = it.productId || state.products[0]?.id || "";
    const qtyValue = it.qty == null ? "" : String(it.qty);
    const unitPriceValue = it.unitPrice == null ? "" : String(it.unitPrice);
    return `
      <div class="log-item-row">
        <div class="log-item-row-top">
          <select class="settlement-cell-input" data-edit-log-item="${it.id}" data-field="productId">
            ${productOptions.replace(`value="${productId}"`, `value="${productId}" selected`)}
          </select>
          <button class="iconbtn settlement-trash" data-del-log-item="${it.id}" title="Verwijder">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6l1 16h10l1-16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="log-item-row-bottom">
          <div class="log-item-cell">
            <label>qty</label>
            <input class="settlement-cell-input num" data-edit-log-item="${it.id}" data-field="qty" inputmode="decimal" value="${esc(qtyValue)}" />
          </div>
          <div class="log-item-cell">
            <label>€/eenheid</label>
            <input class="settlement-cell-input num" data-edit-log-item="${it.id}" data-field="unitPrice" inputmode="decimal" value="${esc(unitPriceValue)}" />
          </div>
          <div class="log-item-total num mono">${fmtMoney((Number(it.qty)||0)*(Number(it.unitPrice)||0))}</div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="log-items-list">
      ${rows || `<div class="small">Nog geen producten.</div>`}
      <button class="btn" id="addProductItem" type="button">+ Product</button>
    </div>
  `;
}

function fmtDateShort(isoDate) {
  const [y, m, d] = isoDate.split("-");
  const months = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function buildSettlementSelectOptions(customerId, currentSettlementId){
  const options = [];
  options.push(`<option value="none"${!currentSettlementId?" selected":""}>Niet gekoppeld</option>`);
  const list = state.settlements
    .filter(s => s.customerId === customerId && (s.id === currentSettlementId || !isSettlementPaid(s)))
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  for (const s of list){
    const label = `${fmtDateShort(s.date)} — ${statusLabelNL(s.status)} — logs ${(s.logIds||[]).length}`;
    options.push(`<option value="${s.id}" ${s.id===currentSettlementId?"selected":""}>${esc(label)}</option>`);
  }
  options.push(`<option value="new">+ Nieuwe afrekening aanmaken…</option>`);
  return options.join("");
}

function openAfrekeningPickerForLog(logId, { anchorEl } = {}){
  const log = state.logs.find(l => l.id === logId);
  if (!log || !anchorEl) return;
  anchorEl.focus({ preventScroll: true });
  anchorEl.click();
}

function settlementLogbookSummary(s){
  const linkedLogs = (s.logIds||[])
    .map(id => state.logs.find(l => l.id === id))
    .filter(Boolean);
  const totalWorkMs = linkedLogs.reduce((acc, log) => acc + sumWorkMs(log), 0);
  const totalProductCosts = round2(linkedLogs.reduce((acc, log) => acc + sumItemsAmount(log), 0));
  const hourly = Number(state.settings.hourlyRate||0);
  const totalLogPrice = round2((totalWorkMs / 3600000) * hourly + totalProductCosts);
  return { linkedCount: linkedLogs.length, totalWorkMs, totalProductCosts, totalLogPrice };
}

function settlementLinkedLogs(s){
  return (s.logIds || [])
    .map(id => state.logs.find(l => l.id === id))
    .filter(Boolean);
}

function settlementLogbookTotals(s){
  const linkedLogs = settlementLinkedLogs(s);
  const totalWorkMs = linkedLogs.reduce((acc, log) => acc + sumWorkMs(log), 0);
  let totalGreenUnits = 0;
  let totalExtraProducts = 0;

  for (const log of linkedLogs){
    for (const item of (log.items || [])){
      if (isWorkProduct(item)) continue;
      if (isGreenProduct(item)) totalGreenUnits += Number(item.qty) || 0;
      else totalExtraProducts += Number(item.qty) || 0;
    }
  }

  return {
    totalWorkMs,
    totalGreenUnits: round2(totalGreenUnits),
    totalExtraProducts: round2(totalExtraProducts)
  };
}

function syncSettlementAmounts(settlement){
  if (!settlement) return;
  const totals = getSettlementTotals(settlement);
  settlement.invoiceAmount = totals.invoiceTotal;
  settlement.cashAmount = totals.cashTotal;
}

function renderSettlementStatusIcons(settlement){
  const isCalculated = isSettlementCalculated(settlement);
  const isEdit = isSettlementEditing(settlement?.id);
  const showCalculateIcon = settlement?.status !== "calculated" || isEdit === true;
  const calcStateClass = isCalculated ? "is-open" : "";
  const calcStateStyle = isCalculated
    ? ""
    : ' style="color:#ffcc00;border-color:rgba(255,204,0,.55);background:rgba(255,204,0,.10);"';
  const calcDisabled = !isEdit && isCalculated ? " disabled aria-disabled=\"true\"" : "";
  const iconPresentation = getSettlementIconPresentation(settlement);
  const chips = [
    showCalculateIcon
      ? `
    <button class="status-icon-chip status-icon-calc ${calcStateClass}" id="toggleCalculated" type="button" aria-label="Bereken afrekening"${calcStateStyle}${calcDisabled}>
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 12h3M13 12h3M8 16h8" stroke-linecap="round"></path></svg>
    </button>
  `
      : `
    <button class="status-icon-chip status-icon-calc ${calcStateClass}" id="toggleCalculated" type="button" aria-hidden="true" tabindex="-1" disabled style="visibility:hidden;pointer-events:none;">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 12h3M13 12h3M8 16h8" stroke-linecap="round"></path></svg>
    </button>
  `
  ];
  const invoiceIcon = iconPresentation.find(icon => icon.type === "invoice");
  if (invoiceIcon?.show){
    chips.push(`
      <button class="status-icon-chip ${invoiceIcon.color === "green" ? "is-paid" : "is-open"}" id="toggleInvoicePaid" type="button" aria-pressed="${settlement.invoicePaid ? "true" : "false"}" aria-label="Factuur ${settlement.invoicePaid ? "betaald" : "open"}">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"></rect><path d="M2.5 10h19" stroke-linecap="round"></path><path d="M7 14.5h4" stroke-linecap="round"></path></svg>
      </button>
    `);
  }
  const cashIcon = iconPresentation.find(icon => icon.type === "cash");
  if (cashIcon?.show){
    chips.push(`
      <button class="status-icon-chip ${cashIcon.color === "green" ? "is-paid" : "is-open"}" id="toggleCashPaid" type="button" aria-pressed="${settlement.cashPaid ? "true" : "false"}" aria-label="Cash ${settlement.cashPaid ? "betaald" : "open"}">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="8.5" cy="12" r="3.5"></circle><circle cx="15.5" cy="12" r="3.5"></circle><path d="M12 8.5v7" stroke-linecap="round"></path></svg>
      </button>
    `);
  }
  return chips.join("");
}

function calculateSettlement(settlement){
  // finalizeSettlement: VERANDER NOOIT quantities/allocations.
  // Doet enkel: status frozen, datum, factuurnummer, totals voor weergave.
  if (!settlement) return;

  // Bouw/update allocations vanuit logs (enkel als nog niet calculated)
  buildAllocationsFromLogs(settlement);

  syncSettlementDatesFromLogs(settlement);

  settlement.markedCalculated = true;
  settlement.isCalculated = true;
  settlement.calculatedAt = now();

  // Factuurnummer pas toewijzen zodra de afrekening berekend is.
  const totals = getTotalsFromAllocations(settlement);
  if (totals.invoiceTotal > 0){
    lockInvoice(settlement);
    const hasInvoiceNumber = Boolean(String(settlement.invoiceNumber || "").trim());
    if (!hasInvoiceNumber){
      settlement.invoiceNumber = getNextInvoiceNumber(state.settlements || []);
    }
  } else {
    settlement.invoiceNumber = null;
  }
  syncSettlementStatus(settlement);
  syncSettlementAmounts(settlement);
}

function uncalculateSettlement(settlement){
  if (!settlement) return;
  settlement.isCalculated = false;
  settlement.markedCalculated = false;
  settlement.calculatedAt = null;
  settlement.status = "draft";
  settlement.invoicePaid = false;
  settlement.cashPaid = false;
  syncSettlementStatus(settlement);
}

function renderSettlementLogOverviewSheet(settlementId){
  const settlement = state.settlements.find(x => x.id === settlementId);
  if (!settlement){ closeSheet(); return; }

  const linkedLogs = (settlement.logIds || [])
    .map(id => state.logs.find(l => l.id === id))
    .filter(Boolean)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  const totalWorkMinutes = linkedLogs.reduce((acc, log) => acc + Math.floor(sumWorkMs(log) / 60000), 0);
  const totalProductCost = round2(linkedLogs.reduce((acc, log) => acc + sumItemsAmount(log), 0));
  const totalAmount = round2(totalProductCost + ((totalWorkMinutes / 60) * Number(state.settings.hourlyRate || 0)));

  $('#sheetActions').innerHTML = '';
  $('#sheetBody').innerHTML = `
    <div class="stack settlement-overview settlement-detail">
      ${linkedLogs.map(log=>{
        const workMinutes = Math.floor(sumWorkMs(log) / 60000);
        const itemRows = (log.items || []).map(item=>{
          const qty = round2(Number(item.qty) || 0);
          const unitPrice = round2(Number(item.unitPrice) || 0);
          return `<div class="overview-item-row"><span>${esc(pname(item.productId))}</span><span>${qty} × ${formatMoneyEUR(unitPrice)}</span><span>${formatMoneyEUR(qty * unitPrice)}</span></div>`;
        }).join('') || `<div class="small">Geen producten</div>`;

        return `
          <div class="section stack">
            <div class="settlement-log-cols mono tabular flat-row">
              <span class="log-col-date">${esc(formatDatePretty(log.date))}</span>
              <span class="log-col-time">${formatDurationCompact(workMinutes)}</span>
              <span class="log-col-price">${formatMoneyEUR(sumItemsAmount(log))}</span>
              <span class="log-col-products">${countExtraProducts(log)}</span>
            </div>
            <div class="overview-item-list">${itemRows}</div>
          </div>
        `;
      }).join('') || `<div class="section"><div class="small">Geen gekoppelde logs.</div></div>`}

      <div class="section stack">
        <h2>Totalen</h2>
        <div class="overview-totals-grid mono tabular">
          <span>Totaal werktijd</span><strong>${formatMinutesAsDuration(totalWorkMinutes)}</strong>
          <span>Totaal producten</span><strong>${formatMoneyEUR(totalProductCost)}</strong>
          <span>Totaal</span><strong>${formatMoneyEUR(totalAmount)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderSettlementSheet(id){
  const s = state.settlements.find(x => x.id === id);
  if (!s){ closeSheet(); return; }
  if (!("invoicePaid" in s)) s.invoicePaid = false;
  if (!("cashPaid" in s)) s.cashPaid = false;
  if (!("markedCalculated" in s)) s.markedCalculated = s.status === "calculated";
  if (!("isCalculated" in s)) s.isCalculated = isSettlementCalculated(s);
  if (!("calculatedAt" in s)) s.calculatedAt = s.isCalculated ? (s.createdAt || now()) : null;
  if (!("invoiceLocked" in s)) s.invoiceLocked = Boolean(s.isCalculated);
  syncSettlementDatesFromLogs(s);
  ensureSettlementInvoiceDefaults(s);
  // Verwijder ensureDefaultSettlementLines — allocations zijn bron van waarheid
  syncSettlementStatus(s);

  const isEdit = isSettlementEditing(s.id);
  const invoiceNumberDisplay = String(s.invoiceNumber || "").trim();
  const customerOptions = state.customers.map(c => `<option value="${c.id}" ${c.id===s.customerId?"selected":""}>${esc(c.nickname||c.name||"Klant")}</option>`).join('');
  const availableLogs = state.logs
    .filter(l => l.customerId === s.customerId)
    .filter(log => {
      const isInThisSettlement = (s.logIds || []).includes(log.id);
      const linkedElsewhere = isLogLinkedElsewhere(log.id, s.id);
      return isInThisSettlement || !linkedElsewhere;
    })
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  // Zorg dat allocations bestaan (migratie of eerste keer openen)
  if (!s.allocations){
    buildAllocationsFromLogs(s);
    syncSettlementAmounts(s);
  }

  const pay = settlementPaymentState(s);
  const paymentFlags = getSettlementPaymentFlags(s);
  const visual = getSettlementVisualState(s);
  const showInvoiceNumberSection = Boolean(pay.hasInvoice) && ["calculated", "paid"].includes(s.status);
  const canEditInvoiceNumber = s.status === "calculated" && pay.hasInvoice === true && s.status !== "paid";
  const invoiceNumberReadOnly = s.status === "paid";
  const logbookTotals = settlementLogbookTotals(s);

  // Bouw allocation-rijen vanuit s.allocations (bron van waarheid)
  const workIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="7"/><path d="M12 8.6v3.8l2.7 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const greenIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`;
  const leafIconSmall = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`;
  const boxIconSmall = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 8 8-4 8 4-8 4-8-4Z" stroke-linejoin="round"/><path d="M4 8v8l8 4 8-4V8" stroke-linejoin="round"/><path d="M12 12v8" stroke-linecap="round"/></svg>`;
  const greenProduct = findGreenProduct();
  const allocationRows = [];
  const allocs = s.allocations || {};
  if (allocs.work){
    allocationRows.push({
      key: 'work', icon: workIcon, label: allocs.work.name || 'Werk',
      invoiceQty: allocs.work.invoiceQty || 0, cashQty: allocs.work.cashQty || 0,
      baseQty: allocs.work.baseQty || 0
    });
  }
  // Producten: groen eerst, dan andere
  const productEntries = Object.entries(allocs).filter(([k]) => k !== 'work');
  productEntries.sort(([, a], [, b]) => {
    const aG = a.productId && greenProduct && a.productId === greenProduct.id;
    const bG = b.productId && greenProduct && b.productId === greenProduct.id;
    if (aG && !bG) return -1;
    if (!aG && bG) return 1;
    return 0;
  });
  for (const [key, alloc] of productEntries){
    const prod = alloc.productId ? getProduct(alloc.productId) : null;
    const isGreen = prod ? isGreenProduct(prod) : false;
    allocationRows.push({
      key, icon: isGreen ? greenIcon : null,
      label: alloc.name || prod?.name || 'Product',
      invoiceQty: alloc.invoiceQty || 0, cashQty: alloc.cashQty || 0,
      baseQty: alloc.baseQty || 0
    });
  }

  // Render helpers voor de matrix
  const renderAllocationControls = ({ key, bucket, qty })=>{
    // Richting: invoice-min = toCash, invoice-plus = toInvoice
    //           cash-min = toInvoice, cash-plus = toCash
    const dirMinus = bucket === 'invoice' ? 'toCash' : 'toInvoice';
    const dirPlus  = bucket === 'invoice' ? 'toInvoice' : 'toCash';
    return `<div class="allocation-controls" data-bucket="${bucket}">
      ${isEdit ? `<button class="iconbtn iconbtn-sm" type="button" data-settle-shift="${esc(key)}|${dirMinus}" aria-label="${bucket} min">−</button>` : `<span class="allocation-btn-placeholder"></span>`}
      <div class="allocation-value mono tabular">${esc(String(formatQuickQty(qty)))}</div>
      ${isEdit ? `<button class="iconbtn iconbtn-sm" type="button" data-settle-shift="${esc(key)}|${dirPlus}" aria-label="${bucket} plus">+</button>` : `<span class="allocation-btn-placeholder"></span>`}
    </div>`;
  };

  const renderAllocationRow = ({ key, icon, label, invoiceQty, cashQty })=>`
    ${icon ? `<div class="allocation-matrix-icon" aria-hidden="true">${icon}</div>` : `<div class="allocation-matrix-label">${esc(label)}</div>`}
    ${renderAllocationControls({ key, bucket: 'invoice', qty: invoiceQty })}
    ${renderAllocationControls({ key, bucket: 'cash', qty: cashQty })}
  `;

  const renderAllocationStaticRow = ({ invoiceValue, cashValue, invoiceClass = '', cashClass = '', rowClass = '' })=>`
    <div class="allocation-matrix-label ${rowClass}" aria-hidden="true"></div>
    <div class="allocation-controls allocation-controls-static ${rowClass}" data-bucket="invoice">
      <span class="allocation-btn-placeholder"></span>
      <div class="allocation-value mono tabular ${invoiceClass}">${invoiceValue}</div>
      <span class="allocation-btn-placeholder"></span>
    </div>
    <div class="allocation-controls allocation-controls-static ${rowClass}" data-bucket="cash">
      <span class="allocation-btn-placeholder"></span>
      <div class="allocation-value mono tabular ${cashClass}">${cashValue}</div>
      <span class="allocation-btn-placeholder"></span>
    </div>
  `;

  $('#sheetActions').innerHTML = '';
  $('#sheetBody').style.paddingBottom = 'calc(var(--bottom-tabbar-height) + var(--status-tabbar-height) + env(safe-area-inset-bottom) + 40px)';
  $('#sheetBody').innerHTML = `
    <div class="stack settlement-detail settlement-flow ${visual.accentClass}">
      ${(!isEdit && (s.note || '').trim()) ? `<div class="section section-tight settlement-note-top"><div class="settlement-note-text">${esc(s.note.trim())}</div></div>` : ``}
      <div class="section stack section-tight">
        ${!isEdit ? `<div class="summary-row"><span class="label">Datum</span><span class="num">${esc(formatDatePretty(s.date))}${s.dateOverride ? `<span class="subtle-tag mono">aangepast</span>` : ""}</span></div>` : ""}
        <div class="summary-row"><span class="label">Totale werkuren</span><span class="num mono tabular">${formatDurationCompact(Math.floor(logbookTotals.totalWorkMs / 60000))}</span></div>
        <div class="summary-row"><span class="label">Totale groen eenheden</span><span class="num mono tabular">${esc(String(formatQuickQty(logbookTotals.totalGreenUnits)))}</span></div>
        ${logbookTotals.totalExtraProducts > 0 ? `<div class="summary-row"><span class="label">Totale extra producten</span><span class="num mono tabular">${esc(String(formatQuickQty(logbookTotals.totalExtraProducts)))}</span></div>` : ''}
      </div>

      <div class="section stack section-tight">
        <div class="allocation-matrix">
          <div class="allocation-col-head" aria-hidden="true"></div>
          <div class="allocation-col-head">Factuur</div>
          <div class="allocation-col-head">Cash</div>
          ${allocationRows.map(row => renderAllocationRow(row)).join('')}
          ${renderAllocationStaticRow({
            invoiceValue: moneyOrBlank(pay.invoiceTotal),
            cashValue: moneyOrBlank(pay.cashTotal),
            invoiceClass: paymentFlags.invoicePaid ? 'is-paid' : 'is-open',
            cashClass: paymentFlags.cashPaid ? 'is-paid' : 'is-open',
            rowClass: 'allocation-total-row'
          })}
        </div>
      </div>

      <div class="section stack section-tight">
        <div class="flat-list settlement-linked-logs-list" id="sLogs">
          ${availableLogs.slice(0,30).map(l=>{
            const checked = (s.logIds||[]).includes(l.id);
            const { greenItemQty, otherItems } = splitLogItems(l);
            const otherProductsQty = round2(otherItems.reduce((total, item) => total + (Number(item.qty) || 0), 0));
            const rowMeta = `
              <div class="settlement-linked-log-row mono tabular">
                <span class="settlement-linked-log-date">${esc(formatDatePretty(l.date))}</span>
                <div class="settlement-linked-log-right">
                  <span>${formatDurationCompact(Math.floor(sumWorkMs(l)/60000))}</span>
                  ${greenItemQty > 0 ? `<span class="settlement-linked-log-chip"><span class="settlement-linked-log-icon" aria-hidden="true">${leafIconSmall}</span>${esc(String(formatQuickQty(greenItemQty)))}</span>` : ''}
                  ${otherProductsQty > 0 ? `<span class="settlement-linked-log-chip"><span class="settlement-linked-log-icon" aria-hidden="true">${boxIconSmall}</span>${esc(String(formatQuickQty(otherProductsQty)))}</span>` : ''}
                </div>
              </div>`;
            if (isEdit){
              return `<label class="flat-row"><div class="row space"><div class="item-main">${rowMeta}</div><div class="item-right"><input type="checkbox" data-logpick="${l.id}" ${checked ? "checked" : ""}/></div></div></label>`;
            }
            if (!checked) return "";
            return `<button class="flat-row item-row-button" type="button" role="button" data-open-linked-log="${l.id}"><div class="item-main">${rowMeta}</div></button>`;
          }).join('') || `<div class="small">Geen gekoppelde logs.</div>`}
        </div>

      </div>

      ${isEdit ? `
      <div class="section stack">
        <h2>Acties</h2>
        <div class="compact-row"><label>Klant</label><div><select id="sCustomer">${customerOptions}</select></div></div>
        <div class="compact-row"><label>Afrekendatum</label><div class="row-inline"><input id="settlementDateOverride" type="date" value="${esc(String(s.dateOverride || s.date || ""))}" />${s.dateOverride ? `<button class="iconbtn iconbtn-sm" id="btnResetSettlementDate" type="button" title="Reset naar automatisch" aria-label="Reset naar automatisch"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7" stroke-linecap="round"/><path d="M3 3v6h6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}</div></div>
        ${showInvoiceNumberSection ? `<div class="compact-row"><label>Factuurnr</label><div><input id="invoiceNumberInput" value="${esc(invoiceNumberDisplay)}" ${invoiceNumberReadOnly ? "readonly" : ""} /></div></div>` : ''}
        <textarea id="sNote" rows="3">${esc(s.note||"")}</textarea>
        <button class="btn danger" id="delSettlement">Verwijder</button>
      </div>` : ""}
    </div>
  `;

  setStatusTabbar(`
    <div class="settlement-status-bar">
      ${renderSettlementStatusIcons(s)}
    </div>
    ${isEdit ? `
      <button class="iconbtn" id="btnSettlementRecalc" type="button" aria-label="Herbereken uit logs" title="Herbereken uit logs">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke-linecap="round"/>
          <path d="M21 3v6h-6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    ` : ""}
    <button class="iconbtn" id="btnSettlementEdit" type="button" aria-label="${isEdit ? "Gereed" : "Bewerk"}" title="${isEdit ? "Gereed" : "Bewerk"}">
      ${isEdit
        ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
        : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L3.8 17.5z"></path><path d="M14 5l5 5"></path></svg>`}
    </button>
  `);

  $('#toggleCalculated')?.addEventListener('click', ()=>{
    const calculated = isSettlementCalculated(s);
    if (isEdit){
      if (calculated){
        actions.editSettlement(s.id, (draft)=>{
          uncalculateSettlement(draft);
        });
      } else {
        actions.calculateSettlement(s.id);
      }
      renderSheet();
      return;
    }
    if (!calculated){
      actions.calculateSettlement(s.id);
    }
    renderSheet();
  });
  $('#toggleInvoicePaid')?.addEventListener('click', ()=>{
    actions.setInvoicePaid(s.id, !s.invoicePaid);
    renderSheet();
  });
  $('#toggleCashPaid')?.addEventListener('click', ()=>{
    actions.setCashPaid(s.id, !s.cashPaid);
    renderSheet();
  });
  $('#btnSettlementEdit')?.addEventListener('click', ()=>{
    toggleEditSettlement(s.id);
    renderSheet();
  });

  if (!isEdit){
    $('#sheetBody').querySelectorAll('[data-open-linked-log]').forEach(btn=>{
      btn.addEventListener('click', ()=> openSheet('log', btn.getAttribute('data-open-linked-log')));
    });
  }

  if (isEdit){
    $('#delSettlement')?.addEventListener('click', ()=>{
      if (!confirmDelete(`Afrekening ${formatDatePretty(s.date)} — ${cname(s.customerId)}`)) return;
      actions.deleteSettlement(s.id);
      closeSheet();
    });

    $('#sCustomer')?.addEventListener('change', ()=>{
      actions.editSettlement(s.id, (draft)=>{
        draft.customerId = $('#sCustomer').value;
        draft.logIds = [];
      });
      renderSheet();
    });
    $('#settlementDateOverride')?.addEventListener('change', ()=>{
      const v = String($('#settlementDateOverride').value || "").trim();
      if (!v) return;
      actions.editSettlement(s.id, (draft)=>{
        draft.dateOverride = v;
        draft.date = v;
        if (!draft.invoiceLocked) draft.invoiceDate = v;
      });
      renderSheet();
    });
    $('#btnResetSettlementDate')?.addEventListener('click', ()=>{
      actions.editSettlement(s.id, (draft)=>{
        delete draft.dateOverride;
        draft.dateOverride = null;
        syncSettlementDatesFromLogs(draft, state);
      });
      renderSheet();
    });
    $('#sNote')?.addEventListener('change', ()=>{
      actions.editSettlement(s.id, (draft)=>{
        draft.note = ($('#sNote').value || '').trim();
      });
    });

    $('#invoiceNumberInput')?.addEventListener('change', ()=>{
      if (!canEditInvoiceNumber) return;
      const raw = String($('#invoiceNumberInput').value || '').trim();
      actions.updateSettlementField(s.id, 'invoiceNumber', raw);
      renderSheet();
    });
    $('#sheetBody').querySelectorAll('[data-logpick]').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        const logId = cb.getAttribute('data-logpick');
        const other = settlementForLog(logId);
        if (other && other.id !== s.id){
          alert('Deze log zit al in een andere afrekening. Open die afrekening of ontkoppel eerst.');
          cb.checked = false;
          return;
        }
        actions.editSettlement(s.id, (draft)=>{
          if (isSettlementCalculated(draft)) return; // geen wijziging als calculated
          if (cb.checked) draft.logIds = Array.from(new Set([...(draft.logIds||[]), logId]));
          else draft.logIds = (draft.logIds||[]).filter(x => x !== logId);
          // Herbouw allocations vanuit logs (bron van waarheid)
          buildAllocationsFromLogs(draft, state);
          syncSettlementAmounts(draft);
        });
        renderSheet();
      });
    });

    $('#btnSettlementRecalc')?.addEventListener('click', ()=>{
      // Herbereken = herbouw allocations vanuit logs zonder te finaliseren
      actions.editSettlement(s.id, (draft)=>{
        if (isSettlementCalculated(draft)) return;
        buildAllocationsFromLogs(draft, state);
        syncSettlementAmounts(draft);
      });
      renderSheet();
    });

    $('#sheetBody').querySelectorAll('[data-settle-shift]').forEach(btn=>{
      const raw = String(btn.getAttribute('data-settle-shift') || '');
      const [key, direction] = raw.split('|');
      if (!key || !direction) return;
      bindStepButton(
        btn,
        ()=>{
          // Tap: stap 1.0
          actions.editSettlement(s.id, (draft)=>{
            shiftAllocation(draft, key, direction, 1.0);
            syncSettlementAmounts(draft);
          });
          renderSheetKeepScroll();
        },
        ()=>{
          // Long press: stap 0.5
          actions.editSettlement(s.id, (draft)=>{
            shiftAllocation(draft, key, direction, 0.5);
            syncSettlementAmounts(draft);
          });
          renderSheetKeepScroll();
        }
      );
    });
  }
}

function renderLinesTable(settlement, bucket, { readOnly = false } = {}){
  const lines = (settlement.lines||[]).filter(l => (l.bucket||'invoice')===bucket);
  const totals = settlementTotals(settlement);
  const workQuickLine = findSettlementQuickLine(lines, bucket, "work");
  const greenQuickLine = findSettlementQuickLine(lines, bucket, "green");
  const quickLineIds = new Set([workQuickLine?.id, greenQuickLine?.id].filter(Boolean));
  const visibleLines = readOnly ? lines : lines.filter(line => !quickLineIds.has(line.id));

  if (readOnly){
    const compactRows = (visibleLines.map(l=>{
      const rowTotal = lineAmount(l);
      const productLabel = esc((getProduct(l.productId)?.name) || l.name || l.description || '—');
      const qty = Number(l.qty) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      const showMeta = qty > 0 || unitPrice > 0;
      return `
        <div class="summary-row">
          <div>
            <div class="label">${productLabel}</div>
            ${showMeta ? `<div class="summary-sub mono">${qty > 0 ? qty : '—'} × ${formatMoneyEUR(unitPrice)}</div>` : ''}
          </div>
          <div class="num mono">${moneyOrBlank(rowTotal)}</div>
        </div>
      `;
    }).join('')) || `<div class="small">Geen regels</div>`;

    const compactInvoiceTotals = `
      <div class="summary-row"><span class="label">Subtotaal</span><span class="num mono">${moneyOrBlank(totals.invoiceSubtotal)}</span></div>
      <div class="summary-row"><span class="label">BTW</span><span class="num mono">${moneyOrBlank(totals.invoiceVat)}</span></div>
      <div class="summary-row"><span class="label"><strong>Totaal</strong></span><span class="num mono"><strong>${moneyOrBlank(totals.invoiceTotal)}</strong></span></div>
    `;
    const compactCashTotals = `<div class="summary-row"><span class="label"><strong>Totaal</strong></span><span class="num mono"><strong>${moneyOrBlank(totals.cashTotal)}</strong></span></div>`;
    const compactTotals = bucket === 'invoice' ? compactInvoiceTotals : compactCashTotals;

    return `<div class="summary-rows">${compactRows}${compactTotals}</div>`;
  }

  const renderQuickRow = (line, kind)=>{
    if (!line) return "";
    const qty = formatQuickQty(line.qty);
    const icon = kind === "green"
      ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`
      : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="7"/><path d="M12 8.6v3.8l2.7 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `
      <div class="settlement-quick-row green-row no-select">
        <span class="settlement-quick-icon" aria-hidden="true">${icon}</span>
        <div class="settlement-quick-qty mono tabular">${esc(qty)}</div>
        <div class="settlement-quick-controls">
          <button class="iconbtn iconbtn-sm" type="button" data-settle-quick-step="${bucket}|${kind}|-1" aria-label="${kind === "green" ? "Groen" : "Werk"} min">−</button>
          <button class="iconbtn iconbtn-sm" type="button" data-settle-quick-step="${bucket}|${kind}|1" aria-label="${kind === "green" ? "Groen" : "Werk"} plus">+</button>
        </div>
      </div>
    `;
  };

  const quickRows = `${renderQuickRow(workQuickLine, "work")}${renderQuickRow(greenQuickLine, "green")}`;

  const invoiceFooterRows = `
    <div>Subtotaal</div><div></div><div></div><div class="num">${moneyOrBlank(totals.invoiceSubtotal)}</div><div></div>
    <div>BTW 21%</div><div></div><div></div><div class="num">${moneyOrBlank(totals.invoiceVat)}</div><div></div>
    <div>Totaal</div><div></div><div></div><div class="num">${moneyOrBlank(totals.invoiceTotal)}</div><div></div>
  `;
  const cashFooterRows = `<div>Totaal</div><div></div><div></div><div class="num">${moneyOrBlank(totals.cashTotal)}</div><div></div>`;
  const footerRows = bucket === 'invoice' ? invoiceFooterRows : cashFooterRows;
  const footer = `<div class="settlement-lines-footer mono tabular">${footerRows}</div>`;

  return `
    <div class="settlement-lines-table">
      ${quickRows ? `<div class="settlement-quick-list">${quickRows}</div>` : ""}
      ${visibleLines.length ? `<div class="item-sub settlement-other-label">Andere producten</div>` : ""}
      <div class="settlement-lines-grid settlement-lines-head mono">
        <div>Product</div><div>Aantal</div><div>€/eenheid</div><div class="num">Totaal</div><div></div>
      </div>
      ${(visibleLines.map(l=>{
        const rowTotal = lineAmount(l);
        const productValue = l.productId || '';
        return `
          <div class="settlement-lines-grid settlement-lines-row">
            <div>
              <select class="settlement-cell-input" data-line-product="${l.id}"><option value="">Kies product</option>${state.products.map(p=>`<option value="${p.id}" ${p.id===productValue?"selected":""}>${esc(p.name)}${p.unit ? ` (${esc(p.unit)})` : ''}</option>`).join('')}</select>
            </div>
            <div><input class="settlement-cell-input mono tabular" data-line-qty="${l.id}" inputmode="decimal" value="${esc((l.qty ?? '') === 0 ? '' : String(l.qty ?? ''))}" /></div>
            <div><input class="settlement-cell-input mono tabular" data-line-price="${l.id}" inputmode="decimal" value="${esc((l.unitPrice ?? '') === 0 ? '' : String(l.unitPrice ?? ''))}" /></div>
            <div class="num mono tabular">${moneyOrBlank(rowTotal)}</div>
            <div><button class="iconbtn settlement-trash" data-line-del="${l.id}" title="Verwijder"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18" stroke-linecap="round"/><path d="M8 6V4h8v2"/><path d="M6 6l1 16h10l1-16"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg></button></div>
          </div>
        `;
      }).join('')) || `<div class="small">Geen regels</div>`}
      ${footer}
    </div>
  `;
}

function addSettlementLine(settlement, bucket){
  settlement.lines = settlement.lines || [];
  settlement.lines.push({
    id: uid(),
    productId: null,
    name: '',
    qty: '',
    unitPrice: '',
    vatRate: bucket === 'invoice' ? 0.21 : 0,
    bucket
  });
}

function ensureDefaultSettlementLines(settlement){
  settlement.lines = settlement.lines || [];
  const ensureForBucket = bucket=>{
    ["Werk", "Groen"].forEach(productName=>{
      const product = (state.products||[]).find(p => (p.name||'').toLowerCase() === productName.toLowerCase()) || null;
      const hasLine = settlement.lines.some(line => {
        const sameBucket = (line.bucket||'invoice') === bucket;
        if (!sameBucket) return false;
        if (product && line.productId) return line.productId === product.id;
        const label = String(line.name || line.description || pname(line.productId) || '').toLowerCase();
        return label === productName.toLowerCase();
      });
      if (hasLine) return;
      settlement.lines.push({
        id: uid(),
        productId: product?.id || null,
        name: product?.name || productName,
        description: product?.name || productName,
        qty: '',
        unitPrice: product ? Number(product.unitPrice || 0) : '',
        vatRate: bucket === 'invoice' ? Number(product?.vatRate ?? 0.21) : 0,
        bucket
      });
    });
  };
  ensureForBucket('invoice');
  ensureForBucket('cash');
}


function shouldBlockIOSGestures(){
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOSDevice = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(platform) && maxTouchPoints > 1);
  if (!isIOSDevice) return false;
  const isSafariLike = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return isSafariLike || isStandalone;
}

function installIOSNoZoomGuards(){
  if (!shouldBlockIOSGestures()) return;
  const blockGesture = (event) => event.preventDefault();
  ["gesturestart", "gesturechange", "gestureend"].forEach((type)=>{
    document.addEventListener(type, blockGesture, { passive: false });
  });
}

// init

// Quick checks:
// - Start log -> stop log works
// - Create settlement -> calculate -> icons correct
// - Backup export/import still works
// - Refresh persists state
installIOSNoZoomGuards();
window.addEventListener("resize", ()=>{
  syncViewUiState();
});
setTab("logs");
render();
setBottomBarHeights({ statusVisible: false });
runGreenAllocationUnitPriceSanityCheck();

// Timer tick: update active timer display every 15 seconds
setInterval(()=>{
  if (state.activeLogId && ui.navStack[0]?.view === "logs" && ui.navStack.length === 1){
    const elapsedEl = document.querySelector(".timer-active-elapsed");
    const metaEl = document.querySelector(".timer-active-meta");
    if (elapsedEl){
      const active = state.logs.find(l => l.id === state.activeLogId);
      if (active){
        elapsedEl.textContent = durMsToHM(sumWorkMs(active));
        const isPaused = currentOpenSegment(active)?.type === "break";
        if (metaEl) metaEl.textContent = `${isPaused ? "Pauze actief" : "Timer loopt"} · gestart ${fmtClock(active.createdAt)}`;
      }
    }
  }
}, 15000);
