import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";

const port = Number(process.env.PORT || 8787);
const dataFile = resolve(process.env.DATA_FILE || "/data/events.jsonl");
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || "http://127.0.0.1:4173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
const adminUser = process.env.ADMIN_USER || "jas";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const ipHashSecret = process.env.IP_HASH_SECRET || "";
const trustProxy = process.env.TRUST_PROXY === "true";
const storeFullIp = process.env.STORE_FULL_IP === "true";
const maxBodyBytes = 32 * 1024;
const eventTypes = new Set([
  "session_started",
  "step_viewed",
  "booking_submitted",
  "booking_updated",
  "session_left",
]);
const rateLimit = new Map();
let writeQueue = Promise.resolve();

if (!adminPassword || adminPassword.length < 12) {
  throw new Error("ADMIN_PASSWORD must be set and contain at least 12 characters.");
}

if (!ipHashSecret || ipHashSecret.length < 20) {
  throw new Error("IP_HASH_SECRET must be set and contain at least 20 characters.");
}

await mkdir(dirname(dataFile), { recursive: true });

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function cleanString(value, maxLength = 500) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength)
    : "";
}

function cleanValue(value, depth = 0) {
  if (depth > 4 || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return cleanString(value, 1000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => cleanValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [cleanString(key, 80), cleanValue(item, depth + 1)]),
    );
  }
  return null;
}

function requestOrigin(request) {
  return cleanString(request.headers.origin, 300).replace(/\/$/, "");
}

function allowCors(request, response) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins.has(origin)) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

function clientIp(request) {
  if (trustProxy) {
    const cloudflareIp = cleanString(request.headers["cf-connecting-ip"], 80);
    const forwardedIp = cleanString(request.headers["x-forwarded-for"], 500)
      .split(",")[0]
      ?.trim();
    if (cloudflareIp) return cloudflareIp;
    if (forwardedIp) return forwardedIp;
  }
  return cleanString(request.socket.remoteAddress, 80) || "unknown";
}

function approximateLocation(request) {
  const headers = request.headers;
  const country = cleanString(headers["cf-ipcountry"] || headers["x-vercel-ip-country"] || headers["x-country-code"], 80);
  const region = cleanString(headers["cf-region"] || headers["x-vercel-ip-country-region"] || headers["x-region"], 120);
  const city = cleanString(headers["cf-ipcity"] || headers["x-vercel-ip-city"] || headers["x-city"], 120);
  const timezone = cleanString(headers["cf-timezone"] || headers["x-vercel-ip-timezone"] || headers["x-timezone"], 120);
  return {
    country: country || null,
    region: region || null,
    city: city || null,
    timezone: timezone || null,
    source: country || region || city ? "trusted proxy headers" : "not configured",
  };
}

function hashIp(ip) {
  return createHmac("sha256", ipHashSecret).update(ip).digest("hex").slice(0, 20);
}

function withinRateLimit(ip) {
  const now = Date.now();
  const current = rateLimit.get(ip);
  if (!current || now - current.startedAt > 60_000) {
    rateLimit.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 120;
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        rejectBody(new Error("body_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

function validateEvent(payload) {
  const sessionId = cleanString(payload?.sessionId, 100);
  const eventType = cleanString(payload?.eventType, 50);
  const name = cleanString(payload?.name, 80);

  if (!/^[a-zA-Z0-9-]{12,100}$/.test(sessionId)) throw new Error("invalid_session");
  if (!eventTypes.has(eventType)) throw new Error("invalid_event");
  if (payload?.consent !== true) throw new Error("consent_required");
  if (name.length < 2) throw new Error("name_required");

  return {
    sessionId,
    eventType,
    name,
    occurredAt: cleanString(payload.occurredAt, 40),
    openedAt: cleanString(payload.openedAt, 40),
    pageUrl: cleanString(payload.pageUrl, 500),
    details: cleanValue(payload.details || {}),
  };
}

function persistEvent(record) {
  // Recover after a failed append so one transient disk error does not poison
  // every later booking until the container is restarted.
  writeQueue = writeQueue
    .catch((error) => {
      console.error("Previous booking event write failed; retrying with the next event.", error);
    })
    .then(() => appendFile(dataFile, `${JSON.stringify(record)}\n`, { mode: 0o600 }));
  return writeQueue;
}

async function readEvents() {
  try {
    const contents = await readFile(dataFile, "utf8");
    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function aggregateSessions(events) {
  const sessions = new Map();
  for (const event of events) {
    const current = sessions.get(event.sessionId) || {
      sessionId: event.sessionId,
      name: event.name,
      openedAt: event.openedAt,
      lastSeenAt: event.receivedAt,
      status: "started",
      furthestStep: 1,
      lastStep: 1,
      booking: null,
      device: null,
      ip: event.ip,
      ipHash: event.ipHash,
      location: event.location,
      events: [],
    };

    current.name = event.name || current.name;
    current.lastSeenAt = event.receivedAt;
    current.ip = event.ip || current.ip;
    current.ipHash = event.ipHash || current.ipHash;
    current.location = event.location || current.location;
    current.events.push({ type: event.eventType, at: event.receivedAt, details: event.details });

    if (event.eventType === "session_started") current.device = event.details?.device || current.device;
    if (event.eventType === "step_viewed") {
      current.lastStep = Number(event.details?.step) || current.lastStep;
      current.furthestStep = Math.max(current.furthestStep, current.lastStep);
    }
    if (event.eventType === "booking_submitted") {
      current.status = "completed";
      current.booking = event.details;
      current.device = event.details?.device || current.device;
      current.furthestStep = 6;
    }
    if (event.eventType === "booking_updated" && current.booking) {
      current.booking = { ...current.booking, ...event.details };
    }
    if (event.eventType === "session_left" && current.status !== "completed") {
      current.status = "left early";
      current.lastStep = Number(event.details?.lastStep) || current.lastStep;
      current.furthestStep = Number(event.details?.furthestStep) || current.furthestStep;
    }
    sessions.set(event.sessionId, current);
  }
  return [...sessions.values()].sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAdmin(request) {
  const authorization = cleanString(request.headers.authorization, 1000);
  if (!authorization.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator > -1
      && safeEqual(decoded.slice(0, separator), adminUser)
      && safeEqual(decoded.slice(separator + 1), adminPassword);
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderDashboard(sessions) {
  const cards = sessions.map((session) => {
    const booking = session.booking || {};
    const location = [session.location?.city, session.location?.region, session.location?.country]
      .filter(Boolean)
      .join(", ") || "Unavailable";
    const plans = Array.isArray(booking.activities) ? booking.activities.join(", ") : "—";
    return `
      <article>
        <header><h2>${escapeHtml(session.name)}</h2><span class="status ${session.status === "completed" ? "complete" : ""}">${escapeHtml(session.status)}</span></header>
        <dl>
          <div><dt>Opened</dt><dd>${escapeHtml(session.openedAt || "—")}</dd></div>
          <div><dt>Last seen</dt><dd>${escapeHtml(session.lastSeenAt || "—")}</dd></div>
          <div><dt>Progress</dt><dd>Step ${escapeHtml(session.furthestStep)} of 6</dd></div>
          <div><dt>Duration</dt><dd>${escapeHtml(booking.duration || "—")}</dd></div>
          <div><dt>Plans</dt><dd>${escapeHtml(plans)}</dd></div>
          <div><dt>Smile choice</dt><dd>${escapeHtml(booking.smileChoice || "—")}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(location)}</dd></div>
          <div><dt>IP</dt><dd>${escapeHtml(session.ip || `Private hash: ${session.ipHash}`)}</dd></div>
        </dl>
        <details><summary>Device and journey details</summary><pre>${escapeHtml(JSON.stringify({ device: session.device, events: session.events }, null, 2))}</pre></details>
      </article>`;
  }).join("");

  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="30"><title>Book Jas submissions</title>
  <style>
    :root{color-scheme:light;font-family:system-ui,sans-serif;background:#fff7f1;color:#3d1d2a}body{max-width:980px;margin:auto;padding:24px}h1{margin-bottom:4px}.note{color:#78515f;margin-top:0}article{background:#fff;border:1px solid #ead9dc;border-radius:18px;padding:20px;margin:16px 0;box-shadow:0 10px 28px #6e20330d}header{display:flex;justify-content:space-between;gap:16px;align-items:center}h2{margin:0}.status{padding:5px 9px;border-radius:999px;background:#fff0ec;color:#9a3d27;font-size:12px;font-weight:700}.status.complete{background:#eaf7ee;color:#28744a}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#ead9dc;border:1px solid #ead9dc;border-radius:12px;overflow:hidden}dl div{background:#fff;padding:10px 12px}dt{font-size:11px;text-transform:uppercase;color:#78515f}dd{margin:3px 0 0;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#2b1820;color:#fff7f1;border-radius:12px;padding:14px;font-size:12px}@media(max-width:600px){dl{grid-template-columns:1fr}}
  </style></head><body><h1>Book Jas submissions</h1><p class="note">${sessions.length} visitor session${sessions.length === 1 ? "" : "s"}. This page refreshes every 30 seconds.</p>${cards || "<p>No submissions yet.</p>"}</body></html>`;
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/events") {
    if (!allowCors(request, response)) {
      sendJson(response, 403, { error: "origin_not_allowed" });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const ip = clientIp(request);
    if (!withinRateLimit(ip)) {
      sendJson(response, 429, { error: "too_many_requests" });
      return;
    }

    try {
      const body = await readRequestBody(request);
      const event = validateEvent(JSON.parse(body));
      const record = {
        ...event,
        receivedAt: new Date().toISOString(),
        ip: storeFullIp ? ip : null,
        ipHash: hashIp(ip),
        location: approximateLocation(request),
      };
      await persistEvent(record);
      sendJson(response, 202, { ok: true });
    } catch (error) {
      const tooLarge = error.message === "body_too_large";
      sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? "body_too_large" : "invalid_request" });
    }
    return;
  }

  if ((url.pathname === "/admin" || url.pathname === "/api/admin/submissions") && !isAdmin(request)) {
    response.setHeader("WWW-Authenticate", 'Basic realm="Book Jas submissions", charset="UTF-8"');
    sendJson(response, 401, { error: "authentication_required" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/submissions") {
    sendJson(response, 200, { sessions: aggregateSessions(await readEvents()) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/admin") {
    const body = renderDashboard(aggregateSessions(await readEvents()));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    });
    response.end(body);
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [ip, value] of rateLimit) {
    if (value.startedAt < cutoff) rateLimit.delete(ip);
  }
}, 60_000).unref();

server.listen(port, "0.0.0.0", () => {
  console.log(`Book Jas API listening on port ${port}`);
});
