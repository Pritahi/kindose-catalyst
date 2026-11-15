import test from "node:test";
import assert from "node:assert/strict";
import {
  newCircle,
  timeline,
  adherence,
  reminderPlan,
  validateMedication,
  hashPass,
  checkPass,
  tokenFor,
  readToken,
  dayInZone,
} from "../lib/domain.mjs";
test("passphrases are salted and checked without storing raw values", () => {
  let h = hashPass("long-private-passphrase");
  assert.ok(!h.includes("long-private"));
  assert.ok(checkPass("long-private-passphrase", h));
  assert.ok(!checkPass("wrong", h));
  assert.notEqual(h, hashPass("long-private-passphrase"));
});
test("sessions reject tampering and expired tokens", () => {
  let token = tokenFor({ member: "x", exp: Date.now() + 10000 }, "s");
  assert.equal(readToken(token, "s").member, "x");
  assert.equal(readToken(token + "bad", "s"), null);
  assert.equal(readToken(token, "other"), null);
  assert.equal(readToken(tokenFor({ exp: 1 }, "s"), "s"), null);
});
test("time zone day boundaries are explicit", () =>
  assert.equal(
    dayInZone(new Date("2026-11-14T20:00:00Z"), "Asia/Kolkata"),
    "2026-11-15",
  ));
function fixture() {
  let c = newCircle();
  c.createdAt = "2026-11-15T00:00:00Z";
  c.medications = [
    {
      id: "m",
      name: "Example",
      dose: "1 prescribed dose",
      times: ["08:00", "13:00", "20:00"],
      active: true,
      stock: 10,
    },
  ];
  return c;
}
test("schedule distinguishes due, missed, upcoming and acknowledged doses", () => {
  let c = fixture(),
    now = new Date("2026-11-15T07:40:00Z");
  let d = timeline(c, now);
  assert.deepEqual(
    d.map((x) => x.status),
    ["missed", "due", "upcoming"],
  );
  c.logs.push({ doseId: d[0].id, status: "taken" });
  assert.equal(timeline(c, now)[0].status, "taken");
});
test("adherence must not invent missed doses before circle creation", () => {
  let c = fixture();
  let a = adherence(c, new Date("2026-11-15T07:40:00Z"));
  assert.equal(a.expected, 2);
});
test("future doses do not lower adherence", () => {
  let c = fixture(),
    now = new Date("2026-11-15T03:00:00Z");
  let d = timeline(c, now);
  c.logs = [{ doseId: d[0].id, status: "taken" }];
  assert.equal(adherence(c, now).percent, 100);
});
test("reminder plan covers missed and upcoming with deterministic keys", () => {
  let c = fixture();
  let r = reminderPlan(c, new Date("2026-11-15T07:15:00Z"));
  assert.deepEqual(
    r.map((x) => x.type),
    ["missed", "upcoming"],
  );
  assert.equal(
    r[0].key,
    reminderPlan(c, new Date("2026-11-15T07:16:00Z"))[0].key,
  );
});
test("taken or skipped doses never trigger reminders", () => {
  let c = fixture(),
    now = new Date("2026-11-15T07:40:00Z");
  c.logs = timeline(c, now).map((d) => ({ doseId: d.id, status: "skipped" }));
  assert.equal(reminderPlan(c, now).length, 0);
});
test("validates and deduplicates medication times", () => {
  assert.throws(() =>
    validateMedication({ name: "x", dose: "1", times: ["25:88"] }),
  );
  assert.throws(() =>
    validateMedication({ name: "", dose: "1", times: ["08:00"] }),
  );
  assert.deepEqual(
    validateMedication({
      name: " x ",
      dose: "1",
      times: ["08:00", "08:00"],
      stock: -5,
    }).times,
    ["08:00"],
  );
});
test("each demo circle is isolated and has fictional care data", () => {
  let a = newCircle({ demo: true }),
    b = newCircle({ demo: true });
  assert.notEqual(a.id, b.id);
  assert.equal(a.members.length, 3);
  assert.equal(a.medications.length, 3);
  assert.ok(a.demo);
  assert.equal(
    a.members.some((m) => m.email),
    false,
  );
});
test("new medication does not create historical missed doses", () => {
  let c = fixture();
  c.createdAt = "2026-11-10T00:00:00Z";
  c.medications[0].startDate = "2026-11-15";
  assert.equal(adherence(c, new Date("2026-11-15T07:40:00Z")).expected, 2);
});
test("new private circles do not opt into family alerts", () => {
  assert.equal(newCircle().consent.familyAlerts, false);
});
