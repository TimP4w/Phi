import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { mockResources, ids } from "./mockData.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || "http://localhost:5180";
const OUT = process.env.OUT || resolve(here, "..");

const send = (ws, type, message, extra = {}) =>
  ws.send(JSON.stringify({ type, message, clientId: "mock-1", ...extra }));

function wireRoutes(page) {
  page.route("**/api/events", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  // Generic resource route first; the more specific /describe is registered last
  // so it wins (Playwright matches most-recently-added routes first).
  page.route("**/api/resource/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "{}" }),
  );
  page.route("**/describe", (route) =>
    route.fulfill({
      contentType: "application/x-yaml",
      body: "apiVersion: helm.toolkit.fluxcd.io/v2\nkind: HelmRelease\nmetadata:\n  name: podinfo\n  namespace: podinfo\nspec:\n  chart:\n    spec:\n      chart: podinfo\n      version: 6.7.0\nstatus:\n  conditions:\n    - type: Ready\n      status: \"True\"\n      reason: InstallSucceeded\n",
    }),
  );

  page.routeWebSocket(/\/ws$/, (ws) => {
    // Act as the backend: no real server connection. Delay the snapshot so the
    // page's onmessage handler is attached before it arrives.
    send(ws, "CONNECTED", "", { clientId: "mock-1" });
    setTimeout(() => send(ws, "RESOURCE_SYNC", mockResources), 400);
    ws.onMessage((raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === "PING") send(ws, "PONG", "pong");
      if (msg.type === "START_WATCH_METRICS") {
        send(ws, "METRICS_STATUS", { metricsServerAvailable: true, prometheusAvailable: true });
      }
    });
  });
}

async function shoot(page, path, file, { waitFor, settle = 1800, full = false } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000, state: "attached" });
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
  console.log(`saved ${OUT}/${file}`);
}

// Playwright's bundled headless-shell lacks libs that nix provides, so point at
// a real chromium via CHROMIUM (`which chromium` inside `nix develop`). Falls
// back to Playwright's own browser when CHROMIUM is unset.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1512, height: 945 },
  deviceScaleFactor: 2,
});
await wireRoutes(page);

// Warm-up: the very first WebSocket in a fresh context isn't intercepted by
// routeWebSocket; this throwaway load absorbs it so every real shot syncs.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

await shoot(page, "/", "dashboard.png", { waitFor: "text=podinfo" });
await shoot(page, `/resource/${ids.appsKs}`, "tree.png", { waitFor: ".react-flow__node", settle: 2600 });
await shoot(page, `/resource/${ids.podinfo}/network`, "network.png", { waitFor: ".react-flow__node", settle: 2600 });

// Error in the side panel: a failed HelmRelease surfaces its failing condition
// as a red alert at the top of the detail panel.
await shoot(page, `/resource/${ids.paperless}`, "error-panel.png", { waitFor: ".react-flow__node", settle: 2600 });

// Command palette: open over the dashboard and query by kind to show the
// resource list with status chips.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=podinfo", { state: "attached" });
await page.waitForTimeout(1200);
await page.keyboard.press("Control+k");
await page.waitForTimeout(400);
await page.keyboard.type("kind:HelmRelease", { delay: 25 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/command-palette.png` });
console.log(`saved ${OUT}/command-palette.png`);

await browser.close();
console.log("done");
