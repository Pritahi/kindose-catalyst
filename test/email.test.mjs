import test from "node:test";
import assert from "node:assert/strict";
import { newCircle } from "../lib/domain.mjs";
import { processReminders } from "../lib/email.mjs";
function fixture() {
  const c = newCircle();
  c.medications = [
    {
      id: "m",
      name: "Fictional tablet",
      dose: "1 dose",
      times: ["08:00"],
      active: true,
    },
  ];
  c.members = [
    {
      id: "elder",
      role: "elder",
      active: true,
      email: "owner@example.invalid",
    },
    {
      id: "family",
      role: "family",
      active: true,
      email: "family@example.invalid",
    },
  ];
  return c;
}
test("email allowlist, elder consent, provider success and idempotent repeat", async () => {
  const original = globalThis.fetch;
  process.env.RESEND_API_KEY = "fake-test-key";
  process.env.REMINDER_FROM = "test@example.invalid";
  process.env.REMINDER_TO_ALLOWLIST =
    "owner@example.invalid,family@example.invalid";
  let sends = [];
  globalThis.fetch = async (url, options) => {
    sends.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: "fake-id" }) };
  };
  try {
    const c = fixture();
    let r = await processReminders(c, new Date("2026-11-15T04:00:00Z"));
    assert.equal(r.length, 1);
    assert.equal(r[0].status, "sent");
    assert.equal(sends[0].to, "owner@example.invalid");
    assert.equal(
      (await processReminders(c, new Date("2026-11-15T04:01:00Z"))).length,
      0,
    );
    c.consent.familyAlerts = true;
    r = await processReminders(c, new Date("2026-11-15T04:02:00Z"));
    assert.equal(r.length, 1);
    assert.equal(sends[1].to, "family@example.invalid");
  } finally {
    globalThis.fetch = original;
    delete process.env.RESEND_API_KEY;
    delete process.env.REMINDER_FROM;
    delete process.env.REMINDER_TO_ALLOWLIST;
  }
});
test("demo and non-allowlisted recipients cannot send", async () => {
  const c = fixture();
  assert.equal((await processReminders(c)).length, 0);
  c.demo = true;
  process.env.REMINDER_TO_ALLOWLIST = "owner@example.invalid";
  try {
    assert.equal((await processReminders(c)).length, 0);
  } finally {
    delete process.env.REMINDER_TO_ALLOWLIST;
  }
});
test("completed appointments have no reminder", async () => {
  const c = fixture();
  c.medications = [];
  c.appointments = [
    { id: "a", title: "Visit", datetime: "2026-11-15T05:00:00Z", done: true },
  ];
  process.env.REMINDER_TO_ALLOWLIST = "owner@example.invalid";
  try {
    assert.equal(
      (await processReminders(c, new Date("2026-11-15T04:00:00Z"))).length,
      0,
    );
  } finally {
    delete process.env.REMINDER_TO_ALLOWLIST;
  }
});
