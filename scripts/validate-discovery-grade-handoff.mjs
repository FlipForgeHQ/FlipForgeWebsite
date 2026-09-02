import fs from "node:fs";
import vm from "node:vm";

const guardUrl = new URL("../saas-prototype/customer-discovery-request-guard.js", import.meta.url);
const guardSource = fs.readFileSync(guardUrl, "utf8");
const calls = [];
const listeners = new Map();
let resolveData = { grader: "PSA", grade: "9" };

class FakeElement {
  matches(selector) {
    return selector.includes('input[name="exactCardQuery"]');
  }
}

const document = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  querySelectorAll() {
    return [];
  }
};

function pathOf(input) {
  const raw = typeof input === "string" ? input : input?.url;
  return new URL(String(raw || ""), "https://goflipforge.com/app/").pathname;
}

async function originalFetch(input, init = {}) {
  calls.push({ path: pathOf(input), init: { ...init } });
  if (pathOf(input) === "/api/v1/card-intelligence/resolve") {
    return new Response(JSON.stringify({ data: { ...resolveData } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

const window = {
  location: { href: "https://goflipforge.com/app/#/discover" },
  fetch: originalFetch
};

vm.runInNewContext(guardSource, {
  window,
  document,
  Element: FakeElement,
  URL,
  JSON,
  Promise,
  Error,
  Response,
  console
});

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function bodyOf(call) {
  try { return JSON.parse(call?.init?.body || "{}"); } catch (_) { return {}; }
}

function invalidateInput() {
  const listener = listeners.get("input");
  if (listener) listener({ target: new FakeElement() });
}

async function identityAssistCycle({ query, resolved, canonical }) {
  invalidateInput();
  resolveData = resolved;
  await window.fetch("/api/v1/card-intelligence/search", {
    method: "POST",
    body: JSON.stringify({ query, limit: 12 })
  });
  await window.fetch("/api/v1/card-intelligence/resolve", {
    method: "POST",
    body: JSON.stringify({ selectionToken: "a".repeat(64) })
  });
  return window.fetch("/api/v1/discover", {
    method: "POST",
    body: JSON.stringify({ exactCardQuery: canonical, limit: 25, targetMaxBuyCents: 0 })
  });
}

await identityAssistCycle({
  query: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
  resolved: { grader: "PSA", grade: "9" },
  canonical: "2018 Topps Chrome Shohei Ohtani #150"
});
let discover = [...calls].reverse().find(call => call.path === "/api/v1/discover");
expect(bodyOf(discover).exactCardQuery === "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
  `server-confirmed PSA 9 was not restored into Discover: ${JSON.stringify(bodyOf(discover))}`);

await identityAssistCycle({
  query: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  resolved: { grader: "PSA", grade: "10" },
  canonical: "2018 Topps Chrome Shohei Ohtani #150"
});
discover = [...calls].reverse().find(call => call.path === "/api/v1/discover");
expect(bodyOf(discover).exactCardQuery === "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  "PSA 9 context leaked into the next PSA 10 identity-assist cycle");

const discoverCallsBeforeMismatch = calls.filter(call => call.path === "/api/v1/discover").length;
let mismatchRejected = false;
try {
  await identityAssistCycle({
    query: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
    resolved: { grader: "SGC", grade: "9" },
    canonical: "2018 Topps Chrome Shohei Ohtani #150"
  });
} catch (error) {
  mismatchRejected = /resolved slab grade did not match/i.test(String(error?.message || error));
}
expect(mismatchRejected, "resolver grader disagreement did not fail closed");
expect(calls.filter(call => call.path === "/api/v1/discover").length === discoverCallsBeforeMismatch,
  "wrong-grader resolver disagreement still reached the provider-backed Discover request");

invalidateInput();
await window.fetch("/api/v1/discover", {
  method: "POST",
  body: JSON.stringify({ exactCardQuery: "2018 Topps Chrome Shohei Ohtani #150", limit: 25, targetMaxBuyCents: 0 })
});
discover = [...calls].reverse().find(call => call.path === "/api/v1/discover");
expect(bodyOf(discover).exactCardQuery === "2018 Topps Chrome Shohei Ohtani #150",
  "a customer search with no declared grade inherited stale slab context");

console.log("PASS | Discover preserves only server-confirmed customer-declared slab grade context and fails closed on disagreement");
