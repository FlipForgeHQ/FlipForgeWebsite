import fs from "node:fs";

const indexUrl = new URL("../saas-prototype/index.html", import.meta.url);
const customerUrl = new URL("../saas-prototype/customer.html", import.meta.url);
const betaFlowUrl = new URL("../saas-prototype/beta-customer-flow-v2.js", import.meta.url);
const stagingRouteUrl = new URL("../saas-prototype/staging-route-hook.js", import.meta.url);
const professionalPolishUrl = new URL("../saas-prototype/customer-professional-polish.js", import.meta.url);
const routeOwnershipUrl = new URL("../saas-prototype/customer-route-ownership-v1.js", import.meta.url);
const marker = '  <script src="customer-discovery.js"></script>';
const guard = '  <script src="customer-discovery-request-guard.js"></script>';
let source = fs.readFileSync(indexUrl, "utf8");

if (!source.includes(marker)) {
  throw new Error("customer-discovery.js script marker is missing from the SaaS app shell.");
}
if (!source.includes(guard)) {
  source = source.replace(marker, `${guard}\n${marker}`);
  fs.writeFileSync(indexUrl, source, "utf8");
}

// The full customer app has many compatibility/presentation listeners. Its
// route-ownership guard must execute last so recovery runs after those layers
// instead of competing with them. Private beta keeps the dynamic loader.
let customer = fs.readFileSync(customerUrl, "utf8");
const customerParityMarker = '  <script src="customer-navigation-parity-v1.js"></script>';
const lateOwnershipScript = '  <script src="customer-route-ownership-v1.js?v=20260915-2" data-ff-customer-route-ownership-last></script>';
if (!customer.includes(customerParityMarker)) {
  throw new Error("Full customer navigation parity marker is missing.");
}
if (!customer.includes(lateOwnershipScript)) {
  customer = customer.replace(customerParityMarker, `${customerParityMarker}\n${lateOwnershipScript}`);
  fs.writeFileSync(customerUrl, customer, "utf8");
}

let stagingRoute = fs.readFileSync(stagingRouteUrl, "utf8");
const routeOwnerAnchor = '  "use strict";';
const routeOwnerMarker = '  window.__ffStagingRouteHookOwnsDiscover = true;';
if (!stagingRoute.includes(routeOwnerMarker)) {
  if (!stagingRoute.includes(routeOwnerAnchor)) {
    throw new Error("Staging route-hook ownership marker target was not found.");
  }
  stagingRoute = stagingRoute.replace(routeOwnerAnchor, `${routeOwnerAnchor}\n\n${routeOwnerMarker}`);
  fs.writeFileSync(stagingRouteUrl, stagingRoute, "utf8");
}

let professionalPolish = fs.readFileSync(professionalPolishUrl, "utf8");
const professionalDiscoverAnchor = '  function scheduleCustomerDiscover() {\n    if (routeName() !== "discover" || discoverRenderPending) return;';
const professionalDiscoverSingleOwner = '  function scheduleCustomerDiscover() {\n    if (window.__ffStagingRouteHookOwnsDiscover === true) return;\n    if (routeName() !== "discover" || discoverRenderPending) return;';
if (!professionalPolish.includes(professionalDiscoverSingleOwner)) {
  if (!professionalPolish.includes(professionalDiscoverAnchor)) {
    throw new Error("Customer polish Discover fallback target was not found.");
  }
  professionalPolish = professionalPolish.replace(professionalDiscoverAnchor, professionalDiscoverSingleOwner);
  fs.writeFileSync(professionalPolishUrl, professionalPolish, "utf8");
}

let routeOwnership = fs.readFileSync(routeOwnershipUrl, "utf8");
const ownershipAnchor = '  function pageOwnershipMatches() {\n    const route = routeName();';
const ownershipSingleOwner = '  function pageOwnershipMatches() {\n    const route = routeName();\n    if (route === "discover" && window.__ffStagingRouteHookOwnsDiscover === true) return true;';
if (!routeOwnership.includes(ownershipSingleOwner)) {
  if (!routeOwnership.includes(ownershipAnchor)) {
    throw new Error("Customer route-ownership Discover target was not found.");
  }
  routeOwnership = routeOwnership.replace(ownershipAnchor, ownershipSingleOwner);
}

// A full-customer nav link can be normalized between pointerdown and click while
// compatibility/presentation observers settle after reload. Record the intended
// route before that churn and complete the same plain-left activation on pointerup
// if needed. This does not prevent default behavior, does not own rendering, and
// ignores drags, modified clicks, and cancelled pointers. Keyboard activation is
// still handled by the normal click listener below.
const pointerIntentMarker = '  let pendingPointerRouteIntent = null;';
if (!routeOwnership.includes(pointerIntentMarker)) {
  const pointerIntentAnchor = '  // Observe explicit route intent at the window capture boundary.';
  if (!routeOwnership.includes(pointerIntentAnchor)) {
    throw new Error("Customer route-ownership pointer intent target was not found.");
  }
  const pointerIntentBlock = `  let pendingPointerRouteIntent = null;

  window.addEventListener("pointerdown", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (!href) return;
    pendingPointerRouteIntent = {
      hash: href,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    rememberExplicitIntent(href);
  }, true);

  window.addEventListener("pointercancel", event => {
    if (!pendingPointerRouteIntent || event.pointerId !== pendingPointerRouteIntent.pointerId) return;
    pendingPointerRouteIntent = null;
  }, true);

  window.addEventListener("pointerup", event => {
    const pending = pendingPointerRouteIntent;
    if (!pending || event.pointerId !== pending.pointerId) return;
    pendingPointerRouteIntent = null;
    if (!plainLeftClick(event)) return;
    const distance = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
    if (distance > 12) return;
    enforceExplicitIntentAfterClick(pending.hash);
  }, true);

`;
  routeOwnership = routeOwnership.replace(pointerIntentAnchor, `${pointerIntentBlock}${pointerIntentAnchor}`);
}
fs.writeFileSync(routeOwnershipUrl, routeOwnership, "utf8");

let betaFlow = fs.readFileSync(betaFlowUrl, "utf8");
const rawSetHtml = `  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }`;
const stableSetHtml = `  function setHtml(node, value) {
    if (!node) return;
    const template = document.createElement("template");
    template.innerHTML = value;
    const normalized = template.innerHTML;
    if (node.innerHTML !== normalized) node.innerHTML = normalized;
  }`;

if (betaFlow.includes(rawSetHtml)) betaFlow = betaFlow.replace(rawSetHtml, stableSetHtml);
if (!betaFlow.includes(stableSetHtml)) {
  throw new Error("Stable beta-flow HTML renderer transformation failed.");
}

const decisionButton = '<button type="button" class="button button-primary" data-ff-show-why>Show me why →</button>';
const decisionLink = '<a class="button button-primary" data-ff-show-why data-ff-native-evidence-link="" href="#/evidence/${id}">Show me why →</a>';
const savedButton = '<button class="button button-primary" type="button" data-ff-show-why>Understand this decision →</button>';
const savedLink = '<a class="button button-primary" data-ff-show-why data-ff-native-evidence-link="" href="#/evidence/${id}">Understand this decision →</a>';

if (betaFlow.includes(decisionButton)) betaFlow = betaFlow.replace(decisionButton, decisionLink);
if (betaFlow.includes(savedButton)) betaFlow = betaFlow.replace(savedButton, savedLink);
if (!betaFlow.includes(decisionLink) || !betaFlow.includes(savedLink)) {
  throw new Error("Stable Decision Intelligence evidence-link transformation failed.");
}
fs.writeFileSync(betaFlowUrl, betaFlow, "utf8");

console.log("Injected Discover request guard, enforced single route ownership, preserved pointer route intent across nav churn, loaded the full-customer ownership guard last, normalized beta-flow HTML rendering, and stabilized Decision Intelligence evidence actions.");
