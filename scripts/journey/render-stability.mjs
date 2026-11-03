// Render-stability meter for the customer app. Measures, per route, how much the page keeps rewriting itself after
// it has loaded (DOM mutation records, nodes added/removed, attribute and text writes) and how many API requests it
// makes while the customer is not doing anything. A settled screen should be close to zero during the idle window.
//
// installMeter(context) must run before the page loads; measureRoutes(page, routes) returns one row per route.

export async function installMeter(context) {
  await context.addInitScript(() => {
    const meter = { records: 0, added: 0, removed: 0, attributes: 0, text: 0, fetches: 0, fetchPaths: {}, lastMutationAt: 0 };
    window.__ffRenderMeter = meter;
    const start = () => {
      new MutationObserver(list => {
        meter.records += list.length;
        meter.lastMutationAt = performance.now();
        for (const record of list) {
          if (record.type === "childList") { meter.added += record.addedNodes.length; meter.removed += record.removedNodes.length; }
          else if (record.type === "attributes") meter.attributes += 1;
          else meter.text += 1;
        }
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    };
    if (document.documentElement) start(); else document.addEventListener("readystatechange", start, { once: true });
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = new URL(typeof input === "string" ? input : input.url, location.href);
        meter.fetches += 1;
        meter.fetchPaths[url.pathname] = (meter.fetchPaths[url.pathname] || 0) + 1;
      } catch (_) {}
      return originalFetch.apply(this, arguments);
    };
  });
}

const snapshot = page => page.evaluate(() => {
  const m = window.__ffRenderMeter;
  return m ? { records: m.records, added: m.added, removed: m.removed, attributes: m.attributes, text: m.text, fetches: m.fetches,
    fetchPaths: { ...m.fetchPaths }, lastMutationAt: m.lastMutationAt, now: performance.now() } : null;
});

const diff = (a, b) => {
  const paths = {};
  for (const [key, value] of Object.entries(b.fetchPaths)) {
    const delta = value - (a.fetchPaths[key] || 0);
    if (delta) paths[key] = delta;
  }
  return { records: b.records - a.records, added: b.added - a.added, removed: b.removed - a.removed,
    attributes: b.attributes - a.attributes, text: b.text - a.text, fetches: b.fetches - a.fetches, fetchPaths: paths };
};

// Loads each route fresh, lets it settle, then counts what still changes while nobody touches the page.
export async function measureRoutes(page, appUrl, routes, { settleMs = 4000, idleMs = 6000 } = {}) {
  const rows = [];
  for (const route of routes) {
    await page.goto(`${appUrl}#/${route}`, { waitUntil: "load" });
    const loaded = await snapshot(page);
    await page.waitForTimeout(settleMs);
    const settled = await snapshot(page);
    await page.waitForTimeout(idleMs);
    const idle = await snapshot(page);
    if (!loaded || !settled || !idle) { rows.push({ route, error: "meter not installed" }); continue; }
    const quietFor = Math.round(idle.now - idle.lastMutationAt);
    rows.push({ route: route.split("/")[0], settle: diff(loaded, settled), idle: diff(settled, idle), quietForMs: quietFor });
  }
  return rows;
}

export function printRows(label, rows) {
  console.log(`RENDER-STABILITY ${label}`);
  for (const row of rows) {
    if (row.error) { console.log(`  ${row.route}: ${row.error}`); continue; }
    const s = row.settle, i = row.idle;
    console.log(`  ${row.route.padEnd(14)} settle: ${String(s.records).padStart(6)} records ${String(s.added + s.removed).padStart(6)} nodes ${String(s.fetches).padStart(3)} fetches | idle 6s: ${String(i.records).padStart(6)} records ${String(i.added + i.removed).padStart(6)} nodes ${String(i.attributes).padStart(5)} attr ${String(i.text).padStart(5)} text ${String(i.fetches).padStart(3)} fetches ${JSON.stringify(i.fetchPaths)} | quiet ${row.quietForMs}ms`);
  }
  console.log(`RENDER-STABILITY-JSON ${label} ${JSON.stringify(rows)}`);
}
