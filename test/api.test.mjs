import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "kindose-test-"));
process.env.SESSION_SECRET = "test-secret-not-for-production";
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
const { default: handler } = await import("../api/care.mjs");
let cookie = "",
  version;
async function call(body, options = {}) {
  let req = {
    method: options.get ? "GET" : "POST",
    headers: { cookie, ...options.headers },
    body,
  };
  let res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    json(x) {
      this.body = x;
    },
    end() {},
  };
  await handler(req, res);
  if (res.headers["set-cookie"])
    cookie = res.headers["set-cookie"].split(";")[0];
  return res;
}
await test("API smoke flow: authentication, CRUD, roles, privacy, conflicts", async () => {
  let r = await call({}, { get: true });
  assert.equal(r.statusCode, 401);
  r = await call({ action: "demo" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.demo, true);
  assert.ok(!JSON.stringify(r.body).includes("passHash"));
  version = r.body.version;
  let med = r.body.medications[0],
    dose = r.body.today[0];
  r = await call({ action: "dose", doseId: dose.id, status: "taken", version });
  assert.equal(r.statusCode, 200);
  version = r.body.version;
  let stock = r.body.medications[0].stock;
  r = await call({ action: "dose", doseId: dose.id, status: "taken", version });
  assert.equal(r.body.medications[0].stock, stock);
  version = r.body.version;
  r = await call({ action: "dose", doseId: dose.id, status: "undo", version });
  assert.equal(r.body.medications[0].stock, stock + 1);
  version = r.body.version;
  r = await call({ action: "note", text: "x", version: 0 });
  assert.equal(r.statusCode, 409);
  r = await call({ action: "switchDemo", role: "family", version });
  assert.equal(r.body.me.role, "family");
  r = await call({ action: "consent", familyAlerts: false, ai: false });
  assert.equal(r.statusCode, 403);
  r = await call({
    action: "note",
    kind: "preference",
    text: "Family cannot overwrite elder preference",
  });
  assert.equal(r.statusCode, 400);
  r = await call({ action: "email", email: "nobody@example.com" });
  assert.equal(r.statusCode, 400);
  r = await call({
    action: "medication",
    medication: {
      name: "Sample-only routine",
      dose: "As prescribed",
      times: ["07:00", "22:00"],
      stock: 12,
    },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.medications.length, 4);
  r = await call({
    action: "medication",
    medication: {
      name: "Zero-stock fictional medication",
      dose: "1",
      times: ["08:00"],
      stock: 0,
    },
  });
  let zero = r.body.today.find(
    (d) => d.name === "Zero-stock fictional medication",
  );
  r = await call({ action: "dose", doseId: zero.id, status: "taken" });
  r = await call({ action: "dose", doseId: zero.id, status: "undo" });
  assert.equal(
    r.body.medications.find((m) => m.id === zero.medicationId).stock,
    0,
  );
  r = await call({
    action: "appointment",
    appointment: {
      title: "Review",
      doctor: "Demo clinician",
      datetime: "2026-11-16T12:00:00Z",
      location: "Clinic",
    },
  });
  assert.equal(r.body.appointments.length, 2);
  r = await call({
    action: "note",
    text: "<script>alert(1)</script>",
    kind: "note",
  });
  assert.equal(r.body.notes[0].text, "<script>alert(1)</script>");
  r = await call({ action: "summary" });
  assert.equal(r.body.source, "structured");
  assert.ok(r.body.text.includes("not clinical advice"));
  r = await call(
    { action: "note", text: "origin test" },
    { headers: { origin: "https://evil.example", host: "localhost" } },
  );
  assert.equal(r.statusCode, 403);
  await call({ action: "logout" });
  r = await call({}, { get: true });
  assert.equal(r.statusCode, 401);
  r = await call({
    action: "create",
    name: "Test elder",
    passcode: "only-a-test-passphrase",
    timezone: "UTC",
  });
  assert.equal(r.statusCode, 200);
  let id = r.body.id;
  assert.equal(r.body.me.role, "elder");
  assert.ok(!JSON.stringify(r.body).includes("passHash"));
  assert.ok(!JSON.stringify(r.body).includes("only-a-test-passphrase"));
  r = await call({
    action: "invite",
    name: "Test family",
    role: "family",
    passcode: "test-family-passphrase",
  });
  assert.equal(r.statusCode, 200);
  let family = r.body.members.find((m) => m.role === "family");
  let elderCookie = cookie;
  await call({ action: "logout" });
  r = await call({ action: "join", circle: id, passcode: "wrong" });
  assert.equal(r.statusCode, 401);
  r = await call({
    action: "join",
    circle: id,
    passcode: "test-family-passphrase",
  });
  assert.equal(r.body.me.role, "family");
  let familyCookie = cookie;
  cookie = elderCookie;
  r = await call({ action: "revoke", id: family.id });
  assert.equal(r.statusCode, 200);
  cookie = familyCookie;
  r = await call({}, { get: true });
  assert.equal(r.statusCode, 401);
  cookie = elderCookie;
  r = await call({ action: "deleteCircle" });
  assert.equal(r.body.deleted, true);
});
await rm(process.env.DATA_DIR, { recursive: true, force: true });
