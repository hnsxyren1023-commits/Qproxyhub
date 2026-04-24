import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.join(__dirname, "web");
const exportDir = path.join(__dirname, "exports");
const tempDir = path.join(__dirname, "temp");
const historyPath = path.join(exportDir, "history.json");
const port = 8866;
const mihomoExe = "C:\\Program Files\\mihomo-windows-amd64-v1.19.24\\mihomo-windows-amd64.exe";
const probeUrl = "https://www.gstatic.com/generate_204";
const jobs = new Map();

if (!existsSync(mihomoExe)) {
  throw new Error(`Cannot find mihomo executable at ${mihomoExe}`);
}

await mkdir(exportDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

let historyStore = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const countryMatchers = [
  [/(\bUS\b|\bUSA\b|UNITED STATES)/i, "United States"],
  [/(\bJP\b|JAPAN)/i, "Japan"],
  [/(\bHK\b|HONG KONG|HONGKONG)/i, "Hong Kong"],
  [/(\bGB\b|\bUK\b|UNITED KINGDOM)/i, "United Kingdom"],
  [/(\bDE\b|GERMANY)/i, "Germany"],
  [/(\bCR\b|COSTA RICA)/i, "Costa Rica"],
  [/(\bCA\b|CANADA)/i, "Canada"],
  [/(\bFR\b|FRANCE)/i, "France"],
  [/(\bSG\b|SINGAPORE)/i, "Singapore"],
  [/(\bMY\b|MALAYSIA)/i, "Malaysia"],
  [/(\bRU\b|RUSSIA)/i, "Russia"],
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function loadHistory() {
  try {
    const raw = await readFile(historyPath, "utf8");
    historyStore = JSON.parse(raw);
  } catch {
    historyStore = [];
  }
}

async function saveHistory() {
  await writeFile(historyPath, JSON.stringify(historyStore, null, 2), "utf8");
}

function decodeFragment(fragment = "") {
  return decodeURIComponent(fragment.replace(/^#/, "")).replace(/\r|\n/g, "");
}

function resolveCountry(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const [regex, value] of countryMatchers) {
      if (regex.test(candidate)) return value;
    }
  }
  return "Unknown";
}

function makeEntry({ protocol, sourceKind, originalLink, name, country, host, port, username, password, query = {}, extra = {} }) {
  return {
    protocol,
    sourceKind,
    originalLink,
    name,
    country,
    host,
    port,
    username,
    password,
    query,
    extra,
    validationStatus: "queued",
    validationDetail: "Waiting",
    validationDelayMs: "",
    startedAt: "",
    finishedAt: "",
  };
}

function parseLinks(rawInput) {
  const lines = rawInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries = [];
  const invalid = [];
  let index = 1;

  for (const line of lines) {
    const directMatch = line.match(/^(socks5|http):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
    if (directMatch) {
      const [, protocol, host, rawPort, username, password] = directMatch;
      const zoneMatch = username.match(/_zone_([A-Z]{2})_/);
      entries.push(
        makeEntry({
          protocol: protocol.toLowerCase(),
          sourceKind: "direct",
          originalLink: line,
          name: `proxy-${String(index).padStart(3, "0")}-${host.replaceAll(".", "-")}`,
          country: resolveCountry([zoneMatch?.[1] ?? ""]),
          host,
          port: Number(rawPort),
          username,
          password,
        }),
      );
      index += 1;
      continue;
    }

    if (line.startsWith("hy2://")) {
      try {
        const url = new URL(line);
        const query = Object.fromEntries(url.searchParams.entries());
        const fragment = decodeFragment(url.hash);
        entries.push(
          makeEntry({
            protocol: "hy2",
            sourceKind: "subscription",
            originalLink: line,
            name: `proxy-${String(index).padStart(3, "0")}-hy2-${url.hostname.replaceAll(".", "-")}`,
            country: resolveCountry([fragment, url.hostname, query.sni]),
            host: url.hostname,
            port: Number(url.port),
            username: "",
            password: decodeURIComponent(url.username),
            query,
            extra: { remark: fragment },
          }),
        );
        index += 1;
        continue;
      } catch (error) {
        invalid.push({ link: line, reason: `Invalid hy2 link: ${error.message}` });
        continue;
      }
    }

    if (line.startsWith("vless://")) {
      try {
        const url = new URL(line);
        const query = Object.fromEntries(url.searchParams.entries());
        const fragment = decodeFragment(url.hash);
        entries.push(
          makeEntry({
            protocol: "vless",
            sourceKind: "subscription",
            originalLink: line,
            name: `proxy-${String(index).padStart(3, "0")}-vless-${url.hostname.replaceAll(".", "-")}`,
            country: resolveCountry([fragment, query.sni, url.hostname]),
            host: url.hostname,
            port: Number(url.port),
            username: decodeURIComponent(url.username),
            password: "",
            query,
            extra: { remark: fragment },
          }),
        );
        index += 1;
        continue;
      } catch (error) {
        invalid.push({ link: line, reason: `Invalid vless link: ${error.message}` });
        continue;
      }
    }

    if (line.startsWith("vmess://")) {
      try {
        const decoded = Buffer.from(line.slice("vmess://".length), "base64").toString("utf8");
        const json = JSON.parse(decoded);
        entries.push(
          makeEntry({
            protocol: "vmess",
            sourceKind: "subscription",
            originalLink: line,
            name: `proxy-${String(index).padStart(3, "0")}-vmess-${String(json.add).replace(/[^A-Za-z0-9.-]/g, "-")}`,
            country: resolveCountry([json.ps, json.host, json.add]),
            host: String(json.add),
            port: Number(json.port),
            username: String(json.id),
            password: "",
            extra: {
              alterId: Number(json.aid || 0),
              cipher: json.scy || "auto",
              tls: Boolean(json.tls),
              servername: json.sni || "",
              network: json.net || "",
              path: json.path || "",
              wsHost: json.host || "",
            },
          }),
        );
        index += 1;
        continue;
      } catch (error) {
        invalid.push({ link: line, reason: `Invalid vmess payload: ${error.message}` });
        continue;
      }
    }

    invalid.push({ link: line, reason: "Unsupported or invalid link format" });
  }

  return { entries, invalid };
}

function pushProxyLines(lines, entry) {
  lines.push(`- name: "${entry.name}"`);
  if (entry.protocol === "socks5") {
    lines.push("  type: socks5", `  server: ${entry.host}`, `  port: ${entry.port}`, `  username: "${entry.username}"`, `  password: "${entry.password}"`, "  udp: false");
    return;
  }
  if (entry.protocol === "http") {
    lines.push("  type: http", `  server: ${entry.host}`, `  port: ${entry.port}`, `  username: "${entry.username}"`, `  password: "${entry.password}"`);
    return;
  }
  if (entry.protocol === "hy2") {
    lines.push("  type: hysteria2", `  server: ${entry.host}`, `  port: ${entry.port}`, `  password: "${entry.password}"`);
    if (entry.query.mport) lines.push(`  ports: "${entry.query.mport}"`, "  hop-interval: 30");
    if (entry.query.obfs) lines.push(`  obfs: ${entry.query.obfs}`);
    if (entry.query["obfs-password"]) lines.push(`  obfs-password: "${entry.query["obfs-password"]}"`);
    if (entry.query.sni) lines.push(`  sni: ${entry.query.sni}`);
    if (entry.query.insecure === "1") lines.push("  skip-cert-verify: true");
    return;
  }
  if (entry.protocol === "vless") {
    lines.push("  type: vless", `  server: ${entry.host}`, `  port: ${entry.port}`, `  uuid: "${entry.username}"`, "  udp: true");
    if (entry.query.encryption) lines.push(`  encryption: ${entry.query.encryption}`);
    if (entry.query.security === "tls") lines.push("  tls: true", "  skip-cert-verify: true");
    if (entry.query.sni) lines.push(`  servername: ${entry.query.sni}`);
    if (entry.query.type) lines.push(`  network: ${entry.query.type}`);
    if (entry.query.path || entry.query.host || entry.query.sni) {
      lines.push("  ws-opts:", `    path: "${entry.query.path || "/"}"`);
      const hostHeader = entry.query.host || entry.query.sni;
      if (hostHeader) lines.push("    headers:", `      Host: ${hostHeader}`);
    }
    return;
  }
  if (entry.protocol === "vmess") {
    lines.push(
      "  type: vmess",
      `  server: ${entry.host}`,
      `  port: ${entry.port}`,
      `  uuid: "${entry.username}"`,
      `  alterId: ${entry.extra.alterId}`,
      `  cipher: ${entry.extra.cipher}`,
      "  udp: true",
    );
    if (entry.extra.tls) lines.push("  tls: true", "  skip-cert-verify: true");
    if (entry.extra.servername) lines.push(`  servername: ${entry.extra.servername}`);
    if (entry.extra.network) lines.push(`  network: ${entry.extra.network}`);
    if (entry.extra.network === "ws" || entry.extra.path || entry.extra.wsHost) {
      lines.push("  ws-opts:", `    path: "${entry.extra.path || "/"}"`);
      if (entry.extra.wsHost) lines.push("    headers:", `      Host: ${entry.extra.wsHost}`);
    }
  }
}

function buildTestConfig(entries, mixedPort, controllerPort, secret) {
  const lines = [
    `mixed-port: ${mixedPort}`,
    "allow-lan: false",
    "mode: direct",
    "log-level: info",
    "ipv6: false",
    "",
    `external-controller: 127.0.0.1:${controllerPort}`,
    `secret: "${secret}"`,
    "",
    "proxies:",
  ];
  entries.forEach((entry) => pushProxyLines(lines, entry));
  return `${lines.join("\n")}\n`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function waitForController(controllerPort, secret) {
  const headers = { Authorization: `Bearer ${secret}` };
  for (let i = 0; i < 80; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${controllerPort}/proxies`, { headers });
      if (res.ok) return;
    } catch {}
  }
  throw new Error("Mihomo controller did not become ready in time.");
}

function createJobSnapshot(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    currentIndex: job.currentIndex,
    currentName: job.currentName,
    progressPercent: job.summary.total ? Math.round((job.summary.done / job.summary.total) * 100) : 0,
    summary: job.summary,
    csvPath: job.csvPath,
    error: job.error,
    invalid: job.invalid,
    entries: job.entries.map((entry) => ({
      protocol: entry.protocol,
      sourceKind: entry.sourceKind,
      link: entry.originalLink,
      country: entry.country,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      password: entry.password,
      name: entry.name,
      status: entry.validationStatus,
      delayMs: entry.validationDelayMs,
      detail: entry.validationDetail,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
    })),
  };
}

function toHistoryRecord(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    timeoutMs: job.timeoutMs,
    summary: job.summary,
    csvPath: job.csvPath,
    error: job.error,
    invalid: job.invalid,
    entries: job.entries.map((entry) => ({
      protocol: entry.protocol,
      sourceKind: entry.sourceKind,
      originalLink: entry.originalLink,
      name: entry.name,
      country: entry.country,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      password: entry.password,
      query: entry.query,
      extra: entry.extra,
      validationStatus: entry.validationStatus,
      validationDetail: entry.validationDetail,
      validationDelayMs: entry.validationDelayMs,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
    })),
  };
}

async function persistJobHistory(job) {
  const record = toHistoryRecord(job);
  historyStore = [record, ...historyStore.filter((item) => item.id !== job.id)].slice(0, 60);
  await saveHistory();
}

function historySnapshot(record) {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    currentIndex: record.summary.done,
    currentName: "",
    progressPercent: record.summary.total ? Math.round((record.summary.done / record.summary.total) * 100) : 0,
    summary: record.summary,
    csvPath: record.csvPath,
    error: record.error,
    invalid: record.invalid,
    entries: record.entries.map((entry) => ({
      protocol: entry.protocol,
      sourceKind: entry.sourceKind,
      link: entry.originalLink,
      country: entry.country,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      password: entry.password,
      name: entry.name,
      status: entry.validationStatus,
      delayMs: entry.validationDelayMs,
      detail: entry.validationDetail,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
    })),
  };
}

function findSourceEntries(sourceType, sourceId) {
  if (sourceType === "job") {
    const job = jobs.get(sourceId);
    if (!job) throw new Error("Job not found.");
    return job.entries;
  }
  if (sourceType === "history") {
    const record = historyStore.find((item) => item.id === sourceId);
    if (!record) throw new Error("History record not found.");
    return record.entries.map((entry) => ({
      ...entry,
      originalLink: entry.originalLink,
    }));
  }
  throw new Error("Unsupported source type.");
}

async function exportJobCsv(job) {
  const rows = [
    ["protocol", "source_kind", "link", "country", "host", "port", "username", "password", "node_name", "validation_status", "validation_delay_ms", "validation_detail"].join(","),
    ...job.entries.map((entry) =>
      [
        entry.protocol,
        entry.sourceKind,
        entry.originalLink,
        entry.country,
        entry.host,
        entry.port,
        entry.username,
        entry.password,
        entry.name,
        entry.validationStatus,
        entry.validationDelayMs,
        entry.validationDetail,
      ].map(escapeCsv).join(","),
    ),
  ];
  await writeFile(job.csvPath, rows.join("\n"), "utf8");
}

function normalizeExportEntry(entry) {
  return {
    protocol: entry.protocol,
    sourceKind: entry.sourceKind,
    originalLink: entry.originalLink,
    name: entry.name,
    country: entry.country,
    host: entry.host,
    port: entry.port,
    username: entry.username,
    password: entry.password,
    query: entry.query || {},
    extra: entry.extra || {},
    validationStatus: entry.validationStatus || entry.status,
    validationDetail: entry.validationDetail || entry.detail || "",
    validationDelayMs: entry.validationDelayMs || entry.delayMs || "",
  };
}

function filterEntriesForScope(entries, scope, selectedNames = []) {
  const normalized = entries.map(normalizeExportEntry);
  if (scope === "passed") return normalized.filter((entry) => entry.validationStatus === "passed");
  if (scope === "failed") return normalized.filter((entry) => entry.validationStatus === "failed");
  if (scope === "selected") return normalized.filter((entry) => selectedNames.includes(entry.name));
  return normalized;
}

function buildClientConfig(entries, title) {
  const lines = [
    "mixed-port: 7890",
    "allow-lan: false",
    "mode: rule",
    "log-level: info",
    "ipv6: false",
    "",
    "proxies:",
  ];
  entries.forEach((entry) => pushProxyLines(lines, entry));
  lines.push(
    "",
    "proxy-groups:",
    '- name: "AUTO"',
    "  type: select",
    "  proxies:",
  );
  entries.forEach((entry) => lines.push(`    - "${entry.name}"`));
  lines.push(
    '    - "DIRECT"',
    "",
    "rules:",
    "- MATCH,AUTO",
    "",
    `# generated-by: Proxy Link Tester`,
    `# title: ${title}`,
  );
  return `${lines.join("\n")}\n`;
}

async function createExportFile({ sourceType, sourceId, scope, selectedNames, format, client }) {
  const sourceEntries = findSourceEntries(sourceType, sourceId);
  const entries = filterEntriesForScope(sourceEntries, scope, selectedNames);
  if (!entries.length) {
    throw new Error("No entries matched the selected export scope.");
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  let extension = "txt";
  let content = "";

  if (format === "raw-links") {
    extension = "txt";
    content = entries.map((entry) => entry.originalLink).join("\n");
  } else if (format === "json") {
    extension = "json";
    content = JSON.stringify(entries, null, 2);
  } else if (format === "csv") {
    extension = "csv";
    const rows = [
      ["protocol", "country", "host", "port", "username", "password", "status", "delayMs", "link"].join(","),
      ...entries.map((entry) =>
        [
          entry.protocol,
          entry.country,
          entry.host,
          entry.port,
          entry.username,
          entry.password,
          entry.validationStatus,
          entry.validationDelayMs,
          entry.originalLink,
        ].map(escapeCsv).join(","),
      ),
    ];
    content = rows.join("\n");
  } else if (format === "client") {
    if (["mihomo", "clash-verge"].includes(client)) {
      extension = "yaml";
      content = buildClientConfig(entries, `${client}-${scope}`);
    } else if (["v2rayn", "nekobox"].includes(client)) {
      extension = "txt";
      content = entries.map((entry) => entry.originalLink).join("\n");
    } else {
      throw new Error("Unsupported client export target.");
    }
  } else {
    throw new Error("Unsupported export format.");
  }

  const clientPart = client ? `-${client}` : "";
  const outputPath = path.join(exportDir, `export-${timestamp}${clientPart}-${scope}.${extension}`);
  await writeFile(outputPath, content, "utf8");
  return outputPath;
}

function updateSummary(job) {
  const passed = job.entries.filter((entry) => entry.validationStatus === "passed").length;
  const failed = job.entries.filter((entry) => entry.validationStatus === "failed").length;
  const running = job.entries.filter((entry) => entry.validationStatus === "running").length;
  const queued = job.entries.filter((entry) => entry.validationStatus === "queued").length;
  job.summary = {
    total: job.entries.length,
    done: passed + failed,
    passed,
    failed,
    invalid: job.invalid.length,
    running,
    queued,
  };
}

async function runJob(job) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const controllerPort = 19090 + Math.floor(Math.random() * 500);
  const mixedPort = 17890 + Math.floor(Math.random() * 500);
  const secret = `tester-${timestamp}`;
  const configPath = path.join(tempDir, `mihomo-${timestamp}.yaml`);
  const logPath = path.join(tempDir, `mihomo-${timestamp}.log`);
  const lines = buildTestConfig(job.entries, mixedPort, controllerPort, secret);
  await writeFile(configPath, lines, "utf8");

  job.status = "booting";
  job.startedAt = new Date().toISOString();
  updateSummary(job);

  const logHandle = await import("node:fs/promises").then((fs) => fs.open(logPath, "w"));
  const process = spawn(mihomoExe, ["-f", configPath], {
    windowsHide: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });

  try {
    await waitForController(controllerPort, secret);
    job.status = "running";
    updateSummary(job);

    let nextIndex = 0;
    const concurrency = Math.max(1, Math.min(4, Number(job.concurrency || 1), job.entries.length));

    const worker = async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= job.entries.length) return;
        const entry = job.entries[current];
        if (job.cancelRequested) {
          entry.validationStatus = "failed";
          entry.validationDetail = "Cancelled";
          entry.finishedAt = new Date().toISOString();
          updateSummary(job);
          return;
        }

        job.currentIndex = current + 1;
        job.currentName = entry.name;
        entry.validationStatus = "running";
        entry.validationDetail = "Testing...";
        entry.startedAt = new Date().toISOString();
        updateSummary(job);

        try {
          const proxyName = encodeURIComponent(entry.name);
          const res = await fetch(`http://127.0.0.1:${controllerPort}/proxies/${proxyName}/delay?url=${encodeURIComponent(probeUrl)}&timeout=${job.timeoutMs}`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
          if (!res.ok) {
            entry.validationStatus = "failed";
            entry.validationDetail = await res.text();
          } else {
            const payload = await res.json();
            const delay = Number(payload.delay ?? payload);
            if (Number.isFinite(delay) && delay >= 0) {
              entry.validationStatus = "passed";
              entry.validationDelayMs = delay;
              entry.validationDetail = `delay=${delay}ms`;
            } else {
              entry.validationStatus = "failed";
              entry.validationDetail = "Negative delay returned";
            }
          }
        } catch (error) {
          entry.validationStatus = "failed";
          entry.validationDetail = error.message;
        } finally {
          entry.finishedAt = new Date().toISOString();
          updateSummary(job);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    job.status = job.cancelRequested ? "cancelled" : "finished";
    job.finishedAt = new Date().toISOString();
    job.currentName = "";
    job.currentIndex = job.entries.length;
    await exportJobCsv(job);
    await persistJobHistory(job);
  } catch (error) {
    job.status = "error";
    job.error = error.message;
    job.finishedAt = new Date().toISOString();
    updateSummary(job);
    await persistJobHistory(job);
  } finally {
    process.kill("SIGTERM");
    await logHandle.close();
    await rm(configPath, { force: true });
    await rm(logPath, { force: true });
  }
}

function createJob(rawLinks, timeoutMs, concurrency = 1) {
  const parsed = parseLinks(rawLinks);
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const job = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: "",
    finishedAt: "",
    currentIndex: 0,
    currentName: "",
    timeoutMs,
    concurrency,
    invalid: parsed.invalid,
    entries: parsed.entries,
    summary: { total: parsed.entries.length, done: 0, passed: 0, failed: 0, invalid: parsed.invalid.length, running: 0, queued: parsed.entries.length },
    csvPath: path.join(exportDir, `proxy-test-${timestamp}.csv`),
    error: "",
    cancelRequested: false,
  };
  jobs.set(id, job);
  if (parsed.entries.length > 0) {
    runJob(job).catch((error) => {
      job.status = "error";
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      persistJobHistory(job).catch(() => {});
    });
  } else {
    job.status = "error";
    job.error = "No valid links were parsed.";
    persistJobHistory(job).catch(() => {});
  }
  return job;
}

function createRetryJob(sourceType, sourceId, scope, timeoutMs, concurrency = 1) {
  const sourceEntries = findSourceEntries(sourceType, sourceId).map(normalizeExportEntry);
  const filtered = filterEntriesForScope(sourceEntries, scope);
  const rawLinks = filtered.map((entry) => entry.originalLink).join("\n");
  return createJob(rawLinks, timeoutMs, concurrency);
}

async function serveStatic(req, res) {
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const relative = req.url === "/" ? "index.html" : req.url.replace(/^\//, "");
  const fullPath = path.join(webRoot, relative);
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(fullPath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(fullPath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not Found" });
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html" || req.url.startsWith("/assets/") || req.url === "/favicon.ico")) {
      await serveStatic(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true, url: `http://127.0.0.1:${port}/`, mihomo: mihomoExe });
      return;
    }

    if (req.method === "GET" && req.url === "/api/history") {
      sendJson(res, 200, {
        ok: true,
        items: historyStore.map((record) => ({
          id: record.id,
          status: record.status,
          createdAt: record.createdAt,
          finishedAt: record.finishedAt,
          summary: record.summary,
          csvPath: record.csvPath,
          error: record.error,
        })),
      });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/history/")) {
      const historyId = req.url.split("/").pop();
      const record = historyStore.find((item) => item.id === historyId);
      if (!record) {
        sendJson(res, 404, { error: "History record not found." });
        return;
      }
      sendJson(res, 200, { ok: true, snapshot: historySnapshot(record) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/jobs") {
      const body = await readRequestBody(req);
      const links = String(body.links || "");
      const timeoutMs = Number(body.timeoutMs || 8000);
      const concurrency = Number(body.concurrency || 1);
      if (!links.trim()) {
        sendJson(res, 400, { error: "Please paste at least one proxy link." });
        return;
      }
      const job = createJob(links, timeoutMs, concurrency);
      sendJson(res, 201, { ok: true, jobId: job.id, snapshot: createJobSnapshot(job) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/retry") {
      const body = await readRequestBody(req);
      const sourceType = String(body.sourceType || "history");
      const sourceId = String(body.sourceId || "");
      const scope = String(body.scope || "failed");
      const timeoutMs = Number(body.timeoutMs || 8000);
      const concurrency = Number(body.concurrency || 1);
      if (!sourceId) {
        sendJson(res, 400, { error: "sourceId is required." });
        return;
      }
      const job = createRetryJob(sourceType, sourceId, scope, timeoutMs, concurrency);
      sendJson(res, 201, { ok: true, jobId: job.id, snapshot: createJobSnapshot(job) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/export") {
      const body = await readRequestBody(req);
      const outputPath = await createExportFile({
        sourceType: String(body.sourceType || "job"),
        sourceId: String(body.sourceId || ""),
        scope: String(body.scope || "passed"),
        selectedNames: Array.isArray(body.selectedNames) ? body.selectedNames : [],
        format: String(body.format || "raw-links"),
        client: body.client ? String(body.client) : "",
      });
      sendJson(res, 200, { ok: true, outputPath });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/jobs/")) {
      const jobId = req.url.split("/").pop();
      const job = jobs.get(jobId);
      if (!job) {
        sendJson(res, 404, { error: "Job not found." });
        return;
      }
      sendJson(res, 200, { ok: true, snapshot: createJobSnapshot(job) });
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/jobs/") && req.url.endsWith("/cancel")) {
      const parts = req.url.split("/");
      const jobId = parts[3];
      const job = jobs.get(jobId);
      if (!job) {
        sendJson(res, 404, { error: "Job not found." });
        return;
      }
      job.cancelRequested = true;
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

await loadHistory();

server.listen(port, "127.0.0.1", () => {
  console.log(`Proxy tester is running at http://127.0.0.1:${port}/`);
});
