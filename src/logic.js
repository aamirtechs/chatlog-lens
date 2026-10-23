"use strict";
// Chatlog Lens core logic: pure functions, no DOM, no fetch.

function parseCSVText(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).filter((r) => r.some((v) => String(v).trim() !== "")).map((r, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, j) => { obj[h] = r[j] != null ? String(r[j]).trim() : ""; });
    return obj;
  });
}

function toCSV(rows, cols) {
  const esc = (v) => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\n") + "\n";
}

function makeTimestamp(day, mon, year, hh, mm, ss, ampm) {
  let y = parseInt(year, 10); if (y < 100) y += 2000;
  let h = parseInt(hh, 10);
  if (ampm) {
    const up = String(ampm).toUpperCase();
    if (up === "PM" && h < 12) h += 12;
    if (up === "AM" && h === 12) h = 0;
  }
  const d = new Date(y, parseInt(mon, 10) - 1, parseInt(day, 10), h, parseInt(mm, 10), parseInt(ss || "0", 10));
  return isNaN(d.getTime()) ? null : d;
}

const IOS_RE = /^\[(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]))?\]\s*([^:]+):\s?([\s\S]*)$/;
const ANDROID_RE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]))?\s*-\s*([^:]+):\s?([\s\S]*)$/;

function parseWhatsApp(text) {
  const messages = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    let m = line.match(IOS_RE) || line.match(ANDROID_RE);
    if (m) {
      const dt = makeTimestamp(m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
      if (dt) { messages.push({ timestamp: dt.getTime(), dateISO: dt.toISOString(), sender: m[8].trim(), text: m[9] || "", system: false }); continue; }
    }
    // System lines in Android format without a sender colon
    const sys = line.match(ANDROID_RE.source ? /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]))?\s*-\s*([\s\S]*)$/ : null);
    if (sys && messages.length >= 0 && !line.includes(": ")) {
      const dt = makeTimestamp(sys[1], sys[2], sys[3], sys[4], sys[5], sys[6], sys[7]);
      if (dt) { messages.push({ timestamp: dt.getTime(), dateISO: dt.toISOString(), sender: "", text: sys[8] || "", system: true }); continue; }
    }
    if (messages.length && line.trim() !== "") {
      messages[messages.length - 1].text += "\n" + line;
    }
  }
  return messages;
}

function parseChatCSV(text) {
  const rows = parseCSVText(text);
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]).filter((k) => k !== "_row");
  const pick = (names) => headers.find((h) => names.includes(h.toLowerCase())) || null;
  const sCol = pick(["sender", "from", "author", "participant", "name", "user"]);
  const tCol = pick(["timestamp", "date", "time", "datetime", "sent_at"]);
  const mCol = pick(["message", "text", "body", "content"]);
  if (!mCol) return [];
  return rows.map((r) => {
    const raw = tCol ? r[tCol] : "";
    const d = raw ? new Date(raw.replace(" ", "T")) : null;
    const ts = d && !isNaN(d.getTime()) ? d.getTime() : 0;
    return { timestamp: ts, dateISO: ts ? new Date(ts).toISOString() : "", sender: sCol ? r[sCol] : "Unknown", text: r[mCol], system: false };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(nums, p) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function businessMinutesBetween(startMs, endMs, startHour, endHour) {
  if (endMs <= startMs) return 0;
  let total = 0;
  let cur = new Date(startMs);
  cur.setSeconds(0, 0);
  const end = new Date(endMs);
  // Walk hour by hour at most 14 days worth to stay bounded
  let guard = 0;
  while (cur < end && guard < 24 * 60 * 14) {
    const day = cur.getDay();
    const h = cur.getHours();
    const isBiz = day >= 1 && day <= 5 && h >= startHour && h < endHour;
    const next = new Date(cur.getTime() + 60000);
    if (isBiz) total += Math.min(1, (Math.min(next, end) - cur) / 60000);
    cur = next; guard++;
  }
  return total;
}

function computeResponseStats(messages, opts) {
  const o = Object.assign({ businessHoursOnly: false, startHour: 9, endHour: 17 }, opts || {});
  const msgs = (messages || []).filter((m) => !m.system).slice().sort((a, b) => a.timestamp - b.timestamp);
  const bySender = {};
  msgs.forEach((m) => { if (!bySender[m.sender]) bySender[m.sender] = { sender: m.sender, messages: 0, responses: [] }; bySender[m.sender].messages++; });
  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1], cur = msgs[i];
    if (prev.sender !== cur.sender) {
      let mins = (cur.timestamp - prev.timestamp) / 60000;
      if (o.businessHoursOnly) mins = businessMinutesBetween(prev.timestamp, cur.timestamp, o.startHour, o.endHour);
      bySender[cur.sender].responses.push(Math.round(mins * 100) / 100);
    }
  }
  return Object.values(bySender).map((s) => ({
    sender: s.sender,
    messages: s.messages,
    responseCount: s.responses.length,
    medianMinutes: s.responses.length ? Math.round(median(s.responses) * 100) / 100 : null,
    p90Minutes: s.responses.length ? Math.round(percentile(s.responses, 90) * 100) / 100 : null,
    avgMinutes: s.responses.length ? Math.round((s.responses.reduce((a, b) => a + b, 0) / s.responses.length) * 100) / 100 : null
  })).sort((a, b) => b.messages - a.messages);
}

function longestSilences(messages, limit) {
  const msgs = (messages || []).filter((m) => !m.system).slice().sort((a, b) => a.timestamp - b.timestamp);
  const gaps = [];
  for (let i = 1; i < msgs.length; i++) {
    gaps.push({ afterSender: msgs[i - 1].sender, beforeSender: msgs[i].sender, startISO: msgs[i - 1].dateISO, endISO: msgs[i].dateISO, minutes: Math.round(((msgs[i].timestamp - msgs[i - 1].timestamp) / 60000) * 100) / 100 });
  }
  return gaps.sort((a, b) => b.minutes - a.minutes).slice(0, limit || 5);
}

function detectUnanswered(messages, nowMs) {
  const msgs = (messages || []).filter((m) => !m.system).slice().sort((a, b) => a.timestamp - b.timestamp);
  if (!msgs.length) return { unanswered: false, lastMessage: null, waitingMinutes: 0 };
  const last = msgs[msgs.length - 1];
  const now = nowMs || last.timestamp;
  return { unanswered: true, lastMessage: last, waitingMinutes: Math.round(((now - last.timestamp) / 60000) * 100) / 100, note: "The final message in the export has no reply after it." };
}

function redactText(text) {
  return String(text || "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[PHONE]")
    .replace(/https?:\/\/\S+/g, "[LINK]");
}

function buildRedactedTranscript(messages) {
  return (messages || []).map((m) => {
    const when = m.dateISO ? m.dateISO.slice(0, 16).replace("T", " ") : "";
    const who = m.system ? "system" : redactText(m.sender);
    return "[" + when + "] " + who + ": " + redactText(m.text);
  }).join("\n") + "\n";
}

function searchMessages(messages, query) {
  const q = String(query || "").toLowerCase();
  if (!q) return messages || [];
  return (messages || []).filter((m) => (m.text || "").toLowerCase().includes(q) || (m.sender || "").toLowerCase().includes(q));
}

function participants(messages) {
  return Array.from(new Set((messages || []).filter((m) => !m.system).map((m) => m.sender))).sort();
}

function statsToCSV(stats) {
  return toCSV(stats.map((s) => ({ sender: s.sender, messages: s.messages, responseCount: s.responseCount, medianMinutes: s.medianMinutes == null ? "" : s.medianMinutes, p90Minutes: s.p90Minutes == null ? "" : s.p90Minutes, avgMinutes: s.avgMinutes == null ? "" : s.avgMinutes })), ["sender", "messages", "responseCount", "medianMinutes", "p90Minutes", "avgMinutes"]);
}

const api = { parseCSVText, parseWhatsApp, parseChatCSV, median, percentile, businessMinutesBetween, computeResponseStats, longestSilences, detectUnanswered, redactText, buildRedactedTranscript, searchMessages, participants, statsToCSV };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
if (typeof window !== "undefined") { window.ChatlogLens = api; }
