import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(root + "test-results", { recursive: true });
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const proc = spawn("node", ["dev.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: "3018", DATA_DIR: root + "test-results/data" },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    proc.stdout.once("data", resolve);
    proc.once("error", reject);
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    let errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3018");
    await page.getByRole("button", { name: "Explore a sample circle" }).click();
    await page.getByText("A gentler rhythm for today.").waitFor();
    assert.ok(
      await page.getByText("Sample circle - fictional data").isVisible(),
    );
    await page.screenshot({
      path: `${root}test-results/kindose-${width}-today.png`,
      fullPage: true,
    });
    console.log(
      width,
      "overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    );
    const nav = (view) =>
      page
        .locator(width === 390 ? "#mobileNav" : ".sidebar")
        .locator(`[data-view="${view}"]`)
        .click();
    await nav("medications");
    await page.locator("#addMed").click();
    await page.locator("#editDialog .dialog-x").click();
    assert.equal(
      await page.locator("#editDialog").evaluate((x) => x.open),
      false,
    );
    await page.locator("#addMed").click();
    await page
      .locator("#editForm [name=name]")
      .fill("Fictional new medication");
    await page.locator("#editForm [name=dose]").fill("1 prescribed dose");
    await page.locator("#editForm [name=stock]").fill("9");
    await page
      .locator("#editForm")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page.getByText("Fictional new medication", { exact: true }).waitFor();
    await page.screenshot({
      path: `${root}test-results/kindose-${width}-medications.png`,
      fullPage: true,
    });
    await nav("circle");
    await page.getByRole("button", { name: "View as Anna" }).click();
    await page.getByText("Only the elder can change these choices.").waitFor();
    assert.equal(await page.locator("#editProfile").count(), 0);
    await page.getByRole("button", { name: "View as Margaret" }).click();
    await page.locator("#editProfile").waitFor();
    await nav("notes");
    await page
      .locator("#noteForm textarea")
      .fill("Fictional care note for integration test.");
    await page
      .locator("#noteForm")
      .getByRole("button", { name: "Save note" })
      .click();
    await page
      .getByText("Fictional care note for integration test.", { exact: true })
      .waitFor();
    await nav("appointments");
    await page.locator("#addAppt").click();
    await page.locator("#editForm [name=title]").fill("Fictional follow-up");
    await page.locator("#editForm [name=doctor]").fill("Example clinic");
    await page.locator("#editForm [name=datetime]").fill("2026-11-16T15:30");
    await page
      .locator("#editForm")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page.getByText("Fictional follow-up", { exact: true }).waitFor();
    await nav("reminders");
    await page.locator("#checkReminders").click();
    await page.getByText("Your email is not editable in demo mode.").waitFor();
    await page.screenshot({
      path: `${root}test-results/kindose-${width}-reminders.png`,
      fullPage: true,
    });
    await page.locator("#logoutBtn").click();
    await page
      .getByRole("button", { name: "Explore a sample circle" })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(width, "UI flow PASS");
    await page.close();
  }
} finally {
  await browser?.close();
  proc.kill();
}
