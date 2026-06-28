(() => {
"use strict";
const DATA_URL = "vaccindata_v2.json";
const DEBOUNCE_MS = 250;
const URL_WHITELIST = /^https?:\/\/[^\s]+$/i;
const ICONS = Object.freeze({
Media: "🚨", Studie: "📊", Dokument: "📑", Fil: "🧾", Hemsida: "🏚️", Video: "🎬", 
Dödsfall: "⚰️", Läkemedel: "💊", Ivermektin: "🥇", Kontakt: "📨", ZIP: "🗳️"
});
const MAX_RETRY = 5;
const RETRY_BASE_MS = 500;
const tableBody = document.querySelector("#sortable tbody");
const noResultsRow = document.getElementById("noResults");
const pageInfo = document.getElementById("pageInfo");
const nextBtn = document.getElementById("nextPage");
const rowsSelect = document.getElementById("rowsPerPage");
const searchInput = document.getElementById("tableSearch");
const spinner = document.getElementById("loading") || (() => {
const el = document.createElement("div");
el.id = "loading";
el.setAttribute("role", "status");
el.setAttribute("aria-live", "polite");
el.style.cssText = "text-align: center; padding: 20px;";
document.body.appendChild(el);
return el;
})();
let allData = [];
let filteredData = [];
let rowsPerPage = 100;
let loadedChunks = 0;
let isSearching = false;
let globalAbortCtrl = null;
const debounce = (fn, delay) => {
let timer;
return function(...args) {
clearTimeout(timer);
timer = setTimeout(() => fn.apply(this, args), delay);
};
};
const toggleSpinner = (show) => { spinner.style.display = show ? "block" : "none"; };
const createCell = (content, className = "") => {
const td = document.createElement("td");
if (className) td.className = className;
if (content instanceof Node) td.appendChild(content);
else td.textContent = content ?? "";
return td;
};
const buildRow = ({ typ = "N/A", rubrik = "N/A", url = "" }) => {
const tr = document.createElement("tr");
const typSpan = document.createElement("span");
typSpan.className = "typ-ikon";
typSpan.textContent = `${ICONS[typ] || ""} ${typ}`;
tr.appendChild(createCell(typSpan));
const title = document.createElement("strong");
title.textContent = rubrik;
tr.appendChild(createCell(title));
const link = document.createElement("a");
link.className = "row-btn";
link.target = "_blank";
link.rel = "noopener noreferrer nofollow";    
if (URL_WHITELIST.test(url)) {
link.href = encodeURI(url);
} else {
link.href = "#";
link.style.opacity = "0.5";
link.style.pointerEvents = "none";
}
link.textContent = typ;
tr.appendChild(createCell(link));
return tr;
};
const renderNextChunk = () => {
const start = loadedChunks * rowsPerPage;
const slice = filteredData.slice(start, start + rowsPerPage);
const frag = document.createDocumentFragment();
slice.forEach(item => frag.appendChild(buildRow(item)));
tableBody.insertBefore(frag, noResultsRow);
loadedChunks++;
updatePaginationUI();
};
const clearTable = () => {
tableBody.querySelectorAll("tr:not(#noResults)").forEach(r => r.remove());
loadedChunks = 0;
};
const updatePaginationUI = () => {
const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
pageInfo.textContent = `Sida ${loadedChunks} av ${totalPages}`;    
const disable = isSearching || filteredData.length === 0 || loadedChunks >= totalPages;
if (nextBtn) nextBtn.disabled = disable;
if (noResultsRow) {
noResultsRow.style.display = filteredData.length === 0 ? "" : "none";
}};
const sentinelObserver = new IntersectionObserver((entries) => {
if (entries[0].isIntersecting && !isSearching) {
const totalPages = Math.ceil(filteredData.length / rowsPerPage);
if (loadedChunks < totalPages) renderNextChunk();
}}, { rootMargin: "300px" });
const sentinel = document.createElement("div");
sentinel.id = "sentinel";
tableBody.parentNode.appendChild(sentinel);
sentinelObserver.observe(sentinel);
const DB_NAME = "covid19-db";
const STORE_NAME = "dataMapp";
const dbPromise = new Promise((res, rej) => {
const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
req.onsuccess = () => res(req.result);
req.onerror = () => rej(req.error);
});
const idbOperation = async (mode, cb) => {
const db = await dbPromise;
const tx = db.transaction(STORE_NAME, mode);
const store = tx.objectStore(STORE_NAME);
return new Promise((res, rej) => {
const req = cb(store);
req.onsuccess = () => res(req.result);
req.onerror = () => rej(req.error);
});
};
const idbGet = (key) => idbOperation("readonly", store => store.get(key));
const idbSet = (key, val) => idbOperation("readwrite", store => store.put(val, key));
const fetchWithRetry = async (url, signal, attempts = MAX_RETRY, delay = RETRY_BASE_MS) => {
try {
const resp = await fetch(url, { signal, cache: "no-store" });
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
return await resp.json();
} catch (err) {
if (err.name === "AbortError" || attempts <= 1) throw err;
await new Promise(r => setTimeout(r, delay));
return fetchWithRetry(url, signal, attempts - 1, delay * 2);
}};
const loadData = async () => {
toggleSpinner(true);
globalAbortCtrl?.abort();
globalAbortCtrl = new AbortController();
try {
const cached = await idbGet("dataset");
if (cached) {
allData = cached;
} else {
const json = await fetchWithRetry(DATA_URL, globalAbortCtrl.signal);
allData = json;
await idbSet("dataset", json);
}
filteredData = [...allData];
clearTable();
renderNextChunk();
} catch (e) {
if (e.name !== "AbortError") {
console.error("Datafel:", e);
clearTable();
const errRow = document.createElement("tr");
errRow.appendChild(createCell("Information saknas eller kunde inte laddas.", "error-msg"));
tableBody.insertBefore(errRow, noResultsRow);
}} finally {
toggleSpinner(false);
}};
document.querySelectorAll("#sortable th[data-column]").forEach(th => {
th.addEventListener("click", () => {
const colIdx = Number(th.dataset.column);
const isAsc = th.dataset.dir === "asc";
const dirMul = isAsc ? -1 : 1;
const keys = ["typ", "rubrik"];
const sortKey = keys[colIdx];
filteredData.sort((a, b) => {
const aVal = String(a[sortKey] ?? "");
const bVal = String(b[sortKey] ?? "");
return aVal.localeCompare(bVal, navigator.language, { numeric: true }) * dirMul;
});
th.dataset.dir = isAsc ? "desc" : "asc";
clearTable();
renderNextChunk();
});
});
const applySearch = debounce(() => {
const term = (searchInput?.value ?? "").trim().toLowerCase();
isSearching = term.length > 0;
filteredData = isSearching 
? allData.filter(({ typ = "", rubrik = "" }) => 
typ.toLowerCase().includes(term) || rubrik.toLowerCase().includes(term)
)
: [...allData];
clearTable();
renderNextChunk();
}, DEBOUNCE_MS);
searchInput?.addEventListener("input", applySearch)
rowsSelect?.addEventListener("change", debounce(() => {
const val = Number(rowsSelect.value);
if (!Number.isNaN(val) && val > 0) rowsPerPage = val;
clearTable();
renderNextChunk();
}, DEBOUNCE_MS));
nextBtn?.addEventListener("click", () => {
if (loadedChunks < Math.ceil(filteredData.length / rowsPerPage)) {
renderNextChunk();
}});
if ("serviceWorker" in navigator) {
window.addEventListener("load", () => {
navigator.serviceWorker.register("sw.js").catch(Object.freeze);
});
}
window.addEventListener("load", () => {
if (history.state?.scrollPos) {
window.scrollTo(0, history.state.scrollPos);
}});
loadData();
})();