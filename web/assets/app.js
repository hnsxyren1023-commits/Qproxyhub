const els = {
  healthBadge: document.getElementById("healthBadge"),
  linksInput: document.getElementById("linksInput"),
  timeoutSelect: document.getElementById("timeoutSelect"),
  concurrencySelect: document.getElementById("concurrencySelect"),
  runButton: document.getElementById("runButton"),
  cancelButton: document.getElementById("cancelButton"),
  clearButton: document.getElementById("clearButton"),
  jobStatus: document.getElementById("jobStatus"),
  phaseText: document.getElementById("phaseText"),
  progressText: document.getElementById("progressText"),
  progressPercent: document.getElementById("progressPercent"),
  progressBar: document.getElementById("progressBar"),
  currentNode: document.getElementById("currentNode"),
  csvPath: document.getElementById("csvPath"),
  totalCount: document.getElementById("totalCount"),
  passCount: document.getElementById("passCount"),
  failCount: document.getElementById("failCount"),
  invalidCount: document.getElementById("invalidCount"),
  runningCount: document.getElementById("runningCount"),
  queuedCount: document.getElementById("queuedCount"),
  invalidList: document.getElementById("invalidList"),
  filterInput: document.getElementById("filterInput"),
  resultsBody: document.getElementById("resultsBody"),
  selectVisibleButton: document.getElementById("selectVisibleButton"),
  clearSelectionButton: document.getElementById("clearSelectionButton"),
  copyLinksButton: document.getElementById("copyLinksButton"),
  copyRowsButton: document.getElementById("copyRowsButton"),
  selectAllCheckbox: document.getElementById("selectAllCheckbox"),
  exportSourceType: document.getElementById("exportSourceType"),
  exportScope: document.getElementById("exportScope"),
  exportFormat: document.getElementById("exportFormat"),
  exportClient: document.getElementById("exportClient"),
  exportButton: document.getElementById("exportButton"),
  retryFailedButton: document.getElementById("retryFailedButton"),
  retryAllButton: document.getElementById("retryAllButton"),
  exportResult: document.getElementById("exportResult"),
  refreshHistoryButton: document.getElementById("refreshHistoryButton"),
  historyList: document.getElementById("historyList"),
};

const state = {
  jobId: null,
  pollTimer: null,
  snapshot: null,
  sortKey: "status",
  sortDir: "asc",
  selected: new Set(),
  filterText: "",
  historyItems: [],
  activeSourceType: "job",
  activeSourceId: "",
};
const DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
const VIEW_TARGET = new URLSearchParams(window.location.search).get("view") || "";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusLabel(status) {
  switch (status) {
    case "queued": return "Queued";
    case "booting": return "Booting";
    case "running": return "Running";
    case "finished": return "Finished";
    case "cancelled": return "Cancelled";
    case "error": return "Error";
    case "passed": return "Passed";
    case "failed": return "Failed";
    default: return status || "Idle";
  }
}

function statusClass(status) {
  if (["finished", "passed"].includes(status)) return "pass";
  if (["error", "cancelled", "failed"].includes(status)) return "fail";
  if (["running", "booting", "queued"].includes(status)) return "pending";
  return "idle";
}

function setHealth(ok, text) {
  els.healthBadge.textContent = text;
  els.healthBadge.className = `badge ${ok ? "pass" : "fail"}`;
}

function setJobStatus(status) {
  els.jobStatus.textContent = statusLabel(status);
  els.jobStatus.className = `status-tag ${statusClass(status)}`;
}

function setPhase(text) {
  els.phaseText.textContent = text;
}

function setExportResult(text, tone = "idle") {
  els.exportResult.textContent = text;
  els.exportResult.className = `export-result ${tone}`;
}

function getActiveSourceId() {
  if (els.exportSourceType.value === "job") return state.jobId || "";
  return state.activeSourceType === "history" ? state.activeSourceId : "";
}

function updateExportAvailability() {
  const sourceType = els.exportSourceType.value;
  const hasJob = Boolean(state.jobId);
  const hasHistory = state.activeSourceType === "history" && Boolean(state.activeSourceId);
  const canUse = sourceType === "job" ? hasJob : hasHistory;
  const hasFailures = (state.snapshot?.summary?.failed ?? 0) > 0;
  const hasEntries = (state.snapshot?.summary?.total ?? 0) > 0;
  const hasSelection = state.selected.size > 0;
  const selectedScope = els.exportScope.value === "selected";
  const isClient = els.exportFormat.value === "client";

  els.exportClient.disabled = !isClient;
  els.exportButton.disabled = !canUse || (selectedScope && !hasSelection);
  els.retryFailedButton.disabled = !canUse || !hasFailures;
  els.retryAllButton.disabled = !canUse || !hasEntries;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Service unavailable");
    setHealth(true, "Local service connected");
  } catch {
    setHealth(false, "Service offline");
  }
}

function updateSummary(summary = {}) {
  els.totalCount.textContent = summary.total ?? 0;
  els.passCount.textContent = summary.passed ?? 0;
  els.failCount.textContent = summary.failed ?? 0;
  els.invalidCount.textContent = summary.invalid ?? 0;
  els.runningCount.textContent = summary.running ?? 0;
  els.queuedCount.textContent = summary.queued ?? 0;
}

function renderInvalid(items = []) {
  if (!items.length) {
    els.invalidList.className = "invalid-list empty";
    els.invalidList.textContent = "No invalid inputs";
    return;
  }
  els.invalidList.className = "invalid-list";
  els.invalidList.innerHTML = items.map((item) => `
    <div class="invalid-item">
      <div class="mono">${escapeHtml(item.link)}</div>
      <div>${escapeHtml(item.reason)}</div>
    </div>
  `).join("");
}

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true, sensitivity: "base" });
}

function getFilteredSortedEntries() {
  const entries = state.snapshot?.entries ?? [];
  const filter = state.filterText.trim().toLowerCase();
  const filtered = filter
    ? entries.filter((entry) => [
        entry.status,
        entry.protocol,
        entry.country,
        entry.host,
        entry.port,
        entry.username,
        entry.password,
        entry.detail,
        entry.name,
      ].join(" ").toLowerCase().includes(filter))
    : entries.slice();

  filtered.sort((left, right) => {
    const key = state.sortKey;
    const leftValue = key === "delayMs" ? Number(left.delayMs || -1) : (left[key] ?? "");
    const rightValue = key === "delayMs" ? Number(right.delayMs || -1) : (right[key] ?? "");
    const result = compareValues(leftValue, rightValue);
    return state.sortDir === "asc" ? result : -result;
  });
  return filtered;
}

function renderResults() {
  const entries = getFilteredSortedEntries();
  if (!entries.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="10" class="empty">No results yet</td></tr>';
    els.selectAllCheckbox.checked = false;
    return;
  }

  els.resultsBody.innerHTML = entries.map((entry) => {
    const selected = state.selected.has(entry.name);
    const rowClass = entry.status === "passed" ? "pass-row" : entry.status === "failed" ? "fail-row" : "";
    const pillClass = entry.status === "passed" ? "pass" : entry.status === "failed" ? "fail" : "pending";
    return `
      <tr class="${rowClass}">
        <td class="checkbox-col">
          <input type="checkbox" class="row-checkbox" data-name="${escapeHtml(entry.name)}" ${selected ? "checked" : ""}>
        </td>
        <td><span class="status-pill ${pillClass}">${escapeHtml(statusLabel(entry.status))}</span></td>
        <td>${escapeHtml(entry.protocol)}</td>
        <td>${escapeHtml(entry.country)}</td>
        <td class="mono">${escapeHtml(entry.host)}</td>
        <td>${escapeHtml(entry.port)}</td>
        <td class="mono">${escapeHtml(entry.username)}</td>
        <td class="mono">${escapeHtml(entry.password)}</td>
        <td>${entry.delayMs ? `${escapeHtml(entry.delayMs)} ms` : "-"}</td>
        <td>${escapeHtml(entry.detail)}</td>
      </tr>
    `;
  }).join("");

  els.selectAllCheckbox.checked = entries.length > 0 && entries.every((entry) => state.selected.has(entry.name));
}

function renderProgress(snapshot) {
  const summary = snapshot?.summary ?? { total: 0, done: 0 };
  const total = summary.total ?? 0;
  const done = summary.done ?? 0;
  const percent = snapshot?.progressPercent ?? 0;
  els.progressText.textContent = `${done} / ${total}`;
  els.progressPercent.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
  els.currentNode.textContent = snapshot?.currentName || "-";
  els.csvPath.textContent = snapshot?.csvPath || "Not generated yet";
  setJobStatus(snapshot?.status || "idle");
  updateSummary(summary);
}

function applySnapshot(snapshot, sourceType = state.activeSourceType, sourceId = state.activeSourceId) {
  state.snapshot = snapshot;
  state.activeSourceType = sourceType;
  state.activeSourceId = sourceId;
  renderProgress(snapshot);
  renderInvalid(snapshot?.invalid ?? []);
  renderResults();
  if (snapshot?.error) {
    setPhase(`Error: ${snapshot.error}`);
  } else {
    const summary = snapshot?.summary ?? {};
    setPhase(`${statusLabel(snapshot?.status)} | passed ${summary.passed ?? 0}, failed ${summary.failed ?? 0}, invalid ${summary.invalid ?? 0}`);
  }
  updateExportAvailability();
}

function buildDemoSnapshot() {
  const now = new Date().toISOString();
  return {
    id: "demo-job-20260424",
    status: "finished",
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    currentName: "",
    csvPath: "D:\\Xcode\\20260423_Qproxyhub\\exports\\proxy-test-demo.csv",
    progressPercent: 100,
    summary: {
      total: 13,
      done: 13,
      passed: 4,
      failed: 8,
      invalid: 1,
      running: 0,
      queued: 0,
    },
    invalid: [
      { link: "socks5://c", reason: "Unsupported or invalid link format" },
    ],
    entries: [
      {
        name: "proxy-001-change5-07354899",
        protocol: "socks5",
        country: "United States",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "pMS9gypY6u10_custom_zone_US_st__city_sid_07354899_time_5",
        password: "2140704",
        delayMs: 4825,
        detail: "delay=4825ms",
        status: "passed",
        link: "socks5://change5.owlproxy.com:7778:pMS9gypY6u10_custom_zone_US_st__city_sid_07354899_time_5:2140704",
      },
      {
        name: "proxy-002-change5-58213518",
        protocol: "socks5",
        country: "Hong Kong",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "xgVtiMLm8580_custom_zone_HK_st__city_sid_58213518_time_5",
        password: "2148962",
        delayMs: 3780,
        detail: "delay=3780ms",
        status: "passed",
        link: "socks5://change5.owlproxy.com:7778:xgVtiMLm8580_custom_zone_HK_st__city_sid_58213518_time_5:2148962",
      },
      {
        name: "proxy-003-change5-13432077",
        protocol: "socks5",
        country: "Hong Kong",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "ns7qPiaYTO20_custom_zone_HK_st__city_sid_13432077_time_5",
        password: "2148982",
        delayMs: 3777,
        detail: "delay=3777ms",
        status: "passed",
        link: "socks5://change5.owlproxy.com:7778:ns7qPiaYTO20_custom_zone_HK_st__city_sid_13432077_time_5:2148982",
      },
      {
        name: "proxy-004-change5-http-11121667",
        protocol: "http",
        country: "United States",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "PwMC3U3SvqA0_custom_zone_US_st__city_sid_11121667_time_5",
        password: "2165269",
        delayMs: 4298,
        detail: "delay=4298ms",
        status: "passed",
        link: "http://change5.owlproxy.com:7778:PwMC3U3SvqA0_custom_zone_US_st__city_sid_11121667_time_5:2165269",
      },
      {
        name: "proxy-005-change4-51953642",
        protocol: "socks5",
        country: "United States",
        host: "change4.owlproxy.com",
        port: 7778,
        username: "lWLvuYLt6l50_custom_zone_US_st__city_sid_51953642_time_15",
        password: "1865166",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change4.owlproxy.com:7778:lWLvuYLt6l50_custom_zone_US_st__city_sid_51953642_time_15:1865166",
      },
      {
        name: "proxy-006-change4-43758005",
        protocol: "socks5",
        country: "United States",
        host: "change4.owlproxy.com",
        port: 7778,
        username: "lWLvuYLt6l50_custom_zone_US_st__city_sid_43758005_time_15",
        password: "1865166",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change4.owlproxy.com:7778:lWLvuYLt6l50_custom_zone_US_st__city_sid_43758005_time_15:1865166",
      },
      {
        name: "proxy-007-change4-66830152",
        protocol: "socks5",
        country: "United States",
        host: "change4.owlproxy.com",
        port: 7778,
        username: "lWLvuYLt6l50_custom_zone_US_st__city_sid_66830152_time_15",
        password: "1865166",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change4.owlproxy.com:7778:lWLvuYLt6l50_custom_zone_US_st__city_sid_66830152_time_15:1865166",
      },
      {
        name: "proxy-008-change5-98615975",
        protocol: "socks5",
        country: "United States",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "BIcAM5C7bpA0_custom_zone_US_st__city_sid_98615975_time_15",
        password: "2009301",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change5.owlproxy.com:7778:BIcAM5C7bpA0_custom_zone_US_st__city_sid_98615975_time_15:2009301",
      },
      {
        name: "proxy-009-change5-94623274",
        protocol: "socks5",
        country: "United States",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "BIcAM5C7bpA0_custom_zone_US_st__city_sid_94623274_time_15",
        password: "2009301",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change5.owlproxy.com:7778:BIcAM5C7bpA0_custom_zone_US_st__city_sid_94623274_time_15:2009301",
      },
      {
        name: "proxy-010-change5-87736538",
        protocol: "socks5",
        country: "United States",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "BIcAM5C7bpA0_custom_zone_US_st__city_sid_87736538_time_15",
        password: "2009301",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change5.owlproxy.com:7778:BIcAM5C7bpA0_custom_zone_US_st__city_sid_87736538_time_15:2009301",
      },
      {
        name: "proxy-011-change4-24368457",
        protocol: "socks5",
        country: "United States",
        host: "change4.owlproxy.com",
        port: 7778,
        username: "qWARuxHwV150_custom_zone_US_st__city_sid_24368457_time_15",
        password: "2013081",
        delayMs: "",
        detail: "{\"message\":\"An error occurred in the delay test\"}",
        status: "failed",
        link: "socks5://change4.owlproxy.com:7778:qWARuxHwV150_custom_zone_US_st__city_sid_24368457_time_15:2013081",
      },
      {
        name: "proxy-012-change4-88912940",
        protocol: "socks5",
        country: "United States",
        host: "change4.owlproxy.com",
        port: 7778,
        username: "qWARuxHwV150_custom_zone_US_st__city_sid_88912940_time_15",
        password: "2013081",
        delayMs: "",
        detail: "{\"message\":\"An error occurred in the delay test\"}",
        status: "failed",
        link: "socks5://change4.owlproxy.com:7778:qWARuxHwV150_custom_zone_US_st__city_sid_88912940_time_15:2013081",
      },
      {
        name: "proxy-013-change5-83568659",
        protocol: "socks5",
        country: "Japan",
        host: "change5.owlproxy.com",
        port: 7778,
        username: "xdXvxwDpDo80_custom_zone_JP_st__city_sid_83568659_time_5",
        password: "2148943",
        delayMs: "",
        detail: "{\"message\":\"Timeout\"}",
        status: "failed",
        link: "socks5://change5.owlproxy.com:7778:xdXvxwDpDo80_custom_zone_JP_st__city_sid_83568659_time_5:2148943",
      },
    ],
  };
}

function applyDemoMode() {
  state.jobId = "demo-job-20260424";
  state.selected.clear();
  els.linksInput.value = [
    "socks5://change5.owlproxy.com:7778:xdXvxwDpDo80_custom_zone_JP_st__city_sid_83568659_time_5:2148943",
    "socks5://change5.owlproxy.com:7778:xgVtiMLm8580_custom_zone_HK_st__city_sid_58213518_time_5:2148962",
    "socks5://change5.owlproxy.com:7778:ns7qPiaYTO20_custom_zone_HK_st__city_sid_13432077_time_5:2148982",
    "http://change5.owlproxy.com:7778:PwMC3U3SvqA0_custom_zone_US_st__city_sid_11121667_time_5:2165269",
    "socks5://c",
  ].join("\n");
  const snapshot = buildDemoSnapshot();
  applySnapshot(snapshot, "job", state.jobId);
  state.historyItems = [
    {
      id: "demo-job-20260424",
      status: "finished",
      createdAt: "2026-04-24T07:32:47.000Z",
      summary: snapshot.summary,
      csvPath: snapshot.csvPath,
    },
    {
      id: "demo-job-20260424-r2",
      status: "finished",
      createdAt: "2026-04-24T07:28:28.000Z",
      summary: { total: 1, passed: 0, failed: 1 },
      csvPath: "D:\\Xcode\\20260423_Qproxyhub\\exports\\proxy-test-demo-r2.csv",
    },
  ];
  state.activeSourceType = "job";
  state.activeSourceId = state.jobId;
  renderHistory();
  setPhase("Finished | passed 4, failed 8, invalid 1");
  setExportResult("Ready for export", "pass");
  els.healthBadge.textContent = "Local service connected";
  els.healthBadge.className = "badge pass";
  els.runButton.disabled = true;
  els.cancelButton.disabled = true;
  updateExportAvailability();
}

function applyViewTarget() {
  const target = VIEW_TARGET.trim();
  if (!target) return;
  const main = document.querySelector(".app-shell");
  if (main && ["overview", "results", "export-history"].includes(target)) {
    main.querySelectorAll(":scope > section").forEach((section) => {
      if (section.id === target) {
        section.style.display = "";
      } else {
        section.style.display = "none";
      }
    });
    document.body.style.padding = "16px";
  }
  const anchor = document.getElementById(target);
  if (!anchor) return;
  setTimeout(() => {
    anchor.scrollIntoView({ behavior: "instant", block: "start" });
  }, 120);
}

function stopPolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

async function pollJob() {
  if (!state.jobId) return;
  try {
    const res = await fetch(`/api/jobs/${state.jobId}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Cannot read job status");
    applySnapshot(data.snapshot, "job", state.jobId);
    renderHistory();
    const doneStatuses = ["finished", "cancelled", "error"];
    if (!doneStatuses.includes(data.snapshot.status)) {
      state.pollTimer = setTimeout(pollJob, 700);
    } else {
      els.runButton.disabled = false;
      els.cancelButton.disabled = true;
      await loadHistory();
    }
  } catch (error) {
    setPhase(`Polling failed: ${error.message}`);
    els.runButton.disabled = false;
    els.cancelButton.disabled = true;
  }
}

async function startJob() {
  const links = els.linksInput.value.trim();
  if (!links) {
    alert("Paste at least one proxy link first.");
    return;
  }
  stopPolling();
  state.selected.clear();
  els.runButton.disabled = true;
  els.cancelButton.disabled = false;
  setExportResult("Testing in progress...", "pending");

  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      links,
      timeoutMs: Number(els.timeoutSelect.value),
      concurrency: Number(els.concurrencySelect.value),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Cannot create job");
  }
  state.jobId = data.jobId;
  els.exportSourceType.value = "job";
  applySnapshot(data.snapshot, "job", data.jobId);
  state.pollTimer = setTimeout(pollJob, 500);
}

async function cancelJob() {
  if (!state.jobId) return;
  await fetch(`/api/jobs/${state.jobId}/cancel`, { method: "POST" });
}

function getSelectedEntries() {
  const entries = state.snapshot?.entries ?? [];
  return entries.filter((entry) => state.selected.has(entry.name));
}

async function copyText(text, successText) {
  if (!text) {
    alert("Nothing to copy.");
    return;
  }
  await navigator.clipboard.writeText(text);
  setPhase(successText);
}

function bindTableInteractions() {
  document.querySelectorAll("th[data-sort-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const nextKey = th.dataset.sortKey;
      if (state.sortKey === nextKey) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = nextKey;
        state.sortDir = "asc";
      }
      renderResults();
    });
  });
}

function renderHistory() {
  if (!state.historyItems.length) {
    els.historyList.className = "history-list empty";
    els.historyList.textContent = "No history yet";
    return;
  }

  els.historyList.className = "history-list";
  els.historyList.innerHTML = state.historyItems.map((item) => {
    const active = state.activeSourceType === "history" && state.activeSourceId === item.id;
    const summary = item.summary || {};
    return `
      <button class="history-item ${active ? "active" : ""}" data-id="${escapeHtml(item.id)}" type="button">
        <div class="history-item-head">
          <strong>${escapeHtml(statusLabel(item.status))}</strong>
          <span>${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
        </div>
        <div class="history-item-meta">
          <span>Total ${escapeHtml(summary.total ?? 0)}</span>
          <span>Pass ${escapeHtml(summary.passed ?? 0)}</span>
          <span>Fail ${escapeHtml(summary.failed ?? 0)}</span>
        </div>
        <div class="history-item-path mono">${escapeHtml(item.csvPath || "")}</div>
      </button>
    `;
  }).join("");
}

async function loadHistory(autoSelect = false) {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Cannot load history");
    state.historyItems = data.items || [];
    renderHistory();

    if (autoSelect && state.historyItems.length && !state.activeSourceId) {
      await loadHistorySnapshot(state.historyItems[0].id);
    }
  } catch (error) {
    setExportResult(`History load failed: ${error.message}`, "fail");
  }
}

async function loadHistorySnapshot(historyId) {
  const res = await fetch(`/api/history/${historyId}`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Cannot load history snapshot");
  }
  state.selected.clear();
  els.exportSourceType.value = "history";
  applySnapshot(data.snapshot, "history", historyId);
  renderHistory();
  setExportResult(`Loaded history snapshot ${historyId}`, "idle");
}

async function exportCurrent() {
  const sourceType = els.exportSourceType.value;
  const sourceId = getActiveSourceId();
  const scope = els.exportScope.value;
  if (!sourceId) {
    throw new Error("No active source is available for export.");
  }

  setExportResult("Exporting...", "pending");
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceType,
      sourceId,
      scope,
      selectedNames: Array.from(state.selected),
      format: els.exportFormat.value,
      client: els.exportClient.value,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Export failed");
  }
  setExportResult(`Export created: ${data.outputPath}`, "pass");
}

async function retryScope(scope) {
  const sourceType = els.exportSourceType.value;
  const sourceId = getActiveSourceId();
  if (!sourceId) {
    throw new Error("No active source is available for retry.");
  }

  stopPolling();
  state.selected.clear();
  els.runButton.disabled = true;
  els.cancelButton.disabled = false;
  setExportResult(`Retry started for ${scope} items...`, "pending");

  const res = await fetch("/api/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceType,
      sourceId,
      scope,
      timeoutMs: Number(els.timeoutSelect.value),
      concurrency: Number(els.concurrencySelect.value),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Retry failed");
  }
  state.jobId = data.jobId;
  els.exportSourceType.value = "job";
  applySnapshot(data.snapshot, "job", data.jobId);
  state.pollTimer = setTimeout(pollJob, 500);
}

els.runButton.addEventListener("click", async () => {
  try {
    await startJob();
  } catch (error) {
    els.runButton.disabled = false;
    els.cancelButton.disabled = true;
    setPhase(`Create job failed: ${error.message}`);
  }
});

els.cancelButton.addEventListener("click", async () => {
  els.cancelButton.disabled = true;
  setPhase("Sending cancel request...");
  try {
    await cancelJob();
  } catch (error) {
    setPhase(`Cancel failed: ${error.message}`);
  }
});

els.clearButton.addEventListener("click", () => {
  els.linksInput.value = "";
  state.selected.clear();
  state.snapshot = null;
  state.jobId = null;
  state.activeSourceType = "job";
  state.activeSourceId = "";
  stopPolling();
  renderInvalid([]);
  renderProgress({ status: "idle", summary: { total: 0, done: 0, passed: 0, failed: 0, invalid: 0, running: 0, queued: 0 }, progressPercent: 0, currentName: "", csvPath: "" });
  els.resultsBody.innerHTML = '<tr><td colspan="10" class="empty">No results yet</td></tr>';
  els.runButton.disabled = false;
  els.cancelButton.disabled = true;
  setPhase("Waiting to start");
  setExportResult("Export result will appear here", "idle");
  renderHistory();
  updateExportAvailability();
});

els.filterInput.addEventListener("input", (event) => {
  state.filterText = event.target.value;
  renderResults();
});

els.selectVisibleButton.addEventListener("click", () => {
  getFilteredSortedEntries().forEach((entry) => state.selected.add(entry.name));
  renderResults();
  updateExportAvailability();
});

els.clearSelectionButton.addEventListener("click", () => {
  state.selected.clear();
  renderResults();
  updateExportAvailability();
});

els.copyLinksButton.addEventListener("click", async () => {
  const text = getSelectedEntries().map((entry) => entry.link).join("\n");
  await copyText(text, "Selected links copied");
});

els.copyRowsButton.addEventListener("click", async () => {
  const rows = getSelectedEntries();
  const text = [
    ["status", "protocol", "country", "host", "port", "username", "password", "delayMs", "detail", "link"].join("\t"),
    ...rows.map((entry) => [
      entry.status,
      entry.protocol,
      entry.country,
      entry.host,
      entry.port,
      entry.username,
      entry.password,
      entry.delayMs,
      entry.detail,
      entry.link,
    ].join("\t")),
  ].join("\n");
  await copyText(text, "Selected rows copied");
});

els.selectAllCheckbox.addEventListener("change", (event) => {
  const visible = getFilteredSortedEntries();
  if (event.target.checked) {
    visible.forEach((entry) => state.selected.add(entry.name));
  } else {
    visible.forEach((entry) => state.selected.delete(entry.name));
  }
  renderResults();
  updateExportAvailability();
});

els.resultsBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("row-checkbox")) return;
  const { name } = event.target.dataset;
  if (event.target.checked) state.selected.add(name);
  else state.selected.delete(name);
  renderResults();
  updateExportAvailability();
});

els.exportSourceType.addEventListener("change", () => {
  updateExportAvailability();
});

els.exportScope.addEventListener("change", () => {
  updateExportAvailability();
});

els.exportFormat.addEventListener("change", () => {
  updateExportAvailability();
});

els.exportButton.addEventListener("click", async () => {
  try {
    await exportCurrent();
  } catch (error) {
    setExportResult(`Export failed: ${error.message}`, "fail");
  }
});

els.retryFailedButton.addEventListener("click", async () => {
  try {
    await retryScope("failed");
  } catch (error) {
    setExportResult(`Retry failed: ${error.message}`, "fail");
  }
});

els.retryAllButton.addEventListener("click", async () => {
  try {
    await retryScope("all");
  } catch (error) {
    setExportResult(`Retry failed: ${error.message}`, "fail");
  }
});

els.refreshHistoryButton.addEventListener("click", async () => {
  await loadHistory();
});

els.historyList.addEventListener("click", async (event) => {
  const item = event.target.closest(".history-item");
  if (!item) return;
  try {
    await loadHistorySnapshot(item.dataset.id);
  } catch (error) {
    setExportResult(`History open failed: ${error.message}`, "fail");
  }
});

renderProgress({ status: "idle", summary: { total: 0, done: 0, passed: 0, failed: 0, invalid: 0, running: 0, queued: 0 }, progressPercent: 0, currentName: "", csvPath: "" });
renderInvalid([]);
renderResults();
setPhase("Waiting to start");
setExportResult("Export result will appear here", "idle");
bindTableInteractions();
if (DEMO_MODE) {
  applyDemoMode();
} else {
  checkHealth();
  loadHistory();
  updateExportAvailability();
}
applyViewTarget();
