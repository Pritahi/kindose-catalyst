import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const proc = spawn("node", ["dev.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: "3019",
    DATA_DIR: root + "test-results/private-data",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let b;
try {
  await new Promise((r) => proc.stdout.once("data", r));
  b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  let errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:3019");
  await p.locator("#createBtn").click();
  await p.locator("#authForm [name=name]").fill("Fictional Elder");
  await p
    .locator("#authForm [name=passcode]")
    .fill("fictional-elder-passphrase");
  await p.locator("#authForm button.btn").click();
  await p.getByText("A gentler rhythm for today.").waitFor();
  await p.locator(".sidebar [data-view=circle]").click();
  const id = await p.locator(".codebox").innerText();
  await p.locator("#inviteBtn").click();
  await p.locator("#editForm [name=name]").fill("Fictional Family");
  await p
    .locator("#editForm [name=passcode]")
    .fill("fictional-family-passphrase");
  await p.locator("#editForm button.btn").click();
  await p.getByText("Fictional Family", { exact: true }).waitFor();
  await p.locator("#logoutBtn").click();
  await p.locator("#joinBtn").click();
  await p.locator("#authForm [name=circle]").fill(id);
  await p
    .locator("#authForm [name=passcode]")
    .fill("fictional-family-passphrase");
  await p.locator("#authForm button.btn").click();
  await p.getByText("A gentler rhythm for today.").waitFor();
  await p.locator(".sidebar [data-view=circle]").click();
  await p.getByText("Only the elder can change these choices.").waitFor();
  await p.locator("#logoutBtn").click();
  await p.locator("#joinBtn").click();
  await p.locator("#authForm [name=circle]").fill(id);
  await p
    .locator("#authForm [name=passcode]")
    .fill("fictional-elder-passphrase");
  await p.locator("#authForm button.btn").click();
  await p.getByText("A gentler rhythm for today.").waitFor();
  await p.locator(".sidebar [data-view=circle]").click();
  p.on("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Revoke", exact: true }).click();
  await p.getByText("Family · Inactive").waitFor();
  await p.locator("#deleteCircle").click();
  await p.locator("#editForm [name=confirm]").fill("DELETE");
  await p.locator("#editForm button.btn").click();
  await p.locator("#createBtn").waitFor();
  assert.deepEqual(errors, []);
  console.log("Private create/invite/logout/join/role/revoke/delete UI PASS");
} finally {
  await b?.close();
  proc.kill();
}
