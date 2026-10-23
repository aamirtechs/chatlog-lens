"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/logic.js");

const IOS = "[10/10/2026, 09:00:00] Ana Example: Hi, my order has not arrived\n[10/10/2026, 09:10:00] Support Sam: Sorry about that, checking now\n[10/10/2026, 09:12:00] Ana Example: Thanks\n[10/10/2026, 09:40:00] Support Sam: It arrives tomorrow";
const ANDROID = "10/10/2026, 09:00 - Ana Example: Hi there\n10/10/2026, 09:05 - Support Sam: Hello, how can I help?\n10/10/2026, 09:06 - Ana Example: My invoice is wrong\n10/10/2026, 11:06 - Support Sam: Fixed and resent";

test("parses iOS WhatsApp format", () => {
  const msgs = L.parseWhatsApp(IOS);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].sender, "Ana Example");
  assert.match(msgs[1].text, /checking now/);
});

test("parses Android WhatsApp format", () => {
  const msgs = L.parseWhatsApp(ANDROID);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[3].sender, "Support Sam");
});

test("multiline message is joined to previous", () => {
  const msgs = L.parseWhatsApp(ANDROID + "\nsecond line here");
  assert.equal(msgs.length, 4);
  assert.match(msgs[3].text, /second line/);
});

test("parses generic chat CSV", () => {
  const csv = "sender,timestamp,message\nAna Example,2026-10-10T09:00:00,Hello\nSupport Sam,2026-10-10T09:03:00,Hi back";
  const msgs = L.parseChatCSV(csv);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].text, "Hi back");
});

test("median and percentile maths", () => {
  assert.equal(L.median([10, 20, 30]), 20);
  assert.equal(L.median([10, 20]), 15);
  assert.equal(L.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test("response stats per participant", () => {
  const stats = L.computeResponseStats(L.parseWhatsApp(IOS));
  const sam = stats.find((s) => s.sender === "Support Sam");
  const ana = stats.find((s) => s.sender === "Ana Example");
  assert.equal(sam.responseCount, 2);
  assert.equal(sam.medianMinutes, 19); // responses at 10 and 28 minutes
  assert.equal(ana.medianMinutes, 2);
});

test("business hours adjustment shrinks an overnight gap", () => {
  const text = "[09/10/2026, 16:50:00] Ana Example: Question\n[12/10/2026, 09:10:00] Support Sam: Answer";
  const msgs = L.parseWhatsApp(text); // Fri 16:50 to Mon 09:10
  const plain = L.computeResponseStats(msgs);
  const biz = L.computeResponseStats(msgs, { businessHoursOnly: true, startHour: 9, endHour: 17 });
  const plainSam = plain.find((s) => s.sender === "Support Sam");
  const bizSam = biz.find((s) => s.sender === "Support Sam");
  assert.ok(bizSam.medianMinutes < plainSam.medianMinutes);
  assert.equal(bizSam.medianMinutes, 20); // 10 min Fri + 10 min Mon
});

test("longest silences are sorted descending", () => {
  const gaps = L.longestSilences(L.parseWhatsApp(ANDROID));
  assert.equal(gaps[0].minutes, 120);
  assert.equal(gaps[0].afterSender, "Ana Example");
});

test("unanswered last message detected", () => {
  const msgs = L.parseWhatsApp(IOS);
  const r = L.detectUnanswered(msgs, msgs[msgs.length - 1].timestamp + 60 * 60000);
  assert.equal(r.unanswered, true);
  assert.equal(r.waitingMinutes, 60);
  assert.equal(r.lastMessage.sender, "Support Sam");
});

test("redacted transcript masks email and phone shapes", () => {
  const msgs = [{ timestamp: 0, dateISO: "2026-10-10T09:00:00.000Z", sender: "Ana Example", text: "Mail me at ana@example.com or call +1 555 010 2233", system: false }];
  const out = L.buildRedactedTranscript(msgs);
  assert.match(out, /\[EMAIL\]/);
  assert.match(out, /\[PHONE\]/);
  assert.ok(!out.includes("ana@example.com"));
});

test("search and stats CSV", () => {
  const msgs = L.parseWhatsApp(IOS);
  assert.equal(L.searchMessages(msgs, "invoice").length, 0);
  assert.equal(L.searchMessages(msgs, "order").length, 1);
  const csv = L.statsToCSV(L.computeResponseStats(msgs));
  assert.match(csv, /sender,messages,responseCount/);
  assert.deepEqual(L.participants(msgs), ["Ana Example", "Support Sam"]);
});
