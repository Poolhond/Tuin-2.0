
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
  showFixed: true,
  sortKey: "date",
  sortDir: "desc"
};

const uid = () => Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
const now = () => Date.now();
const todayISO = () => new Date().toISOString().slice(0,10);
const esc = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function autoResizeTextarea(el){
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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
  return `${h}u ${String(m).padStart(2, "0")}m`;
}
function round2(n){ return Math.round((Number(n||0))*100)/100; }

// ---------- Quarter date helpers (fixed-period feature) ----------
function getQuarterStart(date){
  const dt = date instanceof Date ? date : parseLocalYMD(date) || new Date();
  const quarterMonth = Math.floor(dt.getMonth() / 3) * 3;
  return formatLocalYMD(new Date(dt.getFullYear(), quarterMonth, 1));
}
function getQuarterEnd(date){
  const dt = date instanceof Date ? date : parseLocalYMD(date) || new Date();
  const quarterMonth = Math.floor(dt.getMonth() / 3) * 3 + 3;
  return formatLocalYMD(new Date(dt.getFullYear(), quarterMonth, 1));
}
// Returns a stable quarter key like "2026-Q2" for use as a unique quarter identifier.
function getQuarterKey(dateStr){
  const dt = dateStr instanceof Date ? dateStr : parseLocalYMD(dateStr) || new Date();
  const q = Math.floor(dt.getMonth() / 3) + 1;
  return `${dt.getFullYear()}-Q${q}`;
}
function isDateInRange(dateStr, startStr, endStr){
  const d = String(dateStr || "");
  return d >= String(startStr || "") && d < String(endStr || "");
}
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
function formatDateWeekdayLong(isoDate){
  const dt = parseLocalYMD(isoDate) || new Date(isoDate);
  if (!Number.isFinite(dt.getTime())) return "";
  const weekdayNames = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
  return weekdayNames[dt.getDay()] || "";
}
function formatDateDayMonthShortYear(isoDate){
  if (!isoDate) return "";
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))
    ? String(isoDate)
    : formatLocalYMD(new Date(isoDate));
  if (!ymd) return String(isoDate);
  const [y, m, d] = ymd.split("-").map(Number);
  const monthNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const yy = String(y).slice(-2);
  return `${d} ${monthNames[m - 1]} ${yy}`;
}
function formatClockDot(ms){
  if (!Number.isFinite(ms)) return "";
  return fmtClock(ms).replace(":", ".");
}
function formatLogGlobalTimeRange(log){
  const segments = log?.segments || [];
  const starts = segments.map(s => s?.start).filter(Number.isFinite);
  const ends = segments.map(s => s?.end).filter(Number.isFinite);
  if (!starts.length || !ends.length) return "—";
  const firstStart = Math.min(...starts);
  const lastEnd = Math.max(...ends);
  return `${formatClockDot(firstStart)} - ${formatClockDot(lastEnd)}`;
}
function getLogBoundarySegments(log){
  const segments = sortSegmentsChronologically(log?.segments || [])
    .filter(segment => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end));
  if (!segments.length) return { firstSegment: null, lastSegment: null };
  return {
    firstSegment: segments[0],
    lastSegment: segments[segments.length - 1]
  };
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
function cloneSegment(segment, patch = {}){
  return { ...segment, ...patch, id: patch.id ?? segment?.id ?? uid() };
}
function sortSegmentsChronologically(segments){
  return [...(segments || [])].sort((a, b) => {
    const aStart = Number.isFinite(a?.start) ? a.start : Number.POSITIVE_INFINITY;
    const bStart = Number.isFinite(b?.start) ? b.start : Number.POSITIVE_INFINITY;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = Number.isFinite(a?.end) ? a.end : Number.POSITIVE_INFINITY;
    const bEnd = Number.isFinite(b?.end) ? b.end : Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });
}
function normalizeSegments(segments){
  const cleaned = sortSegmentsChronologically(segments)
    .filter(segment => segment && ["work", "break"].includes(segment.type))
    .map(segment => cloneSegment(segment))
    .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start);

  return mergeAdjacentSegments(cleaned);
}
function mergeAdjacentSegments(segments){
  const merged = [];
  for (const segment of sortSegmentsChronologically(segments)){
    const prev = merged[merged.length - 1];
    if (prev && prev.type === segment.type && prev.end === segment.start){
      prev.end = segment.end;
      continue;
    }
    merged.push(cloneSegment(segment));
  }
  return merged;
}
function getLogTimelineBounds(log){
  const normalized = normalizeSegments(log?.segments || []);
  if (!normalized.length) return { start: null, end: null };
  return {
    start: normalized[0].start,
    end: normalized[normalized.length - 1].end
  };
}
function insertPauseIntoLog(log, pauseStart, pauseEnd){
  const segments = normalizeSegments(log?.segments || []);
  if (!segments.length){
    return { ok: false, reason: 'no_segments' };
  }
  if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd) || pauseEnd <= pauseStart){
    return { ok: false, reason: 'invalid_range' };
  }

  const timeline = getLogTimelineBounds(log);
  if (!Number.isFinite(timeline.start) || !Number.isFinite(timeline.end)){
    return { ok: false, reason: 'no_segments' };
  }
  if (pauseStart < timeline.start || pauseEnd > timeline.end){
    return { ok: false, reason: 'outside_timeline', timeline };
  }

  let touchedWork = false;
  const nextSegments = [];

  for (const segment of segments){
    const overlapStart = Math.max(segment.start, pauseStart);
    const overlapEnd = Math.min(segment.end, pauseEnd);
    const overlaps = overlapEnd > overlapStart;

    if (!overlaps){
      nextSegments.push(cloneSegment(segment));
      continue;
    }

    if (segment.type !== 'work'){
      nextSegments.push(cloneSegment(segment));
      continue;
    }

    touchedWork = true;
    if (segment.start < overlapStart){
      nextSegments.push(cloneSegment(segment, { id: uid(), end: overlapStart }));
    }
    nextSegments.push({ id: uid(), type: 'break', start: overlapStart, end: overlapEnd });
    if (overlapEnd < segment.end){
      nextSegments.push(cloneSegment(segment, { id: uid(), start: overlapEnd }));
    }
  }

  if (!touchedWork){
    return { ok: false, reason: 'no_work_overlap', timeline };
  }

  return {
    ok: true,
    segments: normalizeSegments(nextSegments),
    timeline
  };
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

// ---------- State ----------
function defaultState(){
  return {
    schemaVersion: 1,
    settings: {
      theme: "night"
    },
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
      period: "all",
      isFilterSheetOpen: false
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
  if (!st.settings || typeof st.settings !== "object" || Array.isArray(st.settings)) st.settings = {};
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

  const legacyLogStatus = st.logbook.statusFilter === "calculated" ? "open" : st.logbook.statusFilter;
  const legacyUIStatus = st.ui.logFilter === "calculated" ? "open" : st.ui.logFilter;
  if (!["open", "paid", "all"].includes(legacyLogStatus)){
    st.logbook.statusFilter = ["open", "paid", "all"].includes(legacyUIStatus) ? legacyUIStatus : "open";
  } else {
    st.logbook.statusFilter = legacyLogStatus;
  }
  if (!("isFilterSheetOpen" in st.logbook)) st.logbook.isFilterSheetOpen = false;
  if (!("period" in st.logbook)){
    const legacyMap = { "7d": "30d", "30d": "30d", "90d": "quarter", "all": "all" };
    st.logbook.period = legacyMap[st.ui.logPeriod] || "all";
  }
  if (!["all", "30d", "month", "quarter"].includes(st.logbook.period)) st.logbook.period = "all";

  const normalizedStatusFilter = Array.isArray(st.settlementList.statusFilter)
    ? [...new Set(st.settlementList.statusFilter.filter(status => ["draft", "calculated", "paid"].includes(status)))]
    : [];
  st.settlementList.statusFilter = normalizedStatusFilter.length
    ? normalizedStatusFilter
    : [...SETTLEMENT_LIST_DEFAULTS.statusFilter];
  if (typeof st.settlementList.onlyInvoices !== "boolean") st.settlementList.onlyInvoices = SETTLEMENT_LIST_DEFAULTS.onlyInvoices;
  if (typeof st.settlementList.showFixed !== "boolean") st.settlementList.showFixed = SETTLEMENT_LIST_DEFAULTS.showFixed;
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
  const isLeavingEdit = state.ui.editSettlementId === settlementId;
  if (isLeavingEdit) {
    // Auto-commit pending date draft (als gebruiker datum aanpaste maar vinkje niet klikte)
    const pendingDate = ui.settlementDateDraft[settlementId];
    if (pendingDate) {
      actions.editSettlement(settlementId, (draft) => {
        draft.dateOverride = pendingDate;
        draft.date = pendingDate;
        if (!draft.invoiceLocked) draft.invoiceDate = pendingDate;
      });
    }
    delete ui.settlementDateDraft[settlementId];
  }
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

function getWorkProductSnapshot(sourceState = state){
  const products = sourceState?.products || [];
  const product = products.find(p => (p.name || "").trim().toLowerCase() === "werk") || null;
  return {
    product,
    unitPrice: Number(product?.unitPrice ?? 0),
    vatRate: Number(product?.vatRate ?? 0.21)
  };
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
  if (!st.settings) st.settings = { theme: "night" };
  for (const legacyKey of ["hourlyRate", "vatRate"]) delete st.settings[legacyKey];
  if (!("theme" in st.settings)) st.settings.theme = "night";
  st.settings.theme = normalizeTheme(st.settings.theme);
  if (!st.customers) st.customers = [];
  if (!st.products) st.products = [];
  if (!st.logs) st.logs = [];
  if (!st.settlements) st.settlements = [];
  if (!("activeLogId" in st)) st.activeLogId = null;
  ensureUIPreferences(st);

  for (const c of st.customers){
    c.fixedSettlementTemplate = {
      ...getDefaultFixedSettlementTemplate(),
      ...(c.fixedSettlementTemplate || {}),
      enabled: Boolean(c.fixedSettlementTemplate?.enabled),
      periodType: c.fixedSettlementTemplate?.periodType || "quarter",
      laborInvoiceUnits: Math.max(0, round2(Number(c.fixedSettlementTemplate?.laborInvoiceUnits) || 0)),
      laborCashUnits: Math.max(0, round2(Number(c.fixedSettlementTemplate?.laborCashUnits) || 0)),
      greenInvoiceUnits: Math.max(0, round2(Number(c.fixedSettlementTemplate?.greenInvoiceUnits) || 0)),
      greenCashUnits: Math.max(0, round2(Number(c.fixedSettlementTemplate?.greenCashUnits) || 0)),
      note: typeof c.fixedSettlementTemplate?.note === "string" ? c.fixedSettlementTemplate.note : ""
    };
  }
  ensureUniqueCustomerNicknames(st);
  ensureCoreProducts(st);

  // settlement status default
  for (const s of st.settlements){
    // Backward compat: bestaande settlements zonder type zijn "normal"
    if (!s.type){
      s.type = s.kind === "fixed-period" ? "fixed_quarterly" : "normal";
    }
    // Backward compat: vaste kwartaalafrekeningen zonder "fixed" status krijgen die nu
    if (s.type === "fixed_quarterly" && s.status !== "fixed"){
      s.status = "fixed";
    }
    // Voeg quarterKey toe als die ontbreekt
    if (s.type === "fixed_quarterly" && !s.quarterKey){
      s.quarterKey = getQuarterKey(s.periodStart || s.date);
    }
    // Normal settlement status default
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
    s.manualOverride = {
      ...getDefaultSettlementManualOverride(),
      ...(s.manualOverride || {}),
      enabled: Boolean(s.manualOverride?.enabled),
      hoursInvoice: Math.max(0, round2(Number(s.manualOverride?.hoursInvoice) || 0)),
      hoursCash: Math.max(0, round2(Number(s.manualOverride?.hoursCash) || 0)),
      groenInvoice: Math.max(0, round2(Number(s.manualOverride?.groenInvoice) || 0)),
      groenCash: Math.max(0, round2(Number(s.manualOverride?.groenCash) || 0))
    };
    syncSettlementDatesFromLogs(s, st);
    ensureSettlementInvoiceDefaults(s);
    // Gebruik syncSettlementAmountsFromManualOverride (met lokale st) voor manual-override
    // settlements zodat de globale `state` variabele nog niet nodig is (TDZ vermijden).
    if (s.manualOverride?.enabled) {
      syncSettlementAmountsFromManualOverride(s, st);
    } else {
      syncSettlementAmounts(s);
    }
  }
  // log fields
  for (const l of st.logs){
    if (!l.segments) l.segments = [];
    if (!l.items) l.items = [];
    if (!l.date) l.date = todayISO();
  }

  ensureUIPreferences(st);

  // Fixed quarter settlements: ensure + sync for all active templates at load time
  try {
    syncAllFixedQuarterSettlements(st);
  } catch(e) {
    console.error("[loadState] syncAllFixedQuarterSettlements mislukt:", e);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(st));

  return st;
}

function saveState(nextState = state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)); }

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

function getDefaultSettlementManualOverride(){
  return {
    enabled: false,
    hoursInvoice: 0,
    hoursCash: 0,
    groenInvoice: 0,
    groenCash: 0
  };
}

function getSettlementManualOverride(settlement){
  const defaults = getDefaultSettlementManualOverride();
  const source = settlement?.manualOverride || {};
  return {
    ...defaults,
    enabled: Boolean(source.enabled),
    hoursInvoice: Math.max(0, round2(Number(source.hoursInvoice) || 0)),
    hoursCash: Math.max(0, round2(Number(source.hoursCash) || 0)),
    groenInvoice: Math.max(0, round2(Number(source.groenInvoice) || 0)),
    groenCash: Math.max(0, round2(Number(source.groenCash) || 0))
  };
}

function getSettlementCalcMode(settlement){
  return (settlement?.manualOverride && settlement.manualOverride.enabled) ? "manual" : "logs";
}

function getDefaultFixedSettlementTemplate(){
  return {
    enabled: false,
    periodType: "quarter",
    laborInvoiceUnits: 0,
    laborCashUnits: 0,
    greenInvoiceUnits: 0,
    greenCashUnits: 0,
    note: ""
  };
}

function getCustomerFixedTemplate(customer){
  const defaults = getDefaultFixedSettlementTemplate();
  const source = customer?.fixedSettlementTemplate || {};
  return {
    ...defaults,
    enabled: Boolean(source.enabled),
    periodType: source.periodType || defaults.periodType,
    laborInvoiceUnits: Math.max(0, round2(Number(source.laborInvoiceUnits) || 0)),
    laborCashUnits: Math.max(0, round2(Number(source.laborCashUnits) || 0)),
    greenInvoiceUnits: Math.max(0, round2(Number(source.greenInvoiceUnits) || 0)),
    greenCashUnits: Math.max(0, round2(Number(source.greenCashUnits) || 0)),
    note: typeof source.note === "string" ? source.note : ""
  };
}

// ---------- Fixed-period quarter settlement helpers ----------
// A fixed-period settlement is identified by metadata, not by inference from dates or notes.
function isFixedPeriodSettlement(settlement){
  return settlement?.kind === "fixed-period";
}
// Central type check for fixed quarterly settlements.
// Covers both the new explicit type field and the legacy kind field for backward compat.
function isFixedQuarterlySettlement(settlement){
  return settlement?.type === "fixed_quarterly" || settlement?.kind === "fixed-period";
}

// Find existing fixed quarter settlement for a customer and period start
function findFixedQuarterSettlement(settlements, customerId, periodStart){
  return (settlements || []).find(s =>
    s.kind === "fixed-period" &&
    s.fixedPeriodType === "quarter" &&
    s.templateCustomerId === customerId &&
    s.periodStart === periodStart
  ) || null;
}

// Ensure exactly 1 fixed quarter settlement exists for the current quarter.
// Idempotent: same input = same result, never creates duplicates.
function ensureCurrentFixedQuarterSettlement(st, customer){
  if (!customer?.id) return null;
  const tmpl = getCustomerFixedTemplate(customer);
  if (!tmpl.enabled) return null;

  const today = todayISO();
  const periodStart = getQuarterStart(today);
  const periodEnd = getQuarterEnd(today);

  // Check if settlement already exists for this quarter
  const existing = findFixedQuarterSettlement(st.settlements, customer.id, periodStart);
  if (existing) return existing;

  // Create new fixed quarter settlement with template values as manual override
  const s = {
    id: uid(),
    customerId: customer.id,
    date: periodStart,
    invoiceDate: periodStart,
    createdAt: now(),
    logIds: [],
    lines: [],
    allocations: {},
    // Nieuw type-systeem: vaste kwartaalafrekening is altijd "fixed_quarterly" / "fixed"
    type: "fixed_quarterly",
    status: "fixed",
    quarterKey: getQuarterKey(periodStart),
    markedCalculated: true,
    isCalculated: true,
    calculatedAt: now(),
    invoiceAmount: 0,
    cashAmount: 0,
    invoicePaid: true,
    cashPaid: true,
    invoiceNumber: null,
    invoiceLocked: true,
    // Fixed-period metadata: behoud voor backward compat met bestaande functies
    kind: "fixed-period",
    fixedPeriodType: "quarter",
    templateCustomerId: customer.id,
    periodStart,
    periodEnd,
    // Use dateOverride to prevent syncSettlementDatesFromLogs from moving the date
    dateOverride: periodStart,
    // Manual override with template values (bedragen blijven vast, logs herberekenen niet)
    manualOverride: {
      enabled: true,
      hoursInvoice: round2(tmpl.laborInvoiceUnits),
      hoursCash: round2(tmpl.laborCashUnits),
      groenInvoice: round2(tmpl.greenInvoiceUnits),
      groenCash: round2(tmpl.greenCashUnits)
    },
    // fixedConfig: configuratie van de vaste kwartaalafrekening (voor latere uitbreiding)
    fixedConfig: {
      periodType: "quarterly",
      autoInvoice: true,
      autoPaid: true,
      startsOn: periodStart,
      endsOn: periodEnd
    },
    // Template note as initial value (only set on creation, never overwritten by sync)
    note: tmpl.note || ""
  };

  syncSettlementAmountsFromManualOverride(s, st);
  const factureAmount = Number(getSettlementTotals(s).invoiceTotal || 0);
  if (factureAmount > 0){
    s.invoiceNumber = getNextInvoiceNumber(st.settlements || []);
  }
  st.settlements.unshift(s);
  return s;
}

// Sync manual override amounts for a fixed-period settlement without full state dependency.
// Needed during init when `state` is not yet available as a global.
function syncSettlementAmountsFromManualOverride(settlement, sourceState){
  if (!settlement?.manualOverride?.enabled) return;
  const manual = settlement.manualOverride;
  const products = sourceState?.products || [];
  const { unitPrice: workUnitPrice, vatRate: workVatRate } = getWorkProductSnapshot(sourceState);
  const greenProduct = products.find(p => (p.name || "").toLowerCase() === "groen");
  const greenRate = Number(greenProduct?.unitPrice ?? 0);

  let invoiceExcl = (manual.hoursInvoice || 0) * workUnitPrice + (manual.groenInvoice || 0) * greenRate;
  let cashExcl = (manual.hoursCash || 0) * workUnitPrice + (manual.groenCash || 0) * greenRate;
  invoiceExcl = round2(invoiceExcl);
  cashExcl = round2(cashExcl);

  settlement.invoiceAmount = round2(invoiceExcl + round2(invoiceExcl * workVatRate));
  settlement.cashAmount = round2(cashExcl);
}

// Sync logIds for a fixed quarter settlement: link all logs of this customer within the quarter.
// Idempotent: produces the same result regardless of how many times called.
// Only syncs current quarter; historical quarters are left untouched.
function syncFixedQuarterSettlementLogs(settlement, st){
  if (!isFixedPeriodSettlement(settlement)) return;
  if (!settlement.periodStart || !settlement.periodEnd) return;

  const customerId = settlement.templateCustomerId || settlement.customerId;
  if (!customerId) return;

  // Collect all logs for this customer within the quarter period
  const quarterLogIds = (st.logs || [])
    .filter(l =>
      l.customerId === customerId &&
      isDateInRange(l.date, settlement.periodStart, settlement.periodEnd)
    )
    .map(l => l.id);

  // Set logIds (unique, no duplicates)
  settlement.logIds = [...new Set(quarterLogIds)];
}

// Central sync pipeline: run for all customers with active templates.
// Called at app init and after relevant mutations.
function syncAllFixedQuarterSettlements(st){
  const today = todayISO();
  const currentPeriodStart = getQuarterStart(today);

  for (const customer of (st.customers || [])){
    const tmpl = getCustomerFixedTemplate(customer);
    if (!tmpl.enabled) continue;

    // Ensure settlement exists for current quarter
    ensureCurrentFixedQuarterSettlement(st, customer);

    // Sync logs only for the current quarter settlement (historical = untouched)
    const currentSettlement = findFixedQuarterSettlement(st.settlements, customer.id, currentPeriodStart);
    if (currentSettlement){
      syncFixedQuarterSettlementLogs(currentSettlement, st);
    }
  }
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
      onHold(e);
    }, 450);
  };

  const up = (e)=>{
    e.preventDefault();
    e.stopPropagation();
    if (!isPressing) return;
    const wasLongPress = didLongPress;
    clearPress();
    if (!wasLongPress) onTap(e);
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
// Central visual-state → CSS class mapper. Add new states here, never inline.
function statusClassFromStatus(s){
  if (s === "linked" || s === "draft") return "status-linked";
  if (s === "calculated") return "status-calculated";
  if (s === "paid") return "status-paid";
  if (s === "fixed") return "status-fixed";
  if (s === "free") return "status-free";
  return "status-free";
}
function getLogVisualState(log){
  const state = logStatus(log.id);
  if (state === "paid") return { state: "paid", color: "#00a05a" };
  if (state === "calculated") return { state: "calculated", color: "#ff8c00" };
  if (state === "linked") return { state: "linked", color: "#ffcc00" };
  if (state === "fixed") return { state: "fixed", color: "#9358dc" };
  return { state: "free", color: "#7ba7c4" };
}
function getManualOverrideTotals(settlement){
  const manual = getSettlementManualOverride(settlement);
  // try-catch vereist: state kan nog in TDZ zijn wanneer aangeroepen vanuit loadState().
  let greenProduct = null, workSnapshot = { unitPrice: 0, vatRate: 0.21 };
  try { workSnapshot = getWorkProductSnapshot(); } catch(e) { /* TDZ */ }
  try { greenProduct = findGreenProduct(); } catch(e) { /* TDZ */ }
  const greenRate = Number(greenProduct?.unitPrice ?? 0);

  const allocations = {
    work: {
      invoiceQty: manual.hoursInvoice,
      cashQty: manual.hoursCash,
      unitPrice: workSnapshot.unitPrice
    },
    green: {
      invoiceQty: manual.groenInvoice,
      cashQty: manual.groenCash,
      unitPrice: greenRate
    }
  };

  let invoiceExcl = 0;
  let cashExcl = 0;
  for (const alloc of Object.values(allocations)){
    invoiceExcl += (Number(alloc.invoiceQty) || 0) * (Number(alloc.unitPrice) || 0);
    cashExcl += (Number(alloc.cashQty) || 0) * (Number(alloc.unitPrice) || 0);
  }

  invoiceExcl = round2(invoiceExcl);
  cashExcl = round2(cashExcl);
  const invoiceVat = round2(invoiceExcl * workSnapshot.vatRate);
  const invoiceTotal = round2(invoiceExcl + invoiceVat);
  const cashTotal = round2(cashExcl);

  return { invoiceSubtotal: invoiceExcl, invoiceVat, invoiceTotal, cashSubtotal: cashExcl, cashTotal };
}

function getSettlementTotals(settlement){
  const mode = getSettlementCalcMode(settlement);
  if (mode === "manual"){
    return getManualOverrideTotals(settlement);
  }
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

  // Vaste kwartaalafrekeningen krijgen altijd paarse status, ongeacht de normale flow.
  if (isFixedQuarterlySettlement(settlement)) return { state: "fixed", settlement };

  const icons = getSettlementIconPresentation(settlement);
  const visibleIcons = icons.filter(icon => icon.show);
  const allVisiblePaid = visibleIcons.length > 0 && visibleIcons.every(icon => icon.color === "green");

  if (allVisiblePaid) return { state: "paid", settlement };
  if (isSettlementCalculated(settlement)) return { state: "calculated", settlement };
  return { state: "linked", settlement };
}
function getSettlementVisualState(settlement){
  if (!settlement) return { state: "open", accentClass: "card-accent--open", navClass: "nav--linked" };
  // Vaste kwartaalafrekeningen: altijd paars, nooit door de normale draft/calculated/paid flow.
  if (isFixedQuarterlySettlement(settlement)){
    return { state: "fixed", accentClass: "card-accent--fixed", navClass: "nav--fixed" };
  }
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
  if (visual.state === "fixed") return "fixed";
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
  const totalWorkLabel = durMsToHM(sumWorkMs(log));
  const extraProducts = countExtraProducts(log);
  const extraLabel = extraProducts > 0 ? `<span>+${extraProducts}</span>` : "";

  return `
    <div class="item ${cls}" data-open-log="${log.id}">
      <div class="item-main">
        <div class="item-title">${esc(cname(log.customerId))}</div>
        <div class="meta-text log-card-info">
          <span>${esc(formatLogDatePretty(log.date))}</span> · <span>${esc(startTime)}</span>${extraLabel ? ` · ${extraLabel}` : ""}
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
  const r = Number(line.vatRate ?? 0.21);
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
  // Vaste kwartaalafrekeningen gebruiken nooit de normale draft/calculated/paid flow.
  if (isFixedQuarterlySettlement(settlement)) return;
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
  const { product: labourProduct, unitPrice: workUnitPrice, vatRate: workVatRate } = getWorkProductSnapshot(sourceState);
  if (hours > 0){
    lines.push({
      id: uid(),
      productId: labourProduct?.id || null,
      description: labourProduct?.name || "Werk",
      unit: labourProduct?.unit || "uur",
      qty: hours,
      unitPrice: workUnitPrice,
      vatRate: workVatRate,
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
  const totals = getSettlementTotals(settlement);
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
  // Guard: fixed-period settlements use manual override, never rebuild allocations from logs
  if (isFixedPeriodSettlement(settlement)) return settlement.allocations || {};
  const { baseWorkHours, baseDate, productMap } = computeBaseTotals(settlement, sourceState);
  const { product: labourProduct, unitPrice: workUnitPrice, vatRate: workVatRate } = getWorkProductSnapshot(sourceState);
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
      unitPrice: workUnitPrice,
      productId: labourProduct?.id || null,
      name: labourProduct?.name || "Werk",
      unit: labourProduct?.unit || "uur",
      vatRate: workVatRate
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
  const allocs = settlement.allocations || {};
  let invoiceExcl = 0;
  let cashExcl = 0;
  let invoiceVat = 0;
  for (const alloc of Object.values(allocs)){
    const invoiceLine = (alloc.invoiceQty || 0) * (alloc.unitPrice || 0);
    const cashLine = (alloc.cashQty || 0) * (alloc.unitPrice || 0);
    const vatRate = Number(alloc.vatRate ?? 0.21);
    invoiceExcl += invoiceLine;
    cashExcl += cashLine;
    invoiceVat += round2(invoiceLine * vatRate);
  }
  invoiceExcl = round2(invoiceExcl);
  cashExcl = round2(cashExcl);
  invoiceVat = round2(invoiceVat);
  const invoiceTotal = round2(invoiceExcl + invoiceVat);
  const cashTotal = round2(cashExcl);
  return { invoiceSubtotal: invoiceExcl, invoiceVat, invoiceTotal, cashSubtotal: cashExcl, cashTotal };
}

// ---------- UI state ----------
const ui = {
  navStack: [{ view: "logs" }],
  transition: null,
  logDetailSegmentEditId: null,
  logDetailPauseDraft: null,
  segmentDrafts: {},
  settlementDateDraft: {},
  customerDetailEditingId: null,
  customerDetailDrafts: {},
  productDetailEditingId: null,
  productDetailDrafts: {},
  activeLogQuickAdd: {
    open: false,
    productId: null,
    qty: "1"
  },
  insightsPeriod: "maand",
  insightsAnchorDate: new Date(),
  insightsDashboardMode: "logs",
  meerPanel: "default",
  workRhythmSelectedKey: null,
  customerDetailInsightsPeriod: "maand",
  customerDetailInsightsAnchor: null,
  customerDetailInsightsMode: "logs",
  customerDetailRhythmSelectedKey: null
};

function normalizeInsightsDashboardMode(mode){
  return ["logs", "settlements"].includes(mode) ? mode : null;
}

function resolveInitialInsightsDashboardMode(){
  const storedMode = normalizeInsightsDashboardMode(state?.ui?.insightsDashboardMode);
  if (storedMode) return storedMode;
  const legacyMode = normalizeInsightsDashboardMode(state?.ui?.insightsCustomersMode);
  if (legacyMode) return legacyMode;
  return "logs";
}

ui.insightsDashboardMode = resolveInitialInsightsDashboardMode();

// Guardrail: keep state mutations inside actions + commit.
function commit(){
  state = validateAndRepairState(state);
  // Sync fixed quarter settlements on every commit (idempotent, safe to run repeatedly)
  try {
    syncAllFixedQuarterSettlements(state);
  } catch(e) {
    console.error("[commit] syncAllFixedQuarterSettlements mislukt:", e);
  }
  saveState(state);
  try {
    render();
  } catch(e) {
    console.error("[commit] render mislukt:", e);
    // Sla toch op zodat state niet verloren gaat bij een render-fout
    saveState(state);
  }
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
      type: "normal",
      status: "draft", markedCalculated: false, isCalculated: false, calculatedAt: null,
      invoiceAmount: 0, cashAmount: 0, invoicePaid: false, cashPaid: false,
      invoiceNumber: null,
      invoiceDate,
      invoiceLocked: false,
      manualOverride: getDefaultSettlementManualOverride()
    };
    state.settlements.unshift(s);
    commit();
    return s;
  },
  linkLogToSettlement(logId, settlementId){
    // Ontkoppel de log uit alle afrekeningen (inclusief calculated: geen wijziging voor die)
    for (const s of state.settlements){
      if (isSettlementCalculated(s)) continue; // geen wijziging aan calculated settlements
      if (isFixedQuarterlySettlement(s)) continue; // vaste kwartaalafrekeningen via auto-sync
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
        invoiceNumber: null, invoiceDate: log.date || todayISO(), invoiceLocked: false,
        manualOverride: getDefaultSettlementManualOverride()
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
  toggleSettlementManualOverride(settlementId){
    const s = state.settlements.find(x => x.id === settlementId);
    if (!s) return;
    const manual = getSettlementManualOverride(s);
    s.manualOverride = {
      ...manual,
      enabled: !manual.enabled
    };
    syncSettlementAmounts(s);
    ensureSettlementInvoiceDefaults(s);
    syncSettlementStatus(s);
    commit();
  },
  bumpSettlementManualValue(settlementId, key, delta){
    const s = state.settlements.find(x => x.id === settlementId);
    if (!s) return;
    const allowed = new Set(["hoursInvoice", "hoursCash", "groenInvoice", "groenCash"]);
    if (!allowed.has(key)) return;
    const manual = getSettlementManualOverride(s);
    const step = key.startsWith("hours") ? 0.5 : 1;
    const next = Math.max(0, round2((Number(manual[key]) || 0) + (Number(delta) * step)));
    s.manualOverride = {
      ...manual,
      [key]: next
    };
    syncSettlementAmounts(s);
    ensureSettlementInvoiceDefaults(s);
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
  toggleCustomerTemplateEnabled(customerId){
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return;
    const tmpl = getCustomerFixedTemplate(c);
    c.fixedSettlementTemplate = { ...tmpl, enabled: !tmpl.enabled };
    commit();
  },
  bumpCustomerTemplateValue(customerId, key, delta){
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return;
    const allowed = new Set(["laborInvoiceUnits", "laborCashUnits", "greenInvoiceUnits", "greenCashUnits"]);
    if (!allowed.has(key)) return;
    const tmpl = getCustomerFixedTemplate(c);
    const step = key.startsWith("labor") ? 0.5 : 1;
    const next = Math.max(0, round2((Number(tmpl[key]) || 0) + (Number(delta) * step)));
    c.fixedSettlementTemplate = { ...tmpl, [key]: next };
    commit();
  },
  updateCustomerTemplateNote(customerId, note){
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return;
    const tmpl = getCustomerFixedTemplate(c);
    c.fixedSettlementTemplate = { ...tmpl, note: String(note || "").trim() };
    commit();
  },
  updateProduct(productId, patch){
    const p = state.products.find(x => x.id === productId);
    if (!p) return;
    Object.assign(p, patch);
    commit();
  },
  deleteProduct(productId){ state.products = state.products.filter(x => x.id !== productId); commit(); }
};

function applySegmentUpdate(segments, segmentId, nextStart, nextEnd) {
  let target = segments.find(x => x.id === segmentId);
  if (!target) return segments;
  target.start = nextStart;
  target.end = nextEnd;

  let newSegments = [];
  for (const s of segments) {
    if (s.id === target.id) continue;
    if (s.start < target.end && s.end > target.start) {
      if (s.start >= target.start && s.end <= target.end) {
        s._delete = true;
      } else if (s.start < target.start && s.end <= target.end) {
        s.end = target.start;
      } else if (s.start >= target.start && s.end > target.end) {
        s.start = target.end;
      } else if (s.start < target.start && s.end > target.end) {
        const newSegment = cloneSegment(s, { id: uid(), start: target.end });
        s.end = target.start;
        newSegments.push(newSegment);
      }
    }
  }
  return normalizeSegments(segments.filter(s => !s._delete).concat(newSegments));
}

function rebuildLogSegments(log) {
  if (!log || !log.segments || log.segments.length === 0) return;
  const openSegments = log.segments.filter(s => s.start != null && s.end == null);
  const closedSegments = log.segments.filter(s => s.start != null && s.end != null && s.end > s.start);
  if (closedSegments.length === 0) return;

  const minStart = Math.min(...closedSegments.map(s => s.start));
  const maxEnd = Math.max(...closedSegments.map(s => s.end));

  const breaks = closedSegments.filter(s => s.type === "break");
  breaks.sort((a, b) => a.start - b.start);
  const mergedBreaks = [];
  for (const b of breaks) {
    const prev = mergedBreaks[mergedBreaks.length - 1];
    if (prev && prev.end >= b.start) {
      prev.end = Math.max(prev.end, b.end);
    } else {
      mergedBreaks.push({ ...b });
    }
  }

  const newSegments = [];
  let current = minStart;
  for (const b of mergedBreaks) {
    if (b.end <= current) continue;
    if (b.start > current) {
      const existingWork = closedSegments.find(s => s.type === "work" && s.start === current);
      newSegments.push({ id: existingWork ? existingWork.id : uid(), type: "work", start: current, end: b.start });
    }
    const breakStart = Math.max(current, b.start);
    const breakEnd = Math.min(maxEnd, b.end);
    newSegments.push({ id: b.id || uid(), type: "break", start: breakStart, end: breakEnd });
    current = breakEnd;
  }
  if (current < maxEnd) {
    const existingWork = closedSegments.find(s => s.type === "work" && s.start === current);
    newSegments.push({ id: existingWork ? existingWork.id : uid(), type: "work", start: current, end: maxEnd });
  }
  log.segments = [...newSegments, ...openSegments];
}

function toggleEditLog(logId){
  const isLeavingEdit = state.ui.editLogId === logId;
  if (isLeavingEdit){
    const log = state.logs.find(item => item.id === logId);
    // Auto-commit pending segment drafts (als gebruiker tijden aanpaste maar vinkje niet klikte)
    if (log) {
      let changed = false;
      (log.segments || []).forEach(s => {
        const draft = ui.segmentDrafts[s.id];
        if (!draft) return;
        const nextStart = parseLogTimeToMs(log.date, draft.start);
        const nextEnd = parseLogTimeToMs(log.date, draft.end);
        if (nextStart != null && nextEnd != null && nextEnd > nextStart) {
          s.start = nextStart;
          s.end = nextEnd;
          changed = true;
        }
        delete ui.segmentDrafts[s.id];
      });
      if (changed) rebuildLogSegments(log);
    }
  }
  ui.logDetailPauseDraft = null;
  actions.setEditLog(logId);
}

function cancelLogDateEditIfNeeded(){
  const active = currentView();
  if (active.view !== "logDetail") return;
  const logId = active.id;
  if (state.ui.editLogId !== logId) return;
  const log = state.logs.find(item => item.id === logId);
  state.ui.editLogId = null;
  ui.logDetailSegmentEditId = null;
  if (log) (log.segments || []).forEach(s => delete ui.segmentDrafts[s.id]);
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
  if (view === "customerInsights") return "Klantoverzicht";
  return "Tuinlog";
}

function renderInsightsTopbarPeriodSelector(active){
  const host = $("#topbarPeriodHost");
  if (!host) return;
  const show = ui.navStack.length === 1 && active.view === "meer";
  host.classList.toggle("hidden", !show);
  if (!show){
    host.innerHTML = "";
    return;
  }
  const period = ui.insightsPeriod || "maand";
  host.innerHTML = `
    <div class="insights-period-ctrl topbar-period-selector" role="tablist" aria-label="Periode selector">
      <button class="ipc-btn${period === "week" ? " ipc-active" : ""}" data-period="week">Week</button>
      <button class="ipc-btn${period === "maand" ? " ipc-active" : ""}" data-period="maand">Maand</button>
      <button class="ipc-btn${period === "kwartaal" ? " ipc-active" : ""}" data-period="kwartaal">Kwartaal</button>
      <button class="ipc-btn${period === "jaar" ? " ipc-active" : ""}" data-period="jaar">Jaar</button>
    </div>
  `;
  host.querySelectorAll('.ipc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.insightsPeriod = btn.dataset.period;
      renderMeer();
    });
  });
}

function renderTopbar(){
  const active = currentView();
  const topbar = document.querySelector(".topbar");
  const subtitleEl = $("#topbarSubtitle");
  const metricEl = $("#topbarMetric");
  const btnNew = $("#btnNewLog");
  const rightInfoEl = $("#topbarRightInfo");
  const topbarLeft = topbar.querySelector(".topbar-left");
  const topbarRight = topbar.querySelector(".topbar-right");
  let linkedCustomerId = "";
  topbar.classList.remove("nav--free", "nav--linked", "nav--calculated", "nav--paid", "nav--fixed", "topbar--period-only");
  topbar.classList.remove("topbar--log-detail");
  topbar.classList.remove("hidden");
  subtitleEl.classList.add("hidden");
  subtitleEl.textContent = "";
  metricEl.classList.add("hidden");
  metricEl.textContent = "";
  rightInfoEl?.classList.add("hidden");
  if (rightInfoEl) rightInfoEl.textContent = "";
  btnNew.classList.remove("topbar-edit");

  if (active.view === "logDetail"){
    topbar.classList.add("hidden");
    const log = state.logs.find(x => x.id === active.id);
    if (log){
      $("#topbarTitle").textContent = viewTitle(active);
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

  renderInsightsTopbarPeriodSelector(active);
  const isMeerRoot = ui.navStack.length === 1 && active.view === "meer";
  topbar.classList.toggle("topbar--period-only", isMeerRoot);
  topbarLeft?.classList.toggle("hidden", isMeerRoot);
  topbarRight?.classList.toggle("hidden", isMeerRoot);

  if (ui.navStack.length === 1 && active.view === "logs"){
    const pillLabel = getFilterPillLabel(state.logbook || {});
    if (rightInfoEl){
      rightInfoEl.innerHTML = `<button class="log-filter-pill" id="btnLogbookFilterPill" aria-label="Logboekfilters">${esc(pillLabel)}</button>`;
      rightInfoEl.classList.remove("hidden");
    }
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

  $("#btnLogbookFilterPill")?.addEventListener("click", ()=>{
    actions.setLogbook({ isFilterSheetOpen: !(state.logbook?.isFilterSheetOpen) });
    render();
  });
}

function setTab(key){
  ui.navStack = [{ view: key }];
  ui.transition = null;
  if (key !== "meer") ui.meerPanel = "default";
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
  const active = currentView();
  const isMeerRoot = ui.navStack.length === 1 && active.view === "meer";
  if (ui.navStack.length > 1){
    popView();
    return;
  }
  if (isMeerRoot && ui.workRhythmSelectedKey !== null){
    ui.workRhythmSelectedKey = null;
    renderMeer();
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
    "customer-fixed-template": "customerFixedTemplate",
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
  const customersBtn = document.getElementById("moreNavCustomers");
  const productsBtn = document.getElementById("moreNavProducts");
  const themeBtn = document.getElementById("moreThemeToggle");
  const exportBtn = document.getElementById("moreBackupExport");
  const importBtn = document.getElementById("moreBackupImport");
  const importInput = document.getElementById("backupImportInput");
  if (!row || !customersBtn || !productsBtn || !themeBtn || !exportBtn || !importBtn || !importInput) return;

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
  themeBtn.classList.remove("is-active");
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

  if (!exportBtn.dataset.bound){
    exportBtn.addEventListener("click", exportBackup);
    exportBtn.dataset.bound = "true";
  }

  if (!importBtn.dataset.bound){
    importBtn.addEventListener("click", ()=> importInput.click());
    importBtn.dataset.bound = "true";
  }

  if (!importInput.dataset.bound){
    importInput.addEventListener("change", handleBackupImport);
    importInput.dataset.bound = "true";
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

function parseBackupFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(String(reader.result || ""));
    reader.onerror = ()=> reject(new Error("Bestand kon niet worden gelezen."));
    reader.readAsText(file);
  });
}

function validateBackupPayload(payload){
  if (!payload || typeof payload !== "object") return "Ongeldige backup: JSON-object ontbreekt.";
  if (payload.version !== STORAGE_KEY) return "Ongeldige backup-versie. Alleen backups van TuinLog MVP v1 zijn toegestaan.";
  if (!payload.data || typeof payload.data !== "object") return "Ongeldige backup: data-object ontbreekt.";
  const required = ["customers", "logs", "settlements", "settings"];
  const missing = required.filter((key)=> !(key in payload.data));
  if (missing.length) return `Ongeldige backup: ontbrekende velden (${missing.join(", ")}).`;
  return "";
}

function exportBackup(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw){
      alert("Er is geen lokale data gevonden om te exporteren.");
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
  } catch {
    alert("Backup exporteren is mislukt. Controleer of je data geldig is.");
  }
}

async function handleBackupImport(event){
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await parseBackupFile(file);
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      alert("Import mislukt: bestand bevat geen geldige JSON.");
      event.target.value = "";
      return;
    }

    const validationError = validateBackupPayload(payload);
    if (validationError){
      alert(validationError);
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
      event.target.value = "";
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
    location.reload();
  } catch {
    alert("Import mislukt: kon het backup-bestand niet verwerken.");
  } finally {
    event.target.value = "";
  }
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

function getLogTimestamp(log){
  const createdAt = Number(log?.createdAt);
  if (Number.isFinite(createdAt)) return createdAt;
  const dateValue = new Date(`${log?.date || ""}T00:00:00`).getTime();
  return Number.isFinite(dateValue) ? dateValue : 0;
}

function getPeriodStart(period){
  const current = new Date();
  if (period === "30d") return now() - (30 * 86400000);
  if (period === "month") return new Date(current.getFullYear(), current.getMonth(), 1).getTime();
  if (period === "quarter"){
    const quarterMonth = Math.floor(current.getMonth() / 3) * 3;
    return new Date(current.getFullYear(), quarterMonth, 1).getTime();
  }
  return null;
}

function getStatusKey(logId){
  const status = getWorkLogStatus(logId);
  if (status === "calculated") return "calculated";
  if (status === "paid") return "paid";
  if (status === "fixed") return "fixed";
  return "open";
}

function getFilterPillLabel(logbook){
  const status = logbook?.statusFilter || "open";
  const period = logbook?.period || "all";
  const statusLabel = { open: "Open", paid: "Betaald", all: "Alles" }[status] || "Open";
  const periodLabel = { all: "", "30d": "30d", month: "Maand", quarter: "Kwartaal" }[period] || "";
  if (status === "all" && period === "all") return "Alles";
  if (!periodLabel) return statusLabel;
  return `${statusLabel} · ${periodLabel}`;
}

function applyFiltersAndSort(logs){
  const cfg = state.logbook || {};
  const statusFilter = cfg.statusFilter || "open";
  const period = cfg.period || "all";
  const minTimestamp = getPeriodStart(period);

  const filtered = logs.filter(log => {
    const status = getStatusKey(log.id);
    if (statusFilter === "open"){
      // Logboek abstraheert "open" als niet-betaald: open + calculated + fixed (actief).
      if (status !== "open" && status !== "calculated" && status !== "fixed") return false;
    } else if (statusFilter === "paid"){
      if (status !== "paid") return false;
    }

    if (minTimestamp != null){
      const ts = getLogTimestamp(log);
      if (Number.isFinite(ts) && ts < minTimestamp) return false;
    }
    return true;
  });

  filtered.sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a));
  return [{ header: "", logs: filtered }];
}

function renderLogs(){
  const el = $("#tab-logs");
  const active = state.activeLogId ? state.logs.find(l => l.id === state.activeLogId) : null;
  const logbook = state.logbook || {};
  const period = logbook.period || "all";
  const isFilterSheetOpen = Boolean(logbook.isFilterSheetOpen);

  // Timer-first: idle or active state
  let timerBlock = "";
  if (active){
    const isPaused = currentOpenSegment(active)?.type === "break";
    const greenCount = countGreenItems(active);
    timerBlock = `
      <div class="timer-widget-card">
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
      <div class="timer-widget-card">
        <div class="timer-idle timer-idle--compact">
          ${cloud
            ? `<div class="start-cloud recent-customers recent-customers--compact">
                <button class="cloud-play-btn" id="btnIdleStart" title="Start nieuwe werklog" aria-label="Start nieuwe werklog">
                  <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 6l10 6-10 6z"/></svg>
                </button>
                ${cloud}
              </div>`
            : `<button class="timer-action-btn green-btn idle-start-btn" id="btnIdleStart" title="Start nieuwe werklog" aria-label="Start nieuwe werklog">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6l10 6-10 6z" stroke-linejoin="round"/></svg>
              </button>`}
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

  const statusFilter = logbook.statusFilter || "open";
  const showRestore = statusFilter !== "open" || period !== "all";

  el.innerHTML = `
    <div class="log-filter-panel-wrap ${isFilterSheetOpen ? "is-open" : ""}">
      <div class="log-filter-sheet" id="logFilterSheet">
        <div class="log-filter-sheet-title">Filters</div>
        <div class="log-filter-sheet-section">
          <div class="log-filter-sheet-label">Status</div>
          <div class="log-filter-options">
            <button class="log-filter-option ${statusFilter === "open" ? "is-active" : ""}" data-log-sheet-status="open">Open</button>
            <button class="log-filter-option ${statusFilter === "paid" ? "is-active" : ""}" data-log-sheet-status="paid">Betaald</button>
            <button class="log-filter-option ${statusFilter === "all" ? "is-active" : ""}" data-log-sheet-status="all">Alles</button>
          </div>
        </div>
        <div class="log-filter-sheet-section">
          <div class="log-filter-sheet-label">Periode</div>
          <div class="log-filter-options">
            <button class="log-filter-option ${period === "all" ? "is-active" : ""}" data-log-sheet-period="all">Alles</button>
            <button class="log-filter-option ${period === "30d" ? "is-active" : ""}" data-log-sheet-period="30d">30d</button>
            <button class="log-filter-option ${period === "month" ? "is-active" : ""}" data-log-sheet-period="month">Maand</button>
            <button class="log-filter-option ${period === "quarter" ? "is-active" : ""}" data-log-sheet-period="quarter">Kwartaal</button>
          </div>
        </div>
        ${showRestore ? `<button class="btn ghost" id="btnRestoreLogFilters">Herstel</button>` : ""}
      </div>
    </div>
    <div class="stack stack-tight stack-logs">${timerBlock}<div class="flat-list flat-list--logbook">${list}</div></div>
  `;

  // Timer-first actions
  if (active){
    $("#btnPause")?.addEventListener("click", ()=>{
      actions.pauseLog(active.id);
    });
    const greenBtn = $("#btnAddGreen");
    if (greenBtn){
      // Hard prevent accidental selection/open
      greenBtn.addEventListener("contextmenu", (e)=> e.preventDefault());
      greenBtn.style.webkitTouchCallout = "none";
      greenBtn.style.webkitUserSelect = "none";
      greenBtn.style.userSelect = "none";

      bindStepButton(
        greenBtn,
        (e)=> { if(e){ e.preventDefault(); e.stopPropagation(); } adjustLogGreenQty(active.id, +1); },
        (e)=> { if(e){ e.preventDefault(); e.stopPropagation(); } adjustLogGreenQty(active.id, +0.5); }
      );
    }
    $("#btnStop")?.addEventListener("click", ()=>{
      actions.stopLog(active.id);
    });
    // Tap timer block to open active log detail
    $(".timer-active")?.addEventListener("click", (e)=>{
      if (e.target.closest("button")) return;
      openSheet("log", active.id);
    });
  } else {
    const idleStartBtn = $("#btnIdleStart");
    if (idleStartBtn){
      idleStartBtn.style.webkitTapHighlightColor = "transparent";
      idleStartBtn.addEventListener("click", (e)=>{
        if (e) e.preventDefault();
        pushView({ view: "newLog" });
      });
    }
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
  el.querySelectorAll("[data-log-sheet-status]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      actions.setLogbook({ statusFilter: btn.getAttribute("data-log-sheet-status") || "open", isFilterSheetOpen: false });
      render();
    });
  });
  el.querySelectorAll("[data-log-sheet-period]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      actions.setLogbook({ period: btn.getAttribute("data-log-sheet-period") || "all", isFilterSheetOpen: false });
      render();
    });
  });
  $("#btnRestoreLogFilters")?.addEventListener("click", ()=>{
    actions.setLogbook({ statusFilter: "open", period: "all", isFilterSheetOpen: false });
    render();
  });

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
  const notCalculatedIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"></rect><path d="M8.5 8h7" stroke-linecap="round"></path><circle cx="9" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="15.5" r="1"></circle><circle cx="12" cy="15.5" r="1"></circle><circle cx="15" cy="15.5" r="1"></circle></svg>`;

  const totalNotCalculatedExVat = round2(state.settlements.reduce((sum, settlement)=>{
    if (isFixedQuarterlySettlement(settlement)) return sum;
    if (isSettlementCalculated(settlement)) return sum;
    const totals = getSettlementTotals(settlement);
    return sum + Number(totals.invoiceTotal || 0) + Number(totals.cashTotal || 0);
  }, 0));
  const totalInvoiceOutstanding = round2(state.settlements.reduce((sum, settlement)=>{
    if (isFixedQuarterlySettlement(settlement)) return sum;
    if (!isSettlementCalculated(settlement)) return sum;
    const flags = getSettlementPaymentFlags(settlement);
    if (flags.invoicePaid) return sum;
    const pay = settlementPaymentState(settlement);
    if ((Number(pay.invoiceTotal) || 0) <= 0) return sum;
    return sum + Number(pay.invoiceTotal || 0);
  }, 0));
  const totalCashOutstanding = round2(state.settlements.reduce((sum, settlement)=>{
    if (isFixedQuarterlySettlement(settlement)) return sum;
    if (!isSettlementCalculated(settlement)) return sum;
    const flags = getSettlementPaymentFlags(settlement);
    if (flags.cashPaid) return sum;
    const pay = settlementPaymentState(settlement);
    if ((Number(pay.cashTotal) || 0) <= 0) return sum;
    return sum + Number(pay.cashTotal || 0);
  }, 0));

  const list = [...state.settlements]
    .filter((s)=>{
      // Vaste kwartaalafrekeningen worden gefilterd via showFixed, niet via statusFilter.
      if (isFixedQuarterlySettlement(s)) return Boolean(prefs.showFixed);
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
      const isFixed = isFixedQuarterlySettlement(s);
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

      if (isFixed){
        // Vaste kwartaalafrekening: toon paars, vaste bedragen, geen betaal-toggles.
        const quarterLabel = s.quarterKey || getQuarterKey(s.date || s.periodStart);
        const fixedAmt = Number(s.invoiceAmount || 0) + Number(s.cashAmount || 0);
        const fixedAmtDisplay = fixedAmt > 0 ? formatMoneyEUR0(fixedAmt) : "";
        const detailItems = [
          esc(formatDateNoWeekday(s.date || s.periodStart)),
          `${(s.logIds||[]).length} logs`,
          formatDurationCompact(totalMinutes)
        ];
        return `
          <div class="item settlement-card-item ${visual.accentClass}" data-open-settlement="${s.id}">
            <div class="settlement-card-grid">
              <div class="settlement-row-grid">
                <div class="item-main settlement-main-info">
                  <div class="item-title-row settlement-title-row">
                    <div class="item-title settlement-name" title="${esc(titleText)}">${esc(titleText)}</div>
                    <span class="meta-text" style="font-size:11px;opacity:.7;">${esc(quarterLabel)}</span>
                  </div>
                </div>
                <div class="amtGroup settlement-amount-group">
                  <div class="amt invoice mono tabular" style="color:rgba(147,88,220,.9);">${fixedAmtDisplay}</div>
                </div>
              </div>
              <div class="meta-text settlement-meta-row">${detailItems.join(" · ")}</div>
            </div>
            <span class="settlement-status-indicator-right ${visual.accentClass}" aria-hidden="true"></span>
          </div>
        `;
      }

      const invoiceAmt = round2(pay.invoiceTotal);
      const cashAmt = round2(pay.cashTotal);
      const showInvoice = calculated && invoiceAmt > 0;
      const showCash = calculated && cashAmt > 0;
      const invoiceToggleAttrs = `data-toggle-paid="invoice" data-settlement-id="${s.id}" aria-label="Factuur ${flags.invoicePaid ? "betaald" : "open"}" role="button" tabindex="0"`;
      const cashToggleAttrs = `data-toggle-paid="cash" data-settlement-id="${s.id}" aria-label="Cash ${flags.cashPaid ? "betaald" : "open"}" role="button" tabindex="0"`;
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
        <div class="item settlement-card-item ${visual.accentClass}" data-open-settlement="${s.id}">
          <div class="settlement-card-grid">
            <div class="settlement-row-grid">
              <div class="item-main settlement-main-info">
                <div class="item-title-row settlement-title-row">
                  <div class="item-title settlement-name" title="${esc(titleText)}">${esc(titleText)}</div>
                </div>
              </div>

              <div class="amtGroup settlement-amount-group">
                <div class="amt invoice mono tabular ${flags.invoicePaid ? "is-paid" : "is-open"}" ${invoiceToggleAttrs}>${showInvoice ? formatMoneyEUR0(invoiceAmt) : ""}</div>
                <div class="amt cash mono tabular ${flags.cashPaid ? "is-paid" : "is-open"}" ${cashToggleAttrs}>${showCash ? formatMoneyEUR0(cashAmt) : ""}</div>
              </div>
            </div>
            <div class="meta-text settlement-meta-row">${detailItems.join(" · ")}</div>
          </div>
          <span class="settlement-status-indicator-right ${visual.accentClass}" aria-hidden="true"></span>
        </div>
      `;
    }).join("");

  const headerTotals = [];
  if (totalNotCalculatedExVat > 0){
    headerTotals.push({ key: "not-calculated", icon: notCalculatedIcon, amount: totalNotCalculatedExVat });
  }
  if (totalInvoiceOutstanding > 0){
    headerTotals.push({ key: "invoice", icon: invoiceIcon, amount: totalInvoiceOutstanding });
  }
  if (totalCashOutstanding > 0){
    headerTotals.push({ key: "cash", icon: cashIcon, amount: totalCashOutstanding });
  }

  el.innerHTML = `
    <div class="stack">
      <div class="geld-header"><span class="geld-header-title">Afrekeningen</span></div>
      <div class="settlement-header-row mono tabular">
        <div class="settlement-header-totals">
          ${headerTotals.map((total)=>`
            <span class="settlement-outstanding-col" data-total-kind="${total.key}">
              <span class="settlement-outstanding-content">${total.icon}<span>${formatMoneyEUR0(total.amount)}</span></span>
            </span>
          `).join("")}
        </div>
      </div>
      <div class="flat-list settlement-list">${list || `<div class="meta-text" style="padding:8px 4px;">Nog geen afrekeningen.</div>`}</div>
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
      const payment = settlementPaymentState(s);
      if (kind === "invoice" && !(payment.invoiceTotal > 0)) return;
      if (kind === "cash" && !(payment.cashTotal > 0)) return;

      if (kind === "invoice") s.invoicePaid = !Boolean(s.invoicePaid);
      if (kind === "cash") s.cashPaid = !Boolean(s.cashPaid);

      syncSettlementStatus(s);
      saveState(state);
      renderSettlements();
    });

    btn.addEventListener("keydown", (e)=>{
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      btn.click();
    });
  });
}


// ---------- Inzichten helpers ----------

function getISOWeekNum(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

function getInsightsPeriodRange(period, anchorDate) {
  const d = anchorDate instanceof Date ? anchorDate : new Date();
  if (period === "week") {
    // Week starts on Monday
    const dow = d.getDay(); // 0=Sun
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
    const nextMon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
    return { start: formatLocalYMD(mon), end: formatLocalYMD(nextMon) };
  }
  if (period === "kwartaal") {
    return { start: getQuarterStart(d), end: getQuarterEnd(d) };
  }
  if (period === "jaar") {
    const start = formatLocalYMD(new Date(d.getFullYear(), 0, 1));
    const end = formatLocalYMD(new Date(d.getFullYear() + 1, 0, 1));
    return { start, end };
  }
  // default: maand
  const start = formatLocalYMD(new Date(d.getFullYear(), d.getMonth(), 1));
  const end = formatLocalYMD(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  return { start, end };
}

function getSettlementsForInsights(range) {
  return (state.settlements || []).filter(s => {
    if (!isSettlementCalculated(s)) return false;
    const date = s.date || "";
    return date >= range.start && date < range.end;
  });
}

function getLogsForInsights(range) {
  return (state.logs || []).filter(l => {
    const date = l.date || "";
    return date >= range.start && date < range.end;
  });
}

function getEarningsSummary(range) {
  const settlements = getSettlementsForInsights(range);
  let invoice = 0, cash = 0;
  for (const s of settlements) {
    const amounts = getSettlementAmounts(s);
    invoice += amounts.invoice || 0;
    cash += amounts.cash || 0;
  }
  return {
    total: round2(invoice + cash),
    invoice: round2(invoice),
    cash: round2(cash)
  };
}

function getTopCustomersByRevenue(range) {
  const settlements = getSettlementsForInsights(range);
  const map = new Map();
  for (const s of settlements) {
    const cid = s.customerId || s.templateCustomerId;
    if (!cid) continue;
    const amounts = getSettlementAmounts(s);
    map.set(cid, (map.get(cid) || 0) + (amounts.invoice || 0) + (amounts.cash || 0));
  }
  return [...map.entries()]
    .map(([cid, amount]) => {
      const customer = (state.customers || []).find(c => c.id === cid);
      return {
        customerId: cid,
        name: customer?.nickname || customer?.name || "?",
        amount: round2(amount)
      };
    })
    .filter(x => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function getCustomerTimeShare(range) {
  const logs = getLogsForInsights(range);
  const map = new Map();
  let totalMs = 0;
  for (const l of logs) {
    const cid = l.customerId;
    if (!cid) continue;
    const ms = sumWorkMs(l);
    map.set(cid, (map.get(cid) || 0) + ms);
    totalMs += ms;
  }
  return [...map.entries()]
    .map(([cid, ms]) => {
      const customer = (state.customers || []).find(c => c.id === cid);
      const pct = totalMs > 0 ? round2((ms / totalMs) * 100) : 0;
      return { customerId: cid, name: customer?.nickname || customer?.name || "?", timeMs: ms, pct };
    })
    .filter(x => x.timeMs > 0)
    .sort((a, b) => b.timeMs - a.timeMs);
}

function getCustomerRevenueShare(range) {
  const customers = getTopCustomersByRevenue(range);
  const total = customers.reduce((s, c) => s + c.amount, 0);
  return customers.map(c => ({
    ...c,
    pct: total > 0 ? round2((c.amount / total) * 100) : 0
  }));
}

// ---- Customer-detail insights: data helpers ----

function getLogsForCustomerPeriod(customerId, range) {
  return (state.logs || []).filter(l =>
    l.customerId === customerId &&
    (l.date || "") >= range.start &&
    (l.date || "") < range.end
  );
}

function getSettlementsForCustomerPeriod(customerId, range) {
  return (state.settlements || []).filter(s =>
    s.customerId === customerId &&
    isSettlementCalculated(s) &&
    (s.date || "") >= range.start &&
    (s.date || "") < range.end
  );
}

function getCustomerEarningsSummaryForPeriod(customerId, range) {
  const settlements = getSettlementsForCustomerPeriod(customerId, range);
  let invoice = 0, cash = 0;
  for (const s of settlements) {
    const amounts = getSettlementAmounts(s);
    invoice += amounts.invoice || 0;
    cash += amounts.cash || 0;
  }
  return { total: round2(invoice + cash), invoice: round2(invoice), cash: round2(cash) };
}

function getCustomerRhythmSeries(customerId, range, period, mode) {
  const MONTH_NAMES = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const MONTH_NAMES_LONG = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const DAY_NAMES = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
  const DAY_NAMES_LONG = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];

  if (mode === "settlements") {
    const settlements = getSettlementsForCustomerPeriod(customerId, range);

    function sumOnDate(dateStr) {
      return settlements.filter(s => s.date === dateStr).reduce((sum, s) => {
        const a = getSettlementAmounts(s);
        return sum + (a.invoice || 0) + (a.cash || 0);
      }, 0);
    }

    if (period === "week") {
      const startDate = parseLocalYMD(range.start);
      if (!startDate) return { buckets: [], period };
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = formatLocalYMD(day);
        const detailLabel = `${DAY_NAMES_LONG[day.getDay()]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
        buckets.push({ key, label: DAY_NAMES[i], detailLabel, value: sumOnDate(key) });
      }
      return { buckets, period };
    }

    if (period === "kwartaal") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      let cur = new Date(startDate);
      const dow = cur.getDay();
      cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
      while (cur < endDate) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        const key = formatLocalYMD(wStart);
        const value = settlements.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d >= wStart && d <= wEnd;
        }).reduce((sum, x) => sum + (getSettlementAmounts(x).invoice || 0) + (getSettlementAmounts(x).cash || 0), 0);
        const wn = getISOWeekNum(wStart);
        const detailLabel = `Week ${wn} (${wStart.getDate()} ${MONTH_NAMES[wStart.getMonth()]} - ${wEnd.getDate()} ${MONTH_NAMES[wEnd.getMonth()]})`;
        buckets.push({ key, label: `W${wn}`, detailLabel, value });
        cur.setDate(cur.getDate() + 7);
      }
      return { buckets, period };
    }
    if (period === "jaar") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cur < endDate) {
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const key = `${year}-${pad2(month + 1)}`;
        const value = settlements.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        }).reduce((sum, x) => sum + (getSettlementAmounts(x).invoice || 0) + (getSettlementAmounts(x).cash || 0), 0);
        buckets.push({ key, label: MONTH_NAMES[month], detailLabel: `${MONTH_NAMES_LONG[month]} ${year}`, value });
        cur.setMonth(cur.getMonth() + 1);
      }
      return { buckets, period };
    }

    // maand
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { buckets: [], period };
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const buckets = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const key = formatLocalYMD(dayDate);
      const detailLabel = `${day} ${MONTH_NAMES_LONG[startDate.getMonth()]}`;
      buckets.push({ key, label: String(day), detailLabel, value: sumOnDate(key) });
    }
    return { buckets, period, startDate };

  } else {
    // logs mode
    const logs = getLogsForCustomerPeriod(customerId, range);

    if (period === "week") {
      const startDate = parseLocalYMD(range.start);
      if (!startDate) return { buckets: [], period };
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = formatLocalYMD(day);
        const value = logs.filter(l => {
          const d = parseLocalYMD(l.date);
          return d && d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
        }).reduce((sum, l) => sum + sumWorkMs(l), 0);
        const detailLabel = `${DAY_NAMES_LONG[day.getDay()]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
        buckets.push({ key, label: DAY_NAMES[i], detailLabel, value });
      }
      return { buckets, period };
    }

    if (period === "kwartaal") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      let cur = new Date(startDate);
      const dow = cur.getDay();
      cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
      while (cur < endDate) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        const key = formatLocalYMD(wStart);
        const value = logs.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d >= wStart && d <= wEnd;
        }).reduce((sum, x) => sum + sumWorkMs(x), 0);
        const wn = getISOWeekNum(wStart);
        const detailLabel = `Week ${wn} (${wStart.getDate()} ${MONTH_NAMES[wStart.getMonth()]} - ${wEnd.getDate()} ${MONTH_NAMES[wEnd.getMonth()]})`;
        buckets.push({ key, label: `W${wn}`, detailLabel, value });
        cur.setDate(cur.getDate() + 7);
      }
      return { buckets, period };
    }
    if (period === "jaar") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cur < endDate) {
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const key = `${year}-${pad2(month + 1)}`;
        const value = logs.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        }).reduce((sum, x) => sum + sumWorkMs(x), 0);
        buckets.push({ key, label: MONTH_NAMES[month], detailLabel: `${MONTH_NAMES_LONG[month]} ${year}`, value });
        cur.setMonth(cur.getMonth() + 1);
      }
      return { buckets, period };
    }

    // maand
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { buckets: [], period };
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const buckets = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const key = formatLocalYMD(dayDate);
      const value = logs.filter(l => {
        const d = parseLocalYMD(l.date);
        return d && d.getFullYear() === startDate.getFullYear() && d.getMonth() === startDate.getMonth() && d.getDate() === day;
      }).reduce((sum, l) => sum + sumWorkMs(l), 0);
      const detailLabel = `${day} ${MONTH_NAMES_LONG[startDate.getMonth()]}`;
      buckets.push({ key, label: String(day), detailLabel, value });
    }
    return { buckets, period, startDate };
  }
}


function getWorkRhythmSeries(range, period) {
  const logs = getLogsForInsights(range);
  const MONTH_NAMES = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const DAY_NAMES = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

  if (period === "week") {
    // 7 punten: Ma t/m Zo
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { labels: [], values: [], period };
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
    }
    const values = days.map(day =>
      logs
        .filter(l => {
          const d = parseLocalYMD(l.date);
          return d && d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
        })
        .reduce((sum, l) => sum + sumWorkMs(l), 0)
    );
    return { labels: DAY_NAMES, values, period };
  }

  if (period === "kwartaal") {
    const startDate = parseLocalYMD(range.start);
    const endDate = parseLocalYMD(range.end);
    if (!startDate || !endDate) return { labels: [], values: [], period };
    const labels = [];
    const values = [];
    let cur = new Date(startDate);
    const dow = cur.getDay();
    cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
    while (cur < endDate) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur);
      wEnd.setDate(wEnd.getDate() + 6);
      labels.push(`W${getISOWeekNum(wStart)}`);
      values.push(logs.filter(l => {
        const d = parseLocalYMD(l.date);
        return d && d >= wStart && d <= wEnd;
      }).reduce((sum, l) => sum + sumWorkMs(l), 0));
      cur.setDate(cur.getDate() + 7);
    }
    return { labels, values, period };
  }
  if (period === "jaar") {
    const startDate = parseLocalYMD(range.start);
    const endDate = parseLocalYMD(range.end);
    if (!startDate || !endDate) return { labels: [], values: [], period };
    const months = [];
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur < endDate) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    const labels = months.map(m => MONTH_NAMES[m.month]);
    const values = months.map(({ year, month }) =>
      logs
        .filter(l => {
          const d = parseLocalYMD(l.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, l) => sum + sumWorkMs(l), 0)
    );
    return { labels, values, period };
  }

  // maand: 1 punt per dag
  const startDate = parseLocalYMD(range.start);
  if (!startDate) return { labels: [], values: [], period };
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  const labels = [];
  const values = [];
  for (let day = 1; day <= daysInMonth; day++) {
    labels.push(String(day));
    values.push(
      logs
        .filter(l => {
          const d = parseLocalYMD(l.date);
          return d && d.getFullYear() === startDate.getFullYear() && d.getMonth() === startDate.getMonth() && d.getDate() === day;
        })
        .reduce((sum, l) => sum + sumWorkMs(l), 0)
    );
  }
  return { labels, values, period, startDate };
}

function getInsightsDashboardMode() {
  const normalized = normalizeInsightsDashboardMode(ui.insightsDashboardMode);
  if (normalized) return normalized;
  ui.insightsDashboardMode = "logs";
  return "logs";
}

function getWorkRhythmSeriesRevenue(range, period) {
  const settlements = getSettlementsForInsights(range);
  const MONTH_NAMES = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const DAY_NAMES = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

  function sumOnDate(dateStr) {
    return settlements
      .filter(s => s.date === dateStr)
      .reduce((sum, s) => {
        const amounts = getSettlementAmounts(s);
        return sum + (amounts.invoice || 0) + (amounts.cash || 0);
      }, 0);
  }

  if (period === "week") {
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { labels: [], values: [], period };
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
    }
    const values = days.map(day => sumOnDate(formatLocalYMD(day)));
    return { labels: DAY_NAMES, values, period };
  }

  if (period === "kwartaal") {
    const startDate = parseLocalYMD(range.start);
    const endDate = parseLocalYMD(range.end);
    if (!startDate || !endDate) return { labels: [], values: [], period };
    const labels = [];
    const values = [];
    let cur = new Date(startDate);
    const dow = cur.getDay();
    cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
    while (cur < endDate) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur);
      wEnd.setDate(wEnd.getDate() + 6);
      labels.push(`W${getISOWeekNum(wStart)}`);
      values.push(settlements.filter(s => {
        const d = parseLocalYMD(s.date);
        return d && d >= wStart && d <= wEnd;
      }).reduce((sum, s) => {
        const amounts = getSettlementAmounts(s);
        return sum + (amounts.invoice || 0) + (amounts.cash || 0);
      }, 0));
      cur.setDate(cur.getDate() + 7);
    }
    return { labels, values, period };
  }
  if (period === "jaar") {
    const startDate = parseLocalYMD(range.start);
    const endDate = parseLocalYMD(range.end);
    if (!startDate || !endDate) return { labels: [], values: [], period };
    const months = [];
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur < endDate) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    const labels = months.map(m => MONTH_NAMES[m.month]);
    const values = months.map(({ year, month }) =>
      settlements
        .filter(s => {
          const d = parseLocalYMD(s.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, s) => {
          const amounts = getSettlementAmounts(s);
          return sum + (amounts.invoice || 0) + (amounts.cash || 0);
        }, 0)
    );
    return { labels, values, period };
  }

  // maand: 1 punt per dag
  const startDate = parseLocalYMD(range.start);
  if (!startDate) return { labels: [], values: [], period };
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  const labels = [];
  const values = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = formatLocalYMD(new Date(startDate.getFullYear(), startDate.getMonth(), day));
    labels.push(String(day));
    values.push(sumOnDate(dayStr));
  }
  return { labels, values, period, startDate };
}

function getWorkRhythmInteractiveSeries(range, period, mode) {
  const MONTH_NAMES = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const MONTH_NAMES_LONG = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const DAY_NAMES = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
  const DAY_NAMES_LONG = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];

  if (mode === "settlements") {
    const settlements = getSettlementsForInsights(range);

    function sumSettlementsOnDate(dateStr) {
      return settlements
        .filter(s => s.date === dateStr)
        .reduce((sum, s) => {
          const amounts = getSettlementAmounts(s);
          return sum + (amounts.invoice || 0) + (amounts.cash || 0);
        }, 0);
    }

    if (period === "week") {
      const startDate = parseLocalYMD(range.start);
      if (!startDate) return { buckets: [], period };
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = formatLocalYMD(day);
        const detailLabel = `${DAY_NAMES_LONG[day.getDay()]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
        buckets.push({ key, label: DAY_NAMES[i], detailLabel, value: sumSettlementsOnDate(key) });
      }
      return { buckets, period };
    }

    if (period === "kwartaal") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      let cur = new Date(startDate);
      const dow = cur.getDay();
      cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
      while (cur < endDate) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        const key = formatLocalYMD(wStart);
        const value = settlements.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d >= wStart && d <= wEnd;
        }).reduce((sum, x) => sum + (getSettlementAmounts(x).invoice || 0) + (getSettlementAmounts(x).cash || 0), 0);
        const wn = getISOWeekNum(wStart);
        const detailLabel = `Week ${wn} (${wStart.getDate()} ${MONTH_NAMES[wStart.getMonth()]} - ${wEnd.getDate()} ${MONTH_NAMES[wEnd.getMonth()]})`;
        buckets.push({ key, label: `W${wn}`, detailLabel, value });
        cur.setDate(cur.getDate() + 7);
      }
      return { buckets, period };
    }
    if (period === "jaar") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cur < endDate) {
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const key = `${year}-${pad2(month + 1)}`;
        const value = settlements.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        }).reduce((sum, x) => sum + (getSettlementAmounts(x).invoice || 0) + (getSettlementAmounts(x).cash || 0), 0);
        buckets.push({ key, label: MONTH_NAMES[month], detailLabel: `${MONTH_NAMES_LONG[month]} ${year}`, value });
        cur.setMonth(cur.getMonth() + 1);
      }
      return { buckets, period };
    }

    // maand
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { buckets: [], period };
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const buckets = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const key = formatLocalYMD(dayDate);
      const detailLabel = `${day} ${MONTH_NAMES_LONG[startDate.getMonth()]}`;
      buckets.push({ key, label: String(day), detailLabel, value: sumSettlementsOnDate(key) });
    }
    return { buckets, period, startDate };

  } else {
    // logs mode
    const logs = getLogsForInsights(range);

    if (period === "week") {
      const startDate = parseLocalYMD(range.start);
      if (!startDate) return { buckets: [], period };
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = formatLocalYMD(day);
        const value = logs
          .filter(l => {
            const d = parseLocalYMD(l.date);
            return d && d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
          })
          .reduce((sum, l) => sum + sumWorkMs(l), 0);
        const detailLabel = `${DAY_NAMES_LONG[day.getDay()]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
        buckets.push({ key, label: DAY_NAMES[i], detailLabel, value });
      }
      return { buckets, period };
    }

    if (period === "kwartaal") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      let cur = new Date(startDate);
      const dow = cur.getDay();
      cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
      while (cur < endDate) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        const key = formatLocalYMD(wStart);
        const value = logs.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d >= wStart && d <= wEnd;
        }).reduce((sum, x) => sum + sumWorkMs(x), 0);
        const wn = getISOWeekNum(wStart);
        const detailLabel = `Week ${wn} (${wStart.getDate()} ${MONTH_NAMES[wStart.getMonth()]} - ${wEnd.getDate()} ${MONTH_NAMES[wEnd.getMonth()]})`;
        buckets.push({ key, label: `W${wn}`, detailLabel, value });
        cur.setDate(cur.getDate() + 7);
      }
      return { buckets, period };
    }
    if (period === "jaar") {
      const startDate = parseLocalYMD(range.start);
      const endDate = parseLocalYMD(range.end);
      if (!startDate || !endDate) return { buckets: [], period };
      const buckets = [];
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cur < endDate) {
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const key = `${year}-${pad2(month + 1)}`;
        const value = logs.filter(x => {
          const d = parseLocalYMD(x.date);
          return d && d.getFullYear() === year && d.getMonth() === month;
        }).reduce((sum, x) => sum + sumWorkMs(x), 0);
        buckets.push({ key, label: MONTH_NAMES[month], detailLabel: `${MONTH_NAMES_LONG[month]} ${year}`, value });
        cur.setMonth(cur.getMonth() + 1);
      }
      return { buckets, period };
    }

    // maand
    const startDate = parseLocalYMD(range.start);
    if (!startDate) return { buckets: [], period };
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const buckets = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const key = formatLocalYMD(dayDate);
      const value = logs
        .filter(l => {
          const d = parseLocalYMD(l.date);
          return d && d.getFullYear() === startDate.getFullYear() && d.getMonth() === startDate.getMonth() && d.getDate() === day;
        })
        .reduce((sum, l) => sum + sumWorkMs(l), 0);
      const detailLabel = `${day} ${MONTH_NAMES_LONG[startDate.getMonth()]}`;
      buckets.push({ key, label: String(day), detailLabel, value });
    }
    return { buckets, period, startDate };
  }
}

function getFavoriteWeekday(range) {
  const DAY_NAMES_LONG = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
  const logs = getLogsForInsights(range);
  const totals = new Array(7).fill(0);
  for (const log of logs) {
    const d = parseLocalYMD(log.date);
    if (!d) continue;
    totals[d.getDay()] += sumWorkMs(log);
  }
  const maxMs = Math.max(...totals);
  if (maxMs === 0) return { dayIndex: -1, dayName: null, totals };
  const maxDay = totals.indexOf(maxMs);
  return { dayIndex: maxDay, dayName: DAY_NAMES_LONG[maxDay], totals };
}

function getAverageEarnedPerWorkday(range) {
  const logs = getLogsForInsights(range);
  const uniqueDays = new Set(logs.map(l => l.date).filter(Boolean));
  if (!uniqueDays.size) return 0;
  const earned = getEarningsSummary(range);
  return round2(earned.total / uniqueDays.size);
}

function renderWorkRhythmSVG(series, emptyMsg) {
  const { labels, values, period, startDate } = series;
  if (!labels.length || values.every(v => v === 0)) {
    return `<p class="insights-empty">${emptyMsg || "Geen werkdata in deze periode"}</p>`;
  }
  const W = 280, H = 56;
  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const pts = values.map((v, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: H - Math.max(0, (v / maxVal) * (H - 8)) - 4
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`;

  let xLabels = "";
  if (period === "maand" && startDate) {
    // Tick voor elke dag, label alleen op maandagen
    xLabels = labels.map((label, i) => {
      const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
      const date = new Date(startDate.getFullYear(), startDate.getMonth(), i + 1);
      const isMon = date.getDay() === 1;
      const tick = `<line x1="${x.toFixed(1)}" y1="${H}" x2="${x.toFixed(1)}" y2="${(H + 4).toFixed(1)}" class="rhythm-tick"/>`;
      const textEl = isMon
        ? `<text x="${x.toFixed(1)}" y="${H + 14}" text-anchor="middle" class="rhythm-x-label">${esc(label)}</text>`
        : "";
      return tick + textEl;
    }).join("");
  } else {
    xLabels = labels.map((label, i) => {
      const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
      return `<text x="${x.toFixed(1)}" y="${H + 15}" text-anchor="middle" class="rhythm-x-label">${esc(label)}</text>`;
    }).join("");
  }

  return `<svg viewBox="0 0 ${W} ${H + 20}" class="rhythm-svg" preserveAspectRatio="none">
    <path d="${areaD}" class="rhythm-area"/>
    <path d="${pathD}" class="rhythm-line"/>
    ${xLabels}
  </svg>`;
}

function renderWorkRhythmSVGInteractive(series, selectedKey, emptyMsg) {
  const { buckets, period, startDate } = series;
  if (!buckets.length || buckets.every(b => b.value === 0)) {
    return `<p class="insights-empty">${emptyMsg || "Geen werkdata in deze periode"}</p>`;
  }

  const W = 280, H = 56;
  const maxVal = Math.max(...buckets.map(b => b.value), 1);
  const n = buckets.length;

  const pts = buckets.map((b, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: H - Math.max(0, (b.value / maxVal) * (H - 8)) - 4,
    key: b.key
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`;

  let xLabels = "";
  if (period === "maand" && startDate) {
    xLabels = buckets.map((b, i) => {
      const x = pts[i].x;
      const date = new Date(startDate.getFullYear(), startDate.getMonth(), i + 1);
      const isMon = date.getDay() === 1;
      const tick = `<line x1="${x.toFixed(1)}" y1="${H}" x2="${x.toFixed(1)}" y2="${(H + 4).toFixed(1)}" class="rhythm-tick"/>`;
      const textEl = isMon
        ? `<text x="${x.toFixed(1)}" y="${H + 14}" text-anchor="middle" class="rhythm-x-label">${esc(b.label)}</text>`
        : "";
      return tick + textEl;
    }).join("");
  } else {
    xLabels = pts.map((p, i) => {
      return `<text x="${p.x.toFixed(1)}" y="${H + 15}" text-anchor="middle" class="rhythm-x-label">${esc(buckets[i].label)}</text>`;
    }).join("");
  }

  // Selected dot indicator
  let selectedDot = "";
  if (selectedKey) {
    const selIdx = pts.findIndex(p => p.key === selectedKey);
    if (selIdx >= 0) {
      selectedDot = `<circle cx="${pts[selIdx].x.toFixed(1)}" cy="${pts[selIdx].y.toFixed(1)}" r="4" class="rhythm-selected-dot"/>`;
    }
  }

  // Hit areas: transparent vertical strips covering the full chart height
  const hitAreas = pts.map((p, i) => {
    const prevX = i > 0 ? pts[i - 1].x : 0;
    const nextX = i < n - 1 ? pts[i + 1].x : W;
    const left = i === 0 ? 0 : (p.x + prevX) / 2;
    const right = i === n - 1 ? W : (p.x + nextX) / 2;
    const width = right - left;
    const isSelected = p.key === selectedKey;
    return `<rect x="${left.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="${(H + 4).toFixed(1)}" fill="transparent" class="rhythm-hit${isSelected ? " rhythm-hit--active" : ""}" data-rhythm-key="${esc(p.key)}"/>`;
  }).join("");

  const ptsJSON = JSON.stringify(pts.map(p => ({ key: p.key, x: p.x, y: p.y })));

  return `<div class="rhythm-scrub-zone"><svg viewBox="0 0 ${W} ${H + 20}" class="rhythm-svg" preserveAspectRatio="none" data-rhythm-pts='${ptsJSON}'>
    <path d="${areaD}" class="rhythm-area"/>
    <path d="${pathD}" class="rhythm-line"/>
    ${selectedDot}
    ${xLabels}
    ${hitAreas}
  </svg></div>`;
}

function getWorkRhythmBucketDetails(range, period, mode, bucketKey) {
  if (!bucketKey) return null;

  if (mode === "settlements") {
    const allSettlements = getSettlementsForInsights(range);
    const bucketSettlements = (period === "week" || period === "maand")
      ? allSettlements.filter(s => s.date === bucketKey)
      : (period === "kwartaal")
        ? allSettlements.filter(s => { const d = parseLocalYMD(s.date); if (!d) return false; const bStart = parseLocalYMD(bucketKey); const bEnd = new Date(bStart); bEnd.setDate(bEnd.getDate() + 6); return d >= bStart && d <= bEnd; })
        : allSettlements.filter(s => (s.date || "").startsWith(bucketKey + "-"));

    const totalAmount = bucketSettlements.reduce((sum, s) => {
      const a = getSettlementAmounts(s);
      return sum + (a.invoice || 0) + (a.cash || 0);
    }, 0);
    const totalInvoice = bucketSettlements.reduce((sum, s) => sum + (getSettlementAmounts(s).invoice || 0), 0);
    const totalCash = bucketSettlements.reduce((sum, s) => sum + (getSettlementAmounts(s).cash || 0), 0);

    const allTotal = allSettlements.reduce((sum, s) => {
      const a = getSettlementAmounts(s);
      return sum + (a.invoice || 0) + (a.cash || 0);
    }, 0);
    const pct = allTotal > 0 ? Math.round((totalAmount / allTotal) * 100) : 0;

    const custMap = new Map();
    for (const s of bucketSettlements) {
      const cid = s.customerId || "__unknown__";
      const a = getSettlementAmounts(s);
      custMap.set(cid, (custMap.get(cid) || 0) + (a.invoice || 0) + (a.cash || 0));
    }
    const customers = [...custMap.entries()]
      .map(([cid, amount]) => {
        const c = (state.customers || []).find(c => c.id === cid);
        return {
          name: c?.nickname || c?.name || "?",
          amount: round2(amount),
          pct: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0
        };
      })
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return { totalAmount, totalInvoice, totalCash, pct, customers, count: bucketSettlements.length };

  } else {
    const allLogs = getLogsForInsights(range);
    const bucketLogs = (period === "week" || period === "maand")
      ? allLogs.filter(l => l.date === bucketKey)
      : (period === "kwartaal")
        ? allLogs.filter(l => { const d = parseLocalYMD(l.date); if (!d) return false; const bStart = parseLocalYMD(bucketKey); const bEnd = new Date(bStart); bEnd.setDate(bEnd.getDate() + 6); return d >= bStart && d <= bEnd; })
        : allLogs.filter(l => (l.date || "").startsWith(bucketKey + "-"));

    const totalMs = bucketLogs.reduce((sum, l) => sum + sumWorkMs(l), 0);
    const allTotalMs = allLogs.reduce((sum, l) => sum + sumWorkMs(l), 0);
    const pct = allTotalMs > 0 ? Math.round((totalMs / allTotalMs) * 100) : 0;

    const custMap = new Map();
    for (const l of bucketLogs) {
      const cid = l.customerId || "__unknown__";
      custMap.set(cid, (custMap.get(cid) || 0) + sumWorkMs(l));
    }
    const customers = [...custMap.entries()]
      .map(([cid, ms]) => {
        const c = (state.customers || []).find(c => c.id === cid);
        return {
          name: c?.nickname || c?.name || "?",
          timeMs: ms,
          pct: totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0
        };
      })
      .filter(c => c.timeMs > 0)
      .sort((a, b) => b.timeMs - a.timeMs);

    return { totalMs, pct, customers, count: bucketLogs.length };
  }
}

function renderWorkRhythmDetailBlock(details, mode, detailLabel) {
  if (!details) return "";

  let headerHTML, metaHTML, customersHTML;

  if (mode === "settlements") {
    const { totalAmount, totalInvoice, totalCash, pct, customers } = details;
    headerHTML = `<div class="rhythm-detail-header">
      <span class="rhythm-detail-label">${esc(detailLabel)}</span>
      <span class="rhythm-detail-value">${fmtMoney0(totalAmount)}</span>
    </div>`;
    const splitParts = [];
    if (totalInvoice > 0) splitParts.push(`factuur ${fmtMoney0(totalInvoice)}`);
    if (totalCash > 0) splitParts.push(`cash ${fmtMoney0(totalCash)}`);
    metaHTML = `<div class="rhythm-detail-meta"><span>${pct}% van totaal</span>${splitParts.length ? `<span class="rhythm-detail-dot">·</span><span>${splitParts.join(" · ")}</span>` : ""}</div>`;
    customersHTML = customers.length
      ? customers.map(c => `<div class="rhythm-detail-cust-row">
        <span class="rhythm-detail-cust-name">${esc(c.name)}</span>
        <span class="rhythm-detail-cust-value">${fmtMoney0(c.amount)}</span>
        ${customers.length > 1 ? `<span class="rhythm-detail-cust-pct">${c.pct}%</span>` : ""}
      </div>`).join("")
      : `<p class="insights-empty" style="margin:0">Geen klanten</p>`;

  } else {
    const { totalMs, pct, customers, count } = details;
    headerHTML = `<div class="rhythm-detail-header">
      <span class="rhythm-detail-label">${esc(detailLabel)}</span>
      <span class="rhythm-detail-value">${esc(durMsToHM(totalMs))}</span>
    </div>`;
    metaHTML = `<div class="rhythm-detail-meta"><span>${pct}% van totaal</span><span class="rhythm-detail-dot">·</span><span>${count} ${count === 1 ? "log" : "logs"}</span></div>`;
    customersHTML = customers.length
      ? customers.map(c => `<div class="rhythm-detail-cust-row">
        <span class="rhythm-detail-cust-name">${esc(c.name)}</span>
        <span class="rhythm-detail-cust-value">${esc(durMsToHM(c.timeMs))}</span>
        ${customers.length > 1 ? `<span class="rhythm-detail-cust-pct">${c.pct}%</span>` : ""}
      </div>`).join("")
      : `<p class="insights-empty" style="margin:0">Geen klanten</p>`;
  }

  return `<div class="rhythm-detail-block">
    ${headerHTML}
    ${metaHTML}
    <div class="rhythm-detail-custs">${customersHTML}</div>
  </div>`;
}

function renderWeekdayBarsSVG(totals) {
  const DAY_SHORT = ["zo","ma","di","wo","do","vr","za"];
  const maxVal = Math.max(...totals, 1);
  const barW = 18, gap = 8, H = 32;
  const totalW = 7 * barW + 6 * gap;

  const bars = totals.map((v, i) => {
    const x = i * (barW + gap);
    const barH = Math.max(v > 0 ? 3 : 0, (v / maxVal) * H);
    const y = H - barH;
    const isPeak = v > 0 && v === Math.max(...totals);
    return `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" rx="3" class="weekday-bar${isPeak ? " weekday-bar--peak" : ""}"/>
<text x="${(x + barW / 2).toFixed(1)}" y="${H + 14}" text-anchor="middle" class="weekday-x-label">${DAY_SHORT[i]}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${totalW} ${H + 18}" class="weekday-svg">${bars}</svg>`;
}

// Palette voor klantenanalyse — neutrale blauw-grijze tinten, geen statuskleurenconflict
const CUSTOMER_CHART_COLORS = [
  "#8faec8","#6a8daa","#4d6f8c","#95b5c8","#3a5a78","#b8ccdc","#2e4860"
];

function fmtDurationShort(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u ${m}m`;
}

function renderCustomerInsightsPreview(customers, mode) {
  if (!customers.length) {
    const msg = mode === "logs" ? "Geen werkdata in deze periode" : "Geen omzet in deze periode";
    return `<p class="insights-empty">${msg}</p>`;
  }
  return customers.map(c => {
    const barWidth = Math.max(3, c.pct);
    const valueLabel = mode === "logs" ? durMsToHM(c.timeMs) : fmtMoney0(c.amount);
    const pctLabel = `${Math.round(c.pct)}%`;
    return `<div class="ins-bar-row" data-customer-id="${esc(c.customerId)}">
  <span class="ins-bar-name">${esc(c.name)}</span>
  <span class="ins-bar-track"><span class="ins-bar-fill" style="width:${barWidth.toFixed(1)}%"></span></span>
  <span class="ins-bar-amount">${esc(valueLabel)}</span>
  <span class="ins-bar-pct">${esc(pctLabel)}</span>
</div>`;
  }).join("");
}

function renderCustomerDonutChart(customers, mode) {
  const CX = 70, CY = 70;
  const rMid = 42;
  const strokeW = 20;
  const circumference = 2 * Math.PI * rMid;
  const COLORS = CUSTOMER_CHART_COLORS;
  let cumPct = 0;
  const bgRing = `<circle cx="${CX}" cy="${CY}" r="${rMid}" fill="none" stroke="var(--border)" stroke-width="${strokeW}"/>`;
  const segments = customers.map((c, i) => {
    const dashLen = (c.pct / 100) * circumference;
    const offset = -(cumPct / 100) * circumference;
    cumPct += c.pct;
    return `<circle cx="${CX}" cy="${CY}" r="${rMid}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="${strokeW}" stroke-dasharray="${dashLen.toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
  });
  let centerLine1, centerLine2;
  if (mode === "logs") {
    centerLine1 = fmtDurationShort(customers.reduce((s, c) => s + c.timeMs, 0));
    centerLine2 = "gewerkt";
  } else {
    centerLine1 = fmtMoney0(customers.reduce((s, c) => s + c.amount, 0));
    centerLine2 = "verdiend";
  }
  return `<svg viewBox="0 0 ${CX * 2} ${CY * 2}" class="cust-donut-svg">
    ${bgRing}${segments.join("")}
    <text x="${CX}" y="${CY - 5}" text-anchor="middle" class="donut-center-value">${esc(centerLine1)}</text>
    <text x="${CX}" y="${CY + 11}" text-anchor="middle" class="donut-center-sub">${esc(centerLine2)}</text>
  </svg>`;
}

function renderCustomerInsightsDetail() {
  const body = $("#sheetBody");
  const period = ui.insightsPeriod || "maand";
  const anchor = ui.insightsAnchorDate instanceof Date ? ui.insightsAnchorDate : new Date();
  const range = getInsightsPeriodRange(period, anchor);
  const mode = getInsightsDashboardMode();
  const customers = mode === "logs" ? getCustomerTimeShare(range) : getCustomerRevenueShare(range);
  const COLORS = CUSTOMER_CHART_COLORS;
  const emptyMsg = mode === "logs" ? "Geen werkdata in deze periode" : "Geen omzet in deze periode";

  let totalHTML = "";
  if (customers.length) {
    if (mode === "logs") {
      totalHTML = `<div class="cust-detail-total">${esc(durMsToHM(customers.reduce((s, c) => s + c.timeMs, 0)))}</div>`;
    } else {
      totalHTML = `<div class="cust-detail-total">${esc(fmtMoney0(customers.reduce((s, c) => s + c.amount, 0)))}</div>`;
    }
  }

  const chartHTML = customers.length ? renderCustomerDonutChart(customers, mode) : "";

  const listHTML = customers.length
    ? customers.map((c, i) => {
        const valueLabel = mode === "logs" ? durMsToHM(c.timeMs) : fmtMoney0(c.amount);
        const pctLabel = `${Math.round(c.pct)}%`;
        const barWidth = Math.max(3, c.pct);
        return `<div class="cust-detail-row">
          <span class="cust-detail-legend" style="background:${COLORS[i % COLORS.length]}"></span>
          <span class="cust-detail-name">${esc(c.name)}</span>
          <span class="ins-bar-track"><span class="ins-bar-fill" style="width:${barWidth.toFixed(1)}%"></span></span>
          <span class="cust-detail-value">${esc(valueLabel)}</span>
          <span class="ins-bar-pct">${esc(pctLabel)}</span>
        </div>`;
      }).join("")
    : `<p class="insights-empty">${emptyMsg}</p>`;

  body.innerHTML = `
    <div class="stack">
      ${totalHTML ? `<div class="cust-detail-header">${totalHTML}</div>` : ""}
      ${chartHTML ? `<div class="cust-donut-wrap">${chartHTML}</div>` : ""}
      <div class="cust-detail-list">
        ${listHTML}
      </div>
    </div>
  `;
}

// ---------- Periode picker ----------
function openInsightsPeriodPicker() {
  const existing = document.getElementById("insightsPeriodPicker");
  if (existing) existing.remove();

  const period = ui.insightsPeriod || "maand";
  const anchor = ui.insightsAnchorDate instanceof Date ? new Date(ui.insightsAnchorDate) : new Date();

  // Local picker state
  let draft = new Date(anchor);
  let navYear = draft.getFullYear();
  let navMonth = draft.getMonth();

  const MONTH_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const MONTH_NL_SHORT = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

  function _isoWeek(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  }

  function _weekStart(d) {
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  }

  function _fmtShort(d) {
    return `${d.getDate()} ${MONTH_NL_SHORT[d.getMonth()]}`;
  }

  function _getPickerTitle() {
    if (period === "week") return "Kies week";
    if (period === "maand") return "Kies maand";
    if (period === "kwartaal") return "Kies kwartaal";
    return "Kies jaar";
  }

  function renderBody() {
    if (period === "maand") {
      const activeY = draft.getFullYear();
      const activeM = draft.getMonth();
      const cells = MONTH_NL_SHORT.map((name, i) => {
        const isActive = navYear === activeY && i === activeM;
        return `<button class="pp-cell${isActive ? " pp-cell-active" : ""}" data-action="month" data-value="${i}">${name}</button>`;
      }).join("");
      return `
        <div class="pp-year-nav">
          <button class="pp-yn-btn" data-action="year-prev">&#8249;</button>
          <span class="pp-yn-label">${navYear}</span>
          <button class="pp-yn-btn" data-action="year-next">&#8250;</button>
        </div>
        <div class="pp-month-grid">${cells}</div>`;
    }

    if (period === "kwartaal") {
      const activeY = draft.getFullYear();
      const activeQ = Math.floor(draft.getMonth() / 3) + 1;
      const cells = [1, 2, 3, 4].map(q => {
        const isActive = navYear === activeY && q === activeQ;
        return `<button class="pp-cell pp-cell-q${isActive ? " pp-cell-active" : ""}" data-action="quarter" data-value="${q}">Q${q}</button>`;
      }).join("");
      return `
        <div class="pp-year-nav">
          <button class="pp-yn-btn" data-action="year-prev">&#8249;</button>
          <span class="pp-yn-label">${navYear}</span>
          <button class="pp-yn-btn" data-action="year-next">&#8250;</button>
        </div>
        <div class="pp-quarter-grid">${cells}</div>`;
    }

    if (period === "jaar") {
      const activeY = draft.getFullYear();
      const curY = new Date().getFullYear();
      let rows = "";
      for (let y = curY - 6; y <= curY + 2; y++) {
        rows += `<button class="pp-year-row${y === activeY ? " pp-cell-active" : ""}" data-action="year" data-value="${y}">${y}</button>`;
      }
      return `<div class="pp-year-list">${rows}</div>`;
    }

    // week
    const draftWS = _weekStart(draft).toDateString();
    const overlapStart = new Date(navYear, navMonth, 1);
    const overlapEnd = new Date(navYear, navMonth + 1, 0);
    let w = _weekStart(new Date(navYear, navMonth, 1));
    let rows = "";
    for (let i = 0; i < 6; i++) {
      const wEnd = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 6);
      if (w <= overlapEnd && wEnd >= overlapStart) {
        const wNum = _isoWeek(w);
        const isActive = w.toDateString() === draftWS;
        const wKey = `${w.getFullYear()}-${String(w.getMonth()+1).padStart(2,"0")}-${String(w.getDate()).padStart(2,"0")}`;
        rows += `<button class="pp-week-row${isActive ? " pp-cell-active" : ""}" data-action="week" data-value="${wKey}">
          <span class="pp-week-num">week ${wNum}</span>
          <span class="pp-week-range">${_fmtShort(w)}\u2013${_fmtShort(wEnd)}</span>
        </button>`;
      }
      w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7);
    }
    return `
      <div class="pp-year-nav">
        <button class="pp-yn-btn" data-action="month-prev">&#8249;</button>
        <span class="pp-yn-label">${MONTH_NL[navMonth]} ${navYear}</span>
        <button class="pp-yn-btn" data-action="month-next">&#8250;</button>
      </div>
      <div class="pp-week-list">${rows}</div>`;
  }

  const overlay = document.createElement("div");
  overlay.id = "insightsPeriodPicker";
  overlay.className = "pp-backdrop";
  overlay.innerHTML = `
    <div class="pp-sheet">
      <div class="pp-handle"></div>
      <div class="pp-header">
        <button class="pp-cancel-btn" data-action="cancel">Annuleer</button>
        <div class="pp-title">${_getPickerTitle()}</div>
        <button class="pp-confirm-btn" data-action="confirm">Klaar</button>
      </div>
      <div class="pp-body">${renderBody()}</div>
    </div>`;
  document.body.appendChild(overlay);

  function updateBody() {
    overlay.querySelector(".pp-body").innerHTML = renderBody();
    bindBodyEvents();
  }

  function closePicker() {
    overlay.classList.add("pp-closing");
    setTimeout(() => overlay.remove(), 300);
  }

  function confirmPicker() {
    ui.insightsAnchorDate = new Date(draft);
    closePicker();
    renderMeer();
  }

  function bindBodyEvents() {
    overlay.querySelector(".pp-body").querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const value = btn.dataset.value;
        if (action === "year-prev") { navYear--; updateBody(); return; }
        if (action === "year-next") { navYear++; updateBody(); return; }
        if (action === "month-prev") {
          navMonth--; if (navMonth < 0) { navMonth = 11; navYear--; }
          updateBody(); return;
        }
        if (action === "month-next") {
          navMonth++; if (navMonth > 11) { navMonth = 0; navYear++; }
          updateBody(); return;
        }
        if (action === "month") {
          draft = new Date(navYear, parseInt(value), 1);
          updateBody(); return;
        }
        if (action === "quarter") {
          draft = new Date(navYear, (parseInt(value) - 1) * 3, 1);
          updateBody(); return;
        }
        if (action === "year") {
          draft = new Date(parseInt(value), draft.getMonth(), 1);
          updateBody(); return;
        }
        if (action === "week") {
          const parts = value.split("-");
          draft = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          updateBody(); return;
        }
      });
    });
  }

  overlay.querySelector("[data-action='cancel']").addEventListener("click", closePicker);
  overlay.querySelector("[data-action='confirm']").addEventListener("click", confirmPicker);
  overlay.addEventListener("click", e => { if (e.target === overlay) closePicker(); });
  bindBodyEvents();

  requestAnimationFrame(() => overlay.classList.add("pp-open"));
}

// ---------- Meer tab ----------
function renderMeer(){
  const el = $("#tab-meer");
  const period = ui.insightsPeriod || "maand";
  const anchor = ui.insightsAnchorDate instanceof Date ? ui.insightsAnchorDate : new Date();
  const range = getInsightsPeriodRange(period, anchor);
  const mode = getInsightsDashboardMode();
  // ISO week number helper
  function isoWeekNum(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  }

  const MONTH_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

  let periodLabel;
  if (period === "week") {
    const startDate = parseLocalYMD(range.start);
    const wn = startDate ? isoWeekNum(startDate) : isoWeekNum(anchor);
    periodLabel = `week ${wn} \u00b7 ${anchor.getFullYear()}`;
  } else if (period === "maand") {
    periodLabel = `${MONTH_NL[anchor.getMonth()]} ${anchor.getFullYear()}`;
  } else if (period === "kwartaal") {
    const q = Math.floor(anchor.getMonth() / 3) + 1;
    periodLabel = `Q${q} ${anchor.getFullYear()}`;
  } else {
    periodLabel = `${anchor.getFullYear()}`;
  }

  const iconClock = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconCard = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="9" width="16" height="10" rx="2"/><path d="M7 9V6h7l3 3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14h4" stroke-linecap="round"/><path d="M15 14h2" stroke-linecap="round"/><path d="M8 19v-2h8v2" stroke-linecap="round"/></svg>`;

  const modeSwitchHTML = `<div class="cust-mode-switch">
    <button class="cms-btn${mode === "logs" ? " cms-active" : ""}" data-mode="logs" aria-label="Logboek">${iconClock}</button>
    <button class="cms-btn${mode === "settlements" ? " cms-active" : ""}" data-mode="settlements" aria-label="Afrekening">${iconCard}</button>
  </div>`;

  let mainContentHTML;

  {
    const customers = mode === "logs" ? getCustomerTimeShare(range) : getCustomerRevenueShare(range);
    const earnings = getEarningsSummary(range);
    const logsInRange = getLogsForInsights(range);
    const totalWorkMs = logsInRange.reduce((sum, l) => sum + sumWorkMs(l), 0);
    const totalHoursLabel = `${fmtDurationShort(totalWorkMs)} gewerkt`;

    // Hero: dual mode
    let heroHTML;
    if (mode === "logs") {
      const workedDays = new Set(logsInRange.filter(l => sumWorkMs(l) > 0).map(l => l.date)).size;
      const daysLabel = workedDays === 1 ? "1 werkdag" : `${workedDays} werkdagen`;
      heroHTML = `
        <div class="insights-hero">
          <div class="insights-hero-amount">${esc(fmtDurationShort(totalWorkMs))}</div>
          <div class="insights-hero-worked">${esc(daysLabel)}</div>
        </div>
      `;
    } else {
      const heroSplitHTML = `<div class="insights-hero-split">
          <span>factuur ${fmtMoney0(earnings.invoice)}</span>
          <span class="insights-hero-dot">·</span>
          <span>cash ${fmtMoney0(earnings.cash)}</span>
        </div>`;
      heroHTML = `
        <div class="insights-hero">
          <div class="insights-hero-amount">${fmtMoney0(earnings.total)}</div>
          <div class="insights-hero-worked">${esc(totalHoursLabel)}</div>
          ${heroSplitHTML}
        </div>
      `;
    }

    // Werkritme: interactief, dual mode
    const rhythmSeries = getWorkRhythmInteractiveSeries(range, period, mode);
    const rhythmEmptyMsg = mode === "logs" ? "Geen werkdata in deze periode" : "Geen omzet in deze periode";

    // Valideer geselecteerde key: als die niet meer in de serie zit, reset naar null
    if (ui.workRhythmSelectedKey) {
      const keyStillValid = rhythmSeries.buckets.some(b => b.key === ui.workRhythmSelectedKey);
      if (!keyStillValid) ui.workRhythmSelectedKey = null;
    }

    const rhythmChart = renderWorkRhythmSVGInteractive(rhythmSeries, ui.workRhythmSelectedKey, rhythmEmptyMsg);

    // Detailblok: alleen zichtbaar als een bucket geselecteerd is
    let detailBlockHTML = "";
    if (ui.workRhythmSelectedKey) {
      const selectedBucket = rhythmSeries.buckets.find(b => b.key === ui.workRhythmSelectedKey);
      if (selectedBucket) {
        const details = getWorkRhythmBucketDetails(range, period, mode, ui.workRhythmSelectedKey);
        detailBlockHTML = renderWorkRhythmDetailBlock(details, mode, selectedBucket.detailLabel);
      }
    }

    mainContentHTML = `
      ${heroHTML}

      <div class="insights-section">
        ${rhythmChart}
      </div>

      <div class="rhythm-detail-container">${detailBlockHTML}</div>

      <div class="insights-section ins-cust-section">
        <div class="insights-section-header">
          <div class="insights-section-title">Klanten</div>
        </div>
        <div class="ins-bars-list">
          ${renderCustomerInsightsPreview(customers, mode)}
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="stack meer-layout">
      <div class="insights-nav">
        <div class="insights-nav-period">
          <button class="ins-nav-prev">&#8249;</button>
          <button class="ins-nav-label">${esc(periodLabel)}</button>
          <button class="ins-nav-next">&#8250;</button>
        </div>
        ${modeSwitchHTML}
      </div>

      ${mainContentHTML}
    </div>
  `;

  el.classList.toggle("insights-mode-logs", mode === "logs");
  el.classList.toggle("insights-mode-settlements", mode === "settlements");

  el.querySelector(".ins-nav-label").addEventListener("click", () => {
    openInsightsPeriodPicker();
  });

  el.querySelector(".ins-nav-prev").addEventListener("click", () => {
    const a = new Date(ui.insightsAnchorDate instanceof Date ? ui.insightsAnchorDate : new Date());
    if (period === "week") a.setDate(a.getDate() - 7);
    else if (period === "maand") a.setMonth(a.getMonth() - 1);
    else if (period === "kwartaal") a.setMonth(a.getMonth() - 3);
    else a.setFullYear(a.getFullYear() - 1);
    ui.insightsAnchorDate = a;
    renderMeer();
  });

  el.querySelector(".ins-nav-next").addEventListener("click", () => {
    const a = new Date(ui.insightsAnchorDate instanceof Date ? ui.insightsAnchorDate : new Date());
    if (period === "week") a.setDate(a.getDate() + 7);
    else if (period === "maand") a.setMonth(a.getMonth() + 1);
    else if (period === "kwartaal") a.setMonth(a.getMonth() + 3);
    else a.setFullYear(a.getFullYear() + 1);
    ui.insightsAnchorDate = a;
    renderMeer();
  });

  // Globale dashboard mode switch
  el.querySelectorAll(".cms-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      ui.insightsDashboardMode = btn.dataset.mode;
      state.ui.insightsDashboardMode = ui.insightsDashboardMode;
      saveState(state);
      renderMeer();
    });
  });

  // Scrubbare werkritmegrafiek: pointer/touch interactie
  const scrubZone = el.querySelector(".rhythm-scrub-zone");
  const rhythmSvg = scrubZone && scrubZone.querySelector(".rhythm-svg");
  if (scrubZone && rhythmSvg) {
    const ptsData = JSON.parse(rhythmSvg.getAttribute("data-rhythm-pts") || "[]");

    function getClosestRhythmKey(clientX) {
      const curZone = el.querySelector(".rhythm-scrub-zone");
      if (!curZone) return null;
      const rect = curZone.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const svgX = relX * 280;
      let minDist = Infinity, closestKey = null;
      for (const p of ptsData) {
        const d = Math.abs(p.x - svgX);
        if (d < minDist) { minDist = d; closestKey = p.key; }
      }
      return closestKey;
    }

    scrubZone.addEventListener("pointerdown", e => {
      let scrubRAF = null;
      let lastX = e.clientX;

      const onMove = moveEvent => {
        lastX = moveEvent.clientX;
        if (scrubRAF) return;
        scrubRAF = requestAnimationFrame(() => {
          scrubRAF = null;
          const key = getClosestRhythmKey(lastX);
          if (key && key !== ui.workRhythmSelectedKey) {
            ui.workRhythmSelectedKey = key;
            renderMeer();
          }
        });
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);

      // Directe selectie bij aanraken
      const key = getClosestRhythmKey(e.clientX);
      if (key && key !== ui.workRhythmSelectedKey) {
        ui.workRhythmSelectedKey = key;
        renderMeer();
      }
    });
  }

  // Klant-rijen in de klantenlijst: tik opent klantdetail
  el.querySelectorAll(".ins-bar-row[data-customer-id]").forEach(row => {
    row.addEventListener("click", () => {
      const customerId = row.dataset.customerId;
      if (!customerId) return;
      if (ui.navStack.some(v => v.view === "customerDetail" && v.id === customerId)) return;
      pushView({ view: "customerDetail", id: customerId });
    });
  });

  renderTopbar();
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
  if (active.view === "customerFixedTemplate") renderCustomerFixedTemplateSheet(active.id);
  if (active.view === "productDetail") renderProductSheet(active.id);
  if (active.view === "logDetail") renderLogSheet(active.id);
  if (active.view === "settlementDetail") renderSettlementSheet(active.id);
  if (active.view === "settlementLogOverview") renderSettlementLogOverviewSheet(active.id);
  if (active.view === "newLog") renderNewLogSheet();
  if (active.view === "customers") renderCustomersSheet();
  if (active.view === "products") renderProductsSheet();
  if (active.view === "settlementListOptions") renderSettlementListOptionsSheet();
  if (active.view === "customerInsights") renderCustomerInsightsDetail();
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
        <div class="item-title">Vaste klanten</div>
        <button class="btn ${prefs.showFixed ? "primary" : ""}" type="button" id="toggleShowFixed">Vaste kwartaalafrekeningen</button>
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

  $("#toggleShowFixed")?.addEventListener("click", ()=>{
    state.settlementList = {
      ...SETTLEMENT_LIST_DEFAULTS,
      ...(state.settlementList || {}),
      showFixed: !Boolean(state.settlementList?.showFixed ?? SETTLEMENT_LIST_DEFAULTS.showFixed)
    };
    saveState();
    renderSheet();
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
        ${!isEditing ? `
          <button class="detail-edit-toggle${getCustomerFixedTemplate(c).enabled ? " is-template-active" : ""}" id="btnOpenCustomerTemplate" type="button" aria-label="Vaste kwartaal-template" title="Vaste kwartaal-template">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <path d="M16 2v4M8 2v4M3 10h18M7 15h10M7 19h6" stroke-linecap="round"/>
            </svg>
          </button>
        ` : ""}
        <button class="detail-edit-toggle" id="toggleClientEdit" type="button" aria-label="${isEditing ? "Klant opslaan" : "Klant bewerken"}" title="${isEditing ? "Klant opslaan" : "Klant bewerken"}">
          ${isEditing
            ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke-linejoin="round"/></svg>`}
        </button>
      </div>
    `
  });
  $("#sheetBody").style.paddingBottom = "calc(var(--detail-actionbar-height) + 18px)";

  // ---- Insights header ----
  const cdiPeriod = ui.customerDetailInsightsPeriod || "maand";
  const cdiAnchor = ui.customerDetailInsightsAnchor instanceof Date ? ui.customerDetailInsightsAnchor : new Date();
  const cdiMode = ui.customerDetailInsightsMode || "logs";
  const cdiRange = getInsightsPeriodRange(cdiPeriod, cdiAnchor);

  // Period label
  const MONTH_NL_CDI = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  function isoWeekNumCDI(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  }
  let cdiPeriodLabel;
  if (cdiPeriod === "week") {
    const sd = parseLocalYMD(cdiRange.start);
    const wn = sd ? isoWeekNumCDI(sd) : isoWeekNumCDI(cdiAnchor);
    cdiPeriodLabel = `week ${wn} \u00b7 ${cdiAnchor.getFullYear()}`;
  } else if (cdiPeriod === "maand") {
    cdiPeriodLabel = `${MONTH_NL_CDI[cdiAnchor.getMonth()]} ${cdiAnchor.getFullYear()}`;
  } else if (cdiPeriod === "kwartaal") {
    const q = Math.floor(cdiAnchor.getMonth() / 3) + 1;
    cdiPeriodLabel = `Q${q} ${cdiAnchor.getFullYear()}`;
  } else {
    cdiPeriodLabel = `${cdiAnchor.getFullYear()}`;
  }

  // Mode switch icons
  const iconClock = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconCard = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="9" width="16" height="10" rx="2"/><path d="M7 9V6h7l3 3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14h4" stroke-linecap="round"/><path d="M15 14h2" stroke-linecap="round"/><path d="M8 19v-2h8v2" stroke-linecap="round"/></svg>`;
  const cdiModeSwitchHTML = `<div class="cust-mode-switch">
    <button class="cms-btn${cdiMode === "logs" ? " cms-active" : ""}" data-cdi-mode="logs" aria-label="Logboek">${iconClock}</button>
    <button class="cms-btn${cdiMode === "settlements" ? " cms-active" : ""}" data-cdi-mode="settlements" aria-label="Afrekening">${iconCard}</button>
  </div>`;

  // Hero data
  const cdiLogsInRange = getLogsForCustomerPeriod(c.id, cdiRange);
  const cdiTotalWorkMs = cdiLogsInRange.reduce((sum, l) => sum + sumWorkMs(l), 0);
  const cdiPeriodGreenQty = round2(cdiLogsInRange.reduce((sum, log) => {
    const { greenItemQty } = splitLogItems(log);
    return sum + (Number(greenItemQty) || 0);
  }, 0));
  const cdiPeriodOtherQty = round2(cdiLogsInRange.reduce((sum, log) => {
    return sum + (log.items || []).reduce((itemSum, item) => {
      if (!isOtherProduct(item)) return itemSum;
      return itemSum + (Number(item.qty) || 0);
    }, 0);
  }, 0));

  const cdiEarnings = getCustomerEarningsSummaryForPeriod(c.id, cdiRange);
  const cdiSettlements = getSettlementsForCustomerPeriod(c.id, cdiRange);

  // Chart
  const cdiRhythmSeries = getCustomerRhythmSeries(c.id, cdiRange, cdiPeriod, cdiMode);
  const cdiRhythmEmptyMsg = cdiMode === "logs" ? "Geen werkdata in deze periode" : "Geen omzet in deze periode";

  // Validate selected key
  if (ui.customerDetailRhythmSelectedKey) {
    const keyStillValid = cdiRhythmSeries.buckets.some(b => b.key === ui.customerDetailRhythmSelectedKey);
    if (!keyStillValid) ui.customerDetailRhythmSelectedKey = null;
  }

  const cdiSelectedBucket = ui.customerDetailRhythmSelectedKey
    ? cdiRhythmSeries.buckets.find(b => b.key === ui.customerDetailRhythmSelectedKey) || null
    : null;

  let cdiHeroLabelHTML = "";
  let cdiHeroAmountHTML = "";
  let cdiHeroWorkedHTML = "";
  let cdiHeroMetaHTML = "";

  if (cdiMode === "logs") {
    if (!cdiSelectedBucket) {
      const workedDays = new Set(cdiLogsInRange.filter(l => sumWorkMs(l) > 0).map(l => l.date)).size;
      const logCount = cdiLogsInRange.length;
      const subLabel = workedDays === 1
        ? `${logCount} ${logCount === 1 ? "log" : "logs"} · 1 werkdag`
        : `${logCount} ${logCount === 1 ? "log" : "logs"} · ${workedDays} werkdagen`;
      const metaParts = [];
      if (cdiPeriodGreenQty > 0) metaParts.push(`${formatQuickQty(cdiPeriodGreenQty)} groen`);
      if (cdiPeriodOtherQty > 0) metaParts.push(`${formatQuickQty(cdiPeriodOtherQty)} andere producten`);

      cdiHeroAmountHTML = esc(fmtDurationShort(cdiTotalWorkMs));
      cdiHeroWorkedHTML = esc(subLabel);
      if (metaParts.length) {
        cdiHeroMetaHTML = `<div class="insights-hero-split">${metaParts.map((part, idx) => `${idx > 0 ? '<span class="insights-hero-dot">·</span>' : ""}<span>${esc(part)}</span>`).join("")}</div>`;
      }
    } else {
      const selKey = cdiSelectedBucket.key;
      const bucketLogs = (cdiPeriod === "week" || cdiPeriod === "maand")
        ? cdiLogsInRange.filter(l => l.date === selKey)
        : cdiLogsInRange.filter(l => (l.date || "").startsWith(selKey + "-"));
      const totalMs = bucketLogs.reduce((sum, l) => sum + sumWorkMs(l), 0);
      const pct = cdiTotalWorkMs > 0 ? Math.round((totalMs / cdiTotalWorkMs) * 100) : 0;
      const greenQty = round2(bucketLogs.reduce((sum, log) => {
        const { greenItemQty } = splitLogItems(log);
        return sum + (Number(greenItemQty) || 0);
      }, 0));
      const otherQty = round2(bucketLogs.reduce((sum, log) => {
        return sum + (log.items || []).reduce((itemSum, item) => {
          if (!isOtherProduct(item)) return itemSum;
          return itemSum + (Number(item.qty) || 0);
        }, 0);
      }, 0));
      const metaParts = [`${pct}% van totaal`, `${bucketLogs.length} ${bucketLogs.length === 1 ? "log" : "logs"}`];
      if (greenQty > 0) metaParts.push(`${formatQuickQty(greenQty)} groen`);
      if (otherQty > 0) metaParts.push(`${formatQuickQty(otherQty)} andere producten`);

      cdiHeroLabelHTML = `<div class="insights-hero-context">Geselecteerde bucket · ${esc(cdiSelectedBucket.detailLabel)}</div>`;
      cdiHeroAmountHTML = esc(durMsToHM(totalMs));
      cdiHeroWorkedHTML = esc(metaParts.slice(0, 2).join(" · "));
      cdiHeroMetaHTML = metaParts.length > 2
        ? `<div class="insights-hero-split">${metaParts.slice(2).map((part, idx) => `${idx > 0 ? '<span class="insights-hero-dot">·</span>' : ""}<span>${esc(part)}</span>`).join("")}</div>`
        : "";
    }
  } else {
    if (!cdiSelectedBucket) {
      const splitParts = [];
      if (cdiEarnings.invoice > 0) splitParts.push(`factuur ${fmtMoney0(cdiEarnings.invoice)}`);
      if (cdiEarnings.cash > 0) splitParts.push(`cash ${fmtMoney0(cdiEarnings.cash)}`);
      const subLabel = `${cdiSettlements.length} ${cdiSettlements.length === 1 ? "afrekening" : "afrekeningen"}`;

      cdiHeroAmountHTML = fmtMoney0(cdiEarnings.total);
      cdiHeroWorkedHTML = esc(subLabel);
      cdiHeroMetaHTML = splitParts.length
        ? `<div class="insights-hero-split">${splitParts.map((part, idx) => `${idx > 0 ? '<span class="insights-hero-dot">·</span>' : ""}<span>${part}</span>`).join("")}</div>`
        : "";
    } else {
      const selKey = cdiSelectedBucket.key;
      const bucketSettlements = (cdiPeriod === "week" || cdiPeriod === "maand")
        ? cdiSettlements.filter(s => s.date === selKey)
        : cdiSettlements.filter(s => (s.date || "").startsWith(selKey + "-"));
      const totalAmount = bucketSettlements.reduce((sum, s) => {
        const a = getSettlementAmounts(s);
        return sum + (a.invoice || 0) + (a.cash || 0);
      }, 0);
      const totalInvoice = bucketSettlements.reduce((sum, s) => sum + (getSettlementAmounts(s).invoice || 0), 0);
      const totalCash = bucketSettlements.reduce((sum, s) => sum + (getSettlementAmounts(s).cash || 0), 0);
      const pct = cdiEarnings.total > 0 ? Math.round((totalAmount / cdiEarnings.total) * 100) : 0;
      const splitParts = [`${pct}% van totaal`];
      if (totalInvoice > 0) splitParts.push(`factuur ${fmtMoney0(totalInvoice)}`);
      if (totalCash > 0) splitParts.push(`cash ${fmtMoney0(totalCash)}`);

      cdiHeroLabelHTML = `<div class="insights-hero-context">Geselecteerde bucket · ${esc(cdiSelectedBucket.detailLabel)}</div>`;
      cdiHeroAmountHTML = fmtMoney0(totalAmount);
      cdiHeroWorkedHTML = esc(splitParts[0]);
      cdiHeroMetaHTML = splitParts.length > 1
        ? `<div class="insights-hero-split">${splitParts.slice(1).map((part, idx) => `${idx > 0 ? '<span class="insights-hero-dot">·</span>' : ""}<span>${part}</span>`).join("")}</div>`
        : "";
    }
  }

  const cdiHeroHTML = `<div class="insights-hero${cdiSelectedBucket ? " insights-hero-selected" : ""}">
    ${cdiHeroLabelHTML}
    <div class="insights-hero-amount">${cdiHeroAmountHTML}</div>
    <div class="insights-hero-worked">${cdiHeroWorkedHTML}</div>
    ${cdiHeroMetaHTML}
  </div>`;

  const cdiRhythmChart = renderWorkRhythmSVGInteractive(cdiRhythmSeries, ui.customerDetailRhythmSelectedKey, cdiRhythmEmptyMsg);

  const insightsHeaderHTML = `
    <div class="client-insights-header insights-mode-${cdiMode}">
      <div class="insights-period-ctrl" role="tablist" aria-label="Periode selector">
        <button class="ipc-btn${cdiPeriod === "week" ? " ipc-active" : ""}" data-cdp="week">Week</button>
        <button class="ipc-btn${cdiPeriod === "maand" ? " ipc-active" : ""}" data-cdp="maand">Maand</button>
        <button class="ipc-btn${cdiPeriod === "kwartaal" ? " ipc-active" : ""}" data-cdp="kwartaal">Kwartaal</button>
        <button class="ipc-btn${cdiPeriod === "jaar" ? " ipc-active" : ""}" data-cdp="jaar">Jaar</button>
      </div>
      <div class="insights-nav">
        <div class="insights-nav-period">
          <button class="ins-nav-prev cdi-prev">&#8249;</button>
          <span class="ins-nav-label">${esc(cdiPeriodLabel)}</span>
          <button class="ins-nav-next cdi-next">&#8250;</button>
        </div>
        ${cdiModeSwitchHTML}
      </div>
      <div class="insights-section">${cdiRhythmChart}</div>
      ${cdiHeroHTML}
    </div>
  `;

  $("#sheetBody").innerHTML = `
    <div class="stack client-detail-view">
      ${insightsHeaderHTML}

      <div class="card stack">
        ${isEditing ? `
          <div>
            <label>Bijnaam</label>
            <input id="cNick" value="${esc(draft.nickname)}" />
          </div>
        ` : ""}
        ${isEditing ? `
          <div class="row">
            <div style="flex:1; min-width:220px;">
              <label>Naam</label>
              <input id="cName" value="${esc(draft.name)}" />
            </div>
          </div>
          <div>
            <label>Adres</label>
            <input id="cAddr" value="${esc(draft.address)}" />
          </div>
        ` : `
          <div class="customer-inline">
            <div class="customer-name">${esc(c.name || "-")}</div>
            ${c.address ? `<div class="customer-address">${esc(c.address)}</div>` : ""}
          </div>
        `}
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

  const body = $("#sheetBody");

  // ---- Insights event listeners ----

  // Period tabs
  body.querySelectorAll("[data-cdp]").forEach(btn => {
    btn.addEventListener("click", () => {
      ui.customerDetailInsightsPeriod = btn.dataset.cdp;
      ui.customerDetailRhythmSelectedKey = null;
      renderSheet();
    });
  });

  // Period navigation
  body.querySelector(".cdi-prev")?.addEventListener("click", () => {
    const a = new Date(ui.customerDetailInsightsAnchor instanceof Date ? ui.customerDetailInsightsAnchor : new Date());
    const p = ui.customerDetailInsightsPeriod || "maand";
    if (p === "week") a.setDate(a.getDate() - 7);
    else if (p === "maand") a.setMonth(a.getMonth() - 1);
    else if (p === "kwartaal") a.setMonth(a.getMonth() - 3);
    else a.setFullYear(a.getFullYear() - 1);
    ui.customerDetailInsightsAnchor = a;
    ui.customerDetailRhythmSelectedKey = null;
    renderSheet();
  });

  body.querySelector(".cdi-next")?.addEventListener("click", () => {
    const a = new Date(ui.customerDetailInsightsAnchor instanceof Date ? ui.customerDetailInsightsAnchor : new Date());
    const p = ui.customerDetailInsightsPeriod || "maand";
    if (p === "week") a.setDate(a.getDate() + 7);
    else if (p === "maand") a.setMonth(a.getMonth() + 1);
    else if (p === "kwartaal") a.setMonth(a.getMonth() + 3);
    else a.setFullYear(a.getFullYear() + 1);
    ui.customerDetailInsightsAnchor = a;
    ui.customerDetailRhythmSelectedKey = null;
    renderSheet();
  });

  // Mode switch
  body.querySelectorAll("[data-cdi-mode]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      ui.customerDetailInsightsMode = btn.dataset.cdiMode;
      ui.customerDetailRhythmSelectedKey = null;
      renderSheet();
    });
  });

  // Scrub chart
  const scrubZone = body.querySelector(".rhythm-scrub-zone");
  const rhythmSvg = scrubZone && scrubZone.querySelector(".rhythm-svg");
  if (scrubZone && rhythmSvg) {
    const ptsData = JSON.parse(rhythmSvg.getAttribute("data-rhythm-pts") || "[]");

    function getClosestCdiKey(clientX) {
      const curZone = body.querySelector(".rhythm-scrub-zone");
      if (!curZone) return null;
      const rect = curZone.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const svgX = relX * 280;
      let minDist = Infinity, closestKey = null;
      for (const p of ptsData) {
        const d = Math.abs(p.x - svgX);
        if (d < minDist) { minDist = d; closestKey = p.key; }
      }
      return closestKey;
    }

    scrubZone.addEventListener("pointerdown", e => {
      let scrubRAF = null;
      let lastX = e.clientX;

      const onMove = moveEvent => {
        lastX = moveEvent.clientX;
        if (scrubRAF) return;
        scrubRAF = requestAnimationFrame(() => {
          scrubRAF = null;
          const key = getClosestCdiKey(lastX);
          if (key && key !== ui.customerDetailRhythmSelectedKey) {
            ui.customerDetailRhythmSelectedKey = key;
            renderSheet();
          }
        });
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);

      const key = getClosestCdiKey(e.clientX);
      if (key && key !== ui.customerDetailRhythmSelectedKey) {
        ui.customerDetailRhythmSelectedKey = key;
        renderSheet();
      }
    });
  }

  // ---- Existing event listeners ----

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

  $("#btnOpenCustomerTemplate")?.addEventListener("click", ()=>{
    pushView({ view: "customerFixedTemplate", id: c.id });
  });

  $("#delCustomer")?.addEventListener("click", ()=>{
    const hasLogs = state.logs.some(l => l.customerId === c.id);
    const hasSet = state.settlements.some(s => s.customerId === c.id);
    if (hasLogs || hasSet){ alert("Kan niet verwijderen: klant heeft logs/afrekeningen."); return; }
    if (!confirmDelete(`Klant: ${c.nickname||c.name||""}`)) return;
    actions.deleteCustomer(c.id);
    closeSheet();
  });

  body.querySelectorAll("[data-open-log]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("log", x.getAttribute("data-open-log")));
  });
  body.querySelectorAll("[data-open-settlement]").forEach(x=>{
    x.addEventListener("click", ()=> openSheet("settlement", x.getAttribute("data-open-settlement")));
  });
}

function renderCustomerFixedTemplateSheet(customerId){
  const c = getCustomer(customerId);
  if (!c){ closeSheet(); return; }
  const tmpl = getCustomerFixedTemplate(c);

  $("#sheetTitle").textContent = "Vaste kwartaal-template";
  $("#sheetActions").innerHTML = "";

  const workIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="7"/><path d="M12 8.6v3.8l2.7 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const greenIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`;

  const renderTmplControls = (key, bucket, qty) => {
    const fieldMap = {
      'labor|invoice': 'laborInvoiceUnits',
      'labor|cash':    'laborCashUnits',
      'green|invoice': 'greenInvoiceUnits',
      'green|cash':    'greenCashUnits'
    };
    const fieldKey = fieldMap[`${key}|${bucket}`] || "";
    return `<div class="allocation-controls" data-bucket="${bucket}">
      <button class="iconbtn iconbtn-sm" type="button" data-tmpl-step="${fieldKey}|-1" aria-label="${bucket} min">−</button>
      <div class="allocation-value mono tabular">${esc(String(formatQuickQty(qty)))}</div>
      <button class="iconbtn iconbtn-sm" type="button" data-tmpl-step="${fieldKey}|1" aria-label="${bucket} plus">+</button>
    </div>`;
  };

  $("#sheetBody").innerHTML = `
    <div class="stack">
      <div class="section section-tight">
        <div class="summary-row">
          <span class="label">${esc(c.nickname || c.name || "Klant")}</span>
          <span class="num muted">kwartaal</span>
        </div>
      </div>

      <div class="card stack">
        <div class="row space" style="min-height:44px;align-items:center">
          <span style="font-size:14px;color:var(--text)">Actief</span>
          <button class="iconbtn ${tmpl.enabled ? "is-active" : ""}" id="btnTmplToggle" type="button"
            aria-pressed="${tmpl.enabled}" aria-label="${tmpl.enabled ? "Template uitschakelen" : "Template inschakelen"}"
            title="${tmpl.enabled ? "Template uitschakelen" : "Template inschakelen"}">
            ${tmpl.enabled
              ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
              : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`}
          </button>
        </div>

        <div class="allocation-matrix">
          <div class="allocation-col-head" aria-hidden="true"></div>
          <div class="allocation-col-head">Factuur</div>
          <div class="allocation-col-head">Cash</div>

          <div class="allocation-matrix-icon" aria-hidden="true">${workIcon}</div>
          ${renderTmplControls('labor', 'invoice', tmpl.laborInvoiceUnits)}
          ${renderTmplControls('labor', 'cash',    tmpl.laborCashUnits)}

          <div class="allocation-matrix-icon" aria-hidden="true">${greenIcon}</div>
          ${renderTmplControls('green', 'invoice', tmpl.greenInvoiceUnits)}
          ${renderTmplControls('green', 'cash',    tmpl.greenCashUnits)}
        </div>
      </div>

      <div class="card stack">
        <label style="font-size:12px;color:var(--muted)">Notitie</label>
        <textarea id="tmplNote" rows="3" style="width:100%;min-height:44px;border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;padding:8px 2px;resize:vertical">${esc(tmpl.note || "")}</textarea>
      </div>
    </div>
  `;

  $("#btnTmplToggle")?.addEventListener("click", ()=>{
    actions.toggleCustomerTemplateEnabled(customerId);
    renderSheetKeepScroll();
  });

  $("#sheetBody").querySelectorAll("[data-tmpl-step]").forEach(btn=>{
    const raw = String(btn.getAttribute("data-tmpl-step") || "");
    const [key, directionRaw] = raw.split("|");
    const direction = Number(directionRaw || 0);
    if (!key || !Number.isFinite(direction) || direction === 0) return;
    btn.addEventListener("click", ()=>{
      actions.bumpCustomerTemplateValue(customerId, key, direction);
      renderSheetKeepScroll();
    });
  });

  $("#tmplNote")?.addEventListener("change", ()=>{
    actions.updateCustomerTemplateNote(customerId, $("#tmplNote").value || "");
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
  const statusPillClass = visual.state === "paid" ? "pill-paid" : visual.state === "calculated" ? "pill-calc" : visual.state === "linked" ? "pill-open" : visual.state === "fixed" ? "pill-fixed" : "pill-neutral";
  const statusLabel = visual.state === "free" ? "vrij" : visual.state === "linked" ? "gekoppeld" : visual.state === "calculated" ? "berekend" : visual.state === "fixed" ? "vaste klant" : "betaald";
  const isEditing = state.ui.editLogId === log.id;

  function renderSegments(currentLog, editing){
    const segments = currentLog.segments || [];
    const breakSegments = segments.filter(s => s.type === "break");
    const pauseDraft = ui.logDetailPauseDraft;
    if (!breakSegments.length && !pauseDraft) return "";

    return `
      <section class="compact-section stack">
        ${pauseDraft ? `
          <div class="pause-editor" role="group" aria-label="Pauze invoeren" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-top:1px dashed var(--border); padding:12px 0 8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:13px; color:var(--muted); font-weight:600; margin-right:4px;">Pauze:</span>
              <input type="time" class="log-detail-date-input" style="font-size:18px; width:auto; text-align:center;" value="${esc(pauseDraft.start || "")}" id="pauseStartInput" />
              <span style="opacity:0.5; font-size:18px;">–</span>
              <input type="time" class="log-detail-date-input" style="font-size:18px; width:auto; text-align:center;" value="${esc(pauseDraft.end || "")}" id="pauseEndInput" />
            </div>
            <div class="segment-editor-actions" style="margin:0;">
              <button class="iconbtn iconbtn-sm" type="button" id="confirmPause" title="Bevestig" aria-label="Bevestig"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
              <button class="iconbtn iconbtn-sm ghost" type="button" id="cancelPause" title="Annuleer" aria-label="Annuleer" style="border-color:var(--border);"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
          </div>
        ` : ""}
        <div class="compact-lines">
          ${breakSegments.map(s=>{
            const start = s.start ? fmtClock(s.start) : "…";
            const end = s.end ? fmtClock(s.end) : "…";
            const segmentDuration = calculateDuration(start, end);
            const isOpen = ui.logDetailSegmentEditId === s.id;
            return `
              <div class="segment-row ${isOpen ? "is-open" : ""}">
                <button class="segment-row-btn mono" type="button" data-toggle-segment="${s.id}">
                  <span class="segment-row-main"><span>Pauze ${start}–${end}</span><span class="segment-duration">${segmentDuration}</span></span>
                </button>
                ${isOpen ? `
                  <div class="segment-editor" data-segment-editor="${s.id}" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-top:1px dashed var(--border); padding:10px 0 6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <input type="time" class="log-detail-date-input" style="font-size:18px; width:auto; text-align:center;" value="${esc((ui.segmentDrafts[s.id] || {}).start ?? fmtTimeInput(s.start))}" data-edit-segment="${s.id}" data-field="start" />
                      <span style="opacity:0.5; font-size:18px;">–</span>
                      <input type="time" class="log-detail-date-input" style="font-size:18px; width:auto; text-align:center;" value="${esc((ui.segmentDrafts[s.id] || {}).end ?? fmtTimeInput(s.end))}" data-edit-segment="${s.id}" data-field="end" />
                    </div>
                    <div class="segment-editor-actions" style="margin:0;">
                      <button class="iconbtn iconbtn-sm" type="button" data-commit-segment="${s.id}" title="Bevestig tijden" aria-label="Bevestig tijden"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
                      <button class="iconbtn iconbtn-sm danger" type="button" data-del-segment="${s.id}" title="Verwijder segment" aria-label="Verwijder segment">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 6h18" stroke-linecap="round"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg>
                      </button>
                    </div>
                  </div>
                ` : ""}
              </div>
            `;
          }).join("")}
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
    const visual = getLogVisualState(currentLog);
    const prettyDate = formatDateDayMonthShortYear(currentLog.date || "");
    const weekday = formatDateWeekdayLong(currentLog.date || "");
    const { firstSegment, lastSegment } = getLogBoundarySegments(currentLog);
    const globalRange = firstSegment && lastSegment
      ? `
        <span class="hero-time-wrapper">
          <span aria-hidden="true">${esc(formatClockDot(firstSegment.start))}</span>
          <input type="time" class="hero-time-hidden-input" value="${esc(fmtTimeInput(firstSegment.start))}" data-quick-edit-segment="${esc(firstSegment.id)}" data-field="start" />
        </span>
        <span> - </span>
        <span class="hero-time-wrapper">
          <span aria-hidden="true">${esc(formatClockDot(lastSegment.end))}</span>
          <input type="time" class="hero-time-hidden-input" value="${esc(fmtTimeInput(lastSegment.end))}" data-quick-edit-segment="${esc(lastSegment.id)}" data-field="end" />
        </span>
      `
      : "—";
    const totalMinutes = Math.floor(sumWorkMs(currentLog) / 60000);
    const customerName = cname(currentLog.customerId) || "—";
    const dateInputValue = formatLocalYMD(new Date(currentLog.date));
    const dateHeader = `
      <div class="log-detail-hero-date">
        <span class="hero-date-wrapper">
          <span aria-hidden="true">${esc(prettyDate || currentLog.date || "—")}</span>
          <input type="date" class="hero-date-hidden-input" data-quick-edit-date="true" value="${esc(dateInputValue)}" max="${formatLocalYMD(new Date())}" />
        </span>
      </div>
    `;

    return `
      <section class="compact-section log-detail-header log-detail-header--${esc(visual.state)}">
        <div class="log-detail-hero-context">
          <span class="log-detail-hero-customer">${esc(customerName)}</span>
          <span class="log-detail-hero-total">${esc(formatDurationCompact(totalMinutes))}</span>
        </div>
        <div class="log-detail-hero-center">
          <div class="log-detail-hero-weekday">${esc(weekday || "—")}</div>
          ${dateHeader}
          <div class="log-detail-hero-time">${globalRange}</div>
        </div>
        <div class="log-detail-header-sections">
          ${renderSegments(currentLog, editing)}
          ${renderGreenRow(currentLog)}
        </div>
      </section>
    `;
  }

  const noteSection = `
    <div class="log-ghost-note-container">
      <textarea id="logNote" class="log-ghost-note-input" placeholder="Notitie..." rows="1">${esc(log.note || "")}</textarea>
    </div>
  `;

  $("#sheetBody").innerHTML = `
    <div class="stack log-detail-compact log-detail-view">
      ${noteSection}
      <div class="log-detail-flow">
        ${renderLogHeader(log, isEditing)}
      </div>

      <section class="compact-section stack log-detail-flow">
        <div class="log-lines-wrap">
          ${renderProducts(log, { context: "log", isEditing })}
        </div>
      </section>

      <section class="compact-section log-detail-footer-actions">
        <span class="pill ${statusPillClass}">${statusLabel}</span>
        ${isEditing ? `<button class="btn danger" id="delLog">Verwijder</button>` : ""}
      </section>
    </div>
  `;

  setDetailActionBar({
    className: "log-detail-actionbar",
    html: `
    <div class="log-detail-actionbar-left">
      <button class="more-action-btn" id="btnOpenLogCustomer" type="button" aria-label="Open gekoppelde klant" title="Open gekoppelde klant" ${log.customerId ? "" : "disabled"}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>
      </button>
    </div>
    <div class="log-detail-actionbar-right">
      ${linkedAfrekeningId ? `<button class="more-action-btn" id="btnOpenLogSettlement" type="button" aria-label="Open gekoppelde afrekening" title="Open gekoppelde afrekening">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"></rect><path d="M2.5 10h19" stroke-linecap="round"></path><path d="M7 14.5h4" stroke-linecap="round"></path></svg>
      </button>` : ""}
      <div class="status-log-link-wrap log-detail-link-wrap">
        <button class="more-action-btn status-link" id="btnLogSettlementPicker" type="button" aria-label="Koppel aan afrekening" title="Koppel aan afrekening" ${locked ? "disabled" : ""}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.6 13.4l2.8-2.8" stroke-linecap="round"/><path d="M7.8 16.2l-1.4 1.4a3 3 0 1 1-4.2-4.2l1.4-1.4a3 3 0 0 1 4.2 0" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.2 7.8l1.4-1.4a3 3 0 1 1 4.2 4.2l-1.4 1.4a3 3 0 0 1-4.2 0" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <select id="logSettlementPicker" class="status-picker-select" ${locked ? "disabled" : ""} aria-label="Afrekening koppelen">
          ${settlementOptions}
        </select>
      </div>
      <button class="more-action-btn" id="addPause" type="button" aria-label="Pauze toevoegen" title="Pauze toevoegen">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
      </button>
      <button class="more-action-btn" id="btnLogEdit" type="button" aria-label="${isEditing ? "Gereed" : "Bewerk"}" title="${isEditing ? "Gereed" : "Bewerk"}">
      ${isEditing
        ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
        : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L3.8 17.5z"></path><path d="M14 5l5 5"></path></svg>`}
      </button>
    </div>
  `});
  $("#sheetBody").style.paddingBottom = "calc(var(--detail-actionbar-height) + 18px)";

  const linkedCustomerId = log.customerId || "";
  document.getElementById("btnOpenLogCustomer")?.addEventListener("click", ()=>{
    if (!linkedCustomerId) return;
    if (ui.navStack.some(v => v.view === "customerDetail" && v.id === linkedCustomerId)) return;
    pushView({ view: "customerDetail", id: linkedCustomerId });
  });
  document.getElementById("btnLogEdit")?.addEventListener("click", () => {
    toggleEditLog(id);
    renderSheet();
  });
  document.getElementById("btnLogSettlementPicker")?.addEventListener("click", ()=>{
    if (locked) return;
    openAfrekeningPickerForLog(log.id, { anchorEl: document.getElementById("logSettlementPicker") });
  });
  document.getElementById("btnOpenLogSettlement")?.addEventListener("click", ()=>{
    if (!linkedAfrekeningId) return;
    openSheet("settlement", linkedAfrekeningId);
  });

  const logNoteEl = $("#logNote");
  if (logNoteEl){
    autoResizeTextarea(logNoteEl);
    logNoteEl.addEventListener("input", ()=>{
      autoResizeTextarea(logNoteEl);
    });
  }

  // wire (autosave)
  logNoteEl?.addEventListener("change", ()=>{
    actions.editLog(log.id, (draft)=>{
      draft.note = (logNoteEl.value||"").trim();
    });
  });

  $("#sheetBody").querySelectorAll("[data-quick-edit-date]").forEach(inp=>{
    inp.addEventListener("blur", (event)=>{
      const nextDate = event.target?.value;
      if (!nextDate) return;
      if (nextDate > formatLocalYMD(new Date())) return;
      actions.editLog(log.id, (draft)=>{
        setLogDay(draft, nextDate);
      });
      renderSheet();
    });
  });

  $("#sheetBody").querySelectorAll(".hero-time-hidden-input").forEach(inp=>{
    inp.addEventListener("blur", (event)=>{
      const target = event.target;
      const nextTime = target?.value;
      const segmentId = target?.dataset?.quickEditSegment;
      const field = target?.dataset?.field;
      if (!nextTime || !segmentId || !["start", "end"].includes(field)) return;

      actions.editLog(log.id, (draft)=>{
        const segment = (draft.segments || []).find(s => s.id === segmentId);
        if (!segment) return;
        const nextMs = parseLogTimeToMs(draft.date || log.date, nextTime);
        if (!Number.isFinite(nextMs)) return;

        if (field === "start"){
          segment.start = nextMs;
          if (!Number.isFinite(segment.end) || segment.start >= segment.end){
            segment.end = segment.start + 60000;
          }
          return;
        }

        segment.end = nextMs;
        if (!Number.isFinite(segment.start) || segment.end <= segment.start){
          segment.start = segment.end - 60000;
        }
      });
      renderSheet();
    });
  });


  $("#addPause")?.addEventListener("click", ()=>{
    const timeline = getLogTimelineBounds(log);
    ui.logDetailSegmentEditId = null;
    ui.logDetailPauseDraft = {
      start: fmtTimeInput(timeline.start),
      end: fmtTimeInput(timeline.end)
    };
    renderSheet();
  });

  $("#pauseStartInput")?.addEventListener("change", (event)=>{
    ui.logDetailPauseDraft = ui.logDetailPauseDraft || { start: "", end: "" };
    ui.logDetailPauseDraft.start = event.target?.value || "";
  });

  $("#pauseEndInput")?.addEventListener("change", (event)=>{
    ui.logDetailPauseDraft = ui.logDetailPauseDraft || { start: "", end: "" };
    ui.logDetailPauseDraft.end = event.target?.value || "";
  });

  $("#cancelPause")?.addEventListener("click", ()=>{
    ui.logDetailPauseDraft = null;
    renderSheet();
  });

  $("#confirmPause")?.addEventListener("click", ()=>{
    const pauseDraft = ui.logDetailPauseDraft;
    if (!pauseDraft) return;
    const pauseStart = parseLogTimeToMs(log.date, pauseDraft.start);
    const pauseEnd = parseLogTimeToMs(log.date, pauseDraft.end);
    if (pauseStart == null || pauseEnd == null || !(pauseEnd > pauseStart)){
      alert("Pauze ongeldig: einde moet later zijn dan start.");
      return;
    }

    const result = insertPauseIntoLog(log, pauseStart, pauseEnd);
    if (!result.ok){
      if (result.reason === 'outside_timeline'){
        alert('Pauze valt buiten de logtijdslijn. Kies een tijd binnen de bestaande segmenten.');
        return;
      }
      if (result.reason === 'no_work_overlap'){
        alert('Deze pauze raakt geen werksegmenten, er is niets aangepast.');
        return;
      }
      alert('Pauze kon niet worden ingevoegd.');
      return;
    }

    actions.editLog(log.id, (draft)=>{
      draft.segments = result.segments;
    });
    ui.logDetailPauseDraft = null;
    ui.logDetailSegmentEditId = null;
    renderSheet();
  });

  $("#sheetBody").querySelectorAll("[data-toggle-segment]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const segmentId = btn.getAttribute("data-toggle-segment");
      if (ui.logDetailSegmentEditId === segmentId){
        delete ui.segmentDrafts[segmentId];
        ui.logDetailSegmentEditId = null;
      } else {
        ui.logDetailPauseDraft = null;
        const seg = (log.segments || []).find(x => x.id === segmentId);
        if (seg) ui.segmentDrafts[segmentId] = { start: fmtTimeInput(seg.start), end: fmtTimeInput(seg.end) };
        ui.logDetailSegmentEditId = segmentId;
      }
      renderSheet();
    });
  });

  $("#sheetBody").querySelectorAll("[data-edit-segment]").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const segmentId = inp.getAttribute("data-edit-segment");
      const field = inp.getAttribute("data-field");
      const seg = (log.segments||[]).find(x => x.id === segmentId);
      if (!seg) return;

      if (field === "start" || field === "end"){
        // Draft only — geen directe opslag
        ui.segmentDrafts[segmentId] = ui.segmentDrafts[segmentId] || { start: fmtTimeInput(seg.start), end: fmtTimeInput(seg.end) };
        ui.segmentDrafts[segmentId][field] = inp.value;
        return;
      }

      if (field === "type"){
        if (!["work", "break"].includes(inp.value)){
          alert('Type moet "work" of "break" zijn.');
          renderSheet();
          return;
        }
        actions.editLog(log.id, (draft)=>{
          const target = (draft.segments||[]).find(x => x.id === segmentId);
          if (!target) return;
          target.type = inp.value;
          rebuildLogSegments(draft);
        });
        renderSheet();
      }
    });
  });

  $("#sheetBody").querySelectorAll("[data-commit-segment]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const segmentId = btn.getAttribute("data-commit-segment");
      const seg = (log.segments||[]).find(x => x.id === segmentId);
      if (!seg) return;
      const draft = ui.segmentDrafts[segmentId];
      if (!draft) return;
      const nextStart = parseLogTimeToMs(log.date, draft.start);
      const nextEnd = parseLogTimeToMs(log.date, draft.end);
      if (nextStart == null || nextEnd == null || !(nextEnd > nextStart)){
        alert("Segment ongeldig: einde moet later zijn dan start.");
        return;
      }
      actions.editLog(log.id, (appDraft)=>{
        const target = (appDraft.segments||[]).find(x => x.id === segmentId);
        if (!target) return;
        target.start = nextStart;
        target.end = nextEnd;
        rebuildLogSegments(appDraft);
      });
      delete ui.segmentDrafts[segmentId];
      ui.logDetailSegmentEditId = null;
      renderSheet();
    });
  });

  $("#sheetBody").querySelectorAll("[data-del-segment]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const segmentId = btn.getAttribute("data-del-segment");
      if (!confirmDelete("Segment verwijderen")) return;
      actions.editLog(log.id, (draft)=>{
        draft.segments = (draft.segments||[]).filter(s => s.id !== segmentId);
        rebuildLogSegments(draft);
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

function renderGreenRow(log) {
  const { greenItemQty } = splitLogItems(log);
  return `
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
  `;
}

function renderProducts(log, { context = "log", isEditing = false } = {}){
  if (context !== "log") return renderLogItems(log);

  const { otherItems } = splitLogItems(log);
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
  const { unitPrice: hourly } = getWorkProductSnapshot();
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
  // Vaste kwartaalafrekening: geen berekenflow, geen betaaltoggle — toon vaste status.
  if (isFixedQuarterlySettlement(settlement)){
    return `<div class="status-icon-chip" style="color:rgba(147,88,220,.9);cursor:default;" aria-label="Vaste kwartaalafrekening" tabindex="-1">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>
    </div>`;
  }

  const isCalculated = isSettlementCalculated(settlement);
  const isEdit = isSettlementEditing(settlement?.id);
  const showCalculateIcon = !isCalculated || isEdit === true;
  const calcStateClass = isCalculated ? "is-open" : "";
  const calcDisabled = !isEdit && isCalculated ? " disabled aria-disabled=\"true\"" : "";
  const iconPresentation = getSettlementIconPresentation(settlement);
  const chips = [
    showCalculateIcon
      ? `
    <button class="status-icon-chip status-icon-calc ${calcStateClass}" id="toggleCalculated" type="button" aria-label="Bereken afrekening"${calcDisabled}>
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
  // Vaste kwartaalafrekeningen gebruiken geen berekenflow.
  if (isFixedQuarterlySettlement(settlement)) return;

  // Bouw/update allocations vanuit logs (enkel als nog niet calculated)
  buildAllocationsFromLogs(settlement);

  syncSettlementDatesFromLogs(settlement);

  settlement.markedCalculated = true;
  settlement.isCalculated = true;
  settlement.calculatedAt = now();

  // Factuurnummer pas toewijzen zodra de afrekening berekend is.
  // Use getSettlementTotals so manual override totals are respected for fixed-period settlements
  const totals = getSettlementTotals(settlement);
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
  // Vaste kwartaalafrekeningen gebruiken geen berekenflow.
  if (isFixedQuarterlySettlement(settlement)) return;
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
  const totalAmount = round2(totalProductCost + ((totalWorkMinutes / 60) * getWorkProductSnapshot().unitPrice));

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
  const calcMode = getSettlementCalcMode(s);
  const isManualMode = calcMode === "manual";
  const manual = getSettlementManualOverride(s);
  const isFixed = isFixedQuarterlySettlement(s);
  // Vaste kwartaalafrekeningen: toon factuurnummer-sectie wanneer er een bedrag is,
  // ook al is status "fixed" (niet "calculated"/"paid").
  const showInvoiceNumberSection = Boolean(pay.hasInvoice) &&
    (["calculated", "paid"].includes(s.status) || isFixed);
  const canEditInvoiceNumber = (s.status === "calculated" && pay.hasInvoice === true && s.status !== "paid")
    || (isFixed && Boolean(pay.hasInvoice));
  const invoiceNumberReadOnly = s.status === "paid";
  const logbookTotals = settlementLogbookTotals(s);

  // Bouw allocation-rijen vanuit s.allocations (bron van waarheid)
  const workIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="7"/><path d="M12 8.6v3.8l2.7 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const greenIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`;
  const leafIconSmall = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 15c2.2-6.2 8.4-8.7 14-9-1.1 5.7-3 11.8-9 14-4 1.4-7-1.3-5-5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 14.5c2 .2 4.6-.4 7.5-2.4" stroke-linecap="round"/></svg>`;
  const boxIconSmall = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 8 8-4 8 4-8 4-8-4Z" stroke-linejoin="round"/><path d="M4 8v8l8 4 8-4V8" stroke-linejoin="round"/><path d="M12 12v8" stroke-linecap="round"/></svg>`;
  const greenProduct = findGreenProduct();
  const allocationRows = [];

  if (isManualMode){
    allocationRows.push({ key: 'manual-hours', icon: workIcon, label: 'Werk', invoiceQty: manual.hoursInvoice, cashQty: manual.hoursCash });
    allocationRows.push({ key: 'manual-groen', icon: greenIcon, label: 'Groen', invoiceQty: manual.groenInvoice, cashQty: manual.groenCash });
  } else {
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
  }

  // Render helpers voor de matrix
  const renderAllocationControls = ({ key, bucket, qty })=>{
    if (isManualMode){
      const fieldMap = {
        'manual-hours|invoice': 'hoursInvoice',
        'manual-hours|cash': 'hoursCash',
        'manual-groen|invoice': 'groenInvoice',
        'manual-groen|cash': 'groenCash'
      };
      const fieldKey = fieldMap[`${key}|${bucket}`] || "";
      return `<div class="allocation-controls" data-bucket="${bucket}">
        <button class="iconbtn iconbtn-sm" type="button" data-settle-manual-step="${fieldKey}|-1" aria-label="${bucket} min">−</button>
        <div class="allocation-value mono tabular">${esc(String(formatQuickQty(qty)))}</div>
        <button class="iconbtn iconbtn-sm" type="button" data-settle-manual-step="${fieldKey}|1" aria-label="${bucket} plus">+</button>
      </div>`;
    }
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
  const calculated = isSettlementCalculated(s);
  const quarterLabel = isFixed ? (s.quarterKey || getQuarterKey(s.date || s.periodStart)) : null;
  $('#sheetBody').innerHTML = `
    <div class="stack settlement-detail settlement-flow ${visual.accentClass}">
      ${isFixed ? `<div class="section section-tight"><div class="summary-row"><span class="label" style="color:rgba(147,88,220,.9);">Vaste kwartaalafrekening</span><span class="num mono" style="color:rgba(147,88,220,.9);">${esc(quarterLabel)}</span></div></div>` : ""}
      ${(!isEdit && (s.note || '').trim()) ? `<div class="section section-tight settlement-note-top"><div class="settlement-note-text">${esc(s.note.trim())}</div></div>` : ``}
      <div class="section stack section-tight">
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
            invoiceClass: calculated ? (paymentFlags.invoicePaid ? 'is-paid' : 'is-open') : '',
            cashClass: calculated ? (paymentFlags.cashPaid ? 'is-paid' : 'is-open') : '',
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
        <div class="compact-row"><label>Afrekendatum</label><div class="row-inline"><input id="settlementDateOverride" type="date" value="${esc(String(ui.settlementDateDraft[s.id] ?? s.dateOverride ?? s.date ?? ""))}" /><button class="iconbtn iconbtn-sm" id="btnCommitSettlementDate" type="button" title="Bevestig datum" aria-label="Bevestig datum"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>${s.dateOverride ? `<button class="iconbtn iconbtn-sm" id="btnResetSettlementDate" type="button" title="Reset naar automatisch" aria-label="Reset naar automatisch"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7" stroke-linecap="round"/><path d="M3 3v6h6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}</div></div>
        ${showInvoiceNumberSection ? `<div class="compact-row"><label>Factuurnr</label><div><input id="invoiceNumberInput" value="${esc(invoiceNumberDisplay)}" ${invoiceNumberReadOnly ? "readonly" : ""} /></div></div>` : ''}
        <textarea id="sNote" rows="3">${esc(s.note||"")}</textarea>
        <button class="btn danger" id="delSettlement">Verwijder</button>
      </div>` : ""}
    </div>
  `;

  setStatusTabbar(`
    <div class="settlement-detail-action-row">
      <div class="settlement-detail-action-left">
        <button class="iconbtn settlement-detail-action-btn" id="btnOpenSettlementCustomer" type="button" aria-label="Open gekoppelde klant" title="Open gekoppelde klant" ${s.customerId ? "" : "disabled"}>
          <svg class="icon settlement-detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>
        </button>
        <div class="settlement-status-bar">
          ${renderSettlementStatusIcons(s)}
        </div>
      </div>
      <div class="settlement-detail-action-right">
        ${isEdit && !isManualMode && !isFixed ? `
          <button class="iconbtn settlement-detail-action-btn" id="btnSettlementRecalc" type="button" aria-label="Herbereken uit logs" title="Herbereken uit logs">
            <svg class="icon settlement-detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke-linecap="round"/>
              <path d="M21 3v6h-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        ` : ""}
        ${isEdit && !isFixed ? `
          <button class="iconbtn settlement-detail-action-btn ${isManualMode ? "is-active" : ""}" id="btnSettlementManualOverride" type="button" aria-label="Handmatige override" title="Handmatige override" aria-pressed="${isManualMode ? "true" : "false"}">
            <svg class="icon settlement-detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
              <path d="M4 6h8" stroke-linecap="round"/>
              <circle cx="15" cy="6" r="2"/>
              <path d="M4 12h5" stroke-linecap="round"/>
              <circle cx="12" cy="12" r="2"/>
              <path d="M4 18h11" stroke-linecap="round"/>
              <circle cx="18" cy="18" r="2"/>
            </svg>
          </button>
        ` : ""}
        <button class="iconbtn settlement-detail-action-btn" id="btnSettlementEdit" type="button" aria-label="${isEdit ? "Gereed" : "Bewerk"}" title="${isEdit ? "Gereed" : "Bewerk"}">
          ${isEdit
            ? `<svg class="icon settlement-detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
            : `<svg class="icon settlement-detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L3.8 17.5z"></path><path d="M14 5l5 5"></path></svg>`}
        </button>
      </div>
    </div>
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
  $('#btnOpenSettlementCustomer')?.addEventListener('click', ()=>{
    if (!s.customerId) return;
    if (ui.navStack.some(v => v.view === 'customerDetail' && v.id === s.customerId)) return;
    pushView({ view: 'customerDetail', id: s.customerId });
  });
  $('#btnSettlementEdit')?.addEventListener('click', ()=>{
    toggleEditSettlement(s.id);
    renderSheet();
  });
  $('#btnSettlementManualOverride')?.addEventListener('click', ()=>{
    actions.toggleSettlementManualOverride(s.id);
    renderSheet();
  });

  $('#sheetBody').querySelectorAll('[data-settle-manual-step]').forEach(btn=>{
    const raw = String(btn.getAttribute('data-settle-manual-step') || '');
    const [key, directionRaw] = raw.split('|');
    const direction = Number(directionRaw || 0);
    if (!key || !Number.isFinite(direction) || direction === 0) return;
    btn.addEventListener('click', ()=>{
      actions.bumpSettlementManualValue(s.id, key, direction);
      renderSheetKeepScroll();
    });
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
      ui.settlementDateDraft[s.id] = v;
    });
    $('#btnCommitSettlementDate')?.addEventListener('click', ()=>{
      const v = ui.settlementDateDraft[s.id] || String($('#settlementDateOverride').value || "").trim();
      if (!v) return;
      actions.editSettlement(s.id, (draft)=>{
        draft.dateOverride = v;
        draft.date = v;
        if (!draft.invoiceLocked) draft.invoiceDate = v;
      });
      delete ui.settlementDateDraft[s.id];
      renderSheet();
    });
    $('#btnResetSettlementDate')?.addEventListener('click', ()=>{
      delete ui.settlementDateDraft[s.id];
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
