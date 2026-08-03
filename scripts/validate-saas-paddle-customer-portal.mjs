import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const portalSource = read("saas-prototype/customer-billing-portal.js");
const index = read("saas-prototype/index.html");
const entitlements = read("saas-prototype/customer-entitlements.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 portal enhancer is loaded after customer entitlements", index.indexOf('src="customer-billing-portal.js"') > index.indexOf('src="customer-entitlements.js"')],
  ["002 portal enhancer uses existing entitlements GET only", portalSource.includes('ENTITLEMENTS_PATH = "/api/v1/entitlements"') && portalSource.includes('method: "GET"')],
  ["003 portal enhancer accepts exact Paddle portal hosts", portalSource.includes('"sandbox-customer-portal.paddle.com"') && portalSource.includes('"customer-portal.paddle.com"')],
  ["004 portal enhancer requires magic-link provider contract", portalSource.includes('portal.authentication !== "PADDLE_MAGIC_LINK"')],
  ["005 portal enhancer rejects tokenized portal URLs", portalSource.includes("parsed.search")],
  ["006 portal enhancer rejects browser-side provider mutation", portalSource.includes("data.customerPlanChangeAllowed !== false")],
  ["007 portal enhancer requires no portal token caching", portalSource.includes("portal.portalSessionTokenIncluded !== false") && portalSource.includes("portal.portalLinksCachedByFlipForge !== false")],
  ["008 portal enhancer requires payment handling outside FlipForge", portalSource.includes("portal.paymentCredentialsHandledByFlipForge !== false") && portalSource.includes("portal.billingChangesAppliedByFlipForge !== false")],
  ["009 portal enhancer requires zero transaction authority", portalSource.includes("portal.transactionAuthority !== false") && portalSource.includes("data.transactionAuthority === false")],
  ["010 portal enhancer contains no Paddle API or webhook secret", !/FLIPFORGE_PADDLE_(?:API_KEY|WEBHOOK_SECRET|CUSTOMER_PORTAL_URL)/.test(portalSource)],
  ["011 portal enhancer contains no tenant identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(portalSource)],
  ["012 existing checkout adapter remains separate", entitlements.includes('CHECKOUT_PATH = "/api/v1/billing/paddle/checkout"') && !portalSource.includes("/api/v1/billing/paddle/webhook")]
].forEach(([name, condition]) => check(name, condition));

class FakeMutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
}

const fakeWindow = {
  location: { hostname: "deploy-preview-45--goflipforge.netlify.app", hash: "#/account" },
  crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
  addEventListener() {},
  setTimeout() { return 0; }
};
const fakeDocument = {
  documentElement: {},
  querySelector() { return null; },
  createElement() { return {}; }
};
const context = vm.createContext({
  window: fakeWindow,
  document: fakeDocument,
  MutationObserver: FakeMutationObserver,
  URL,
  JSON,
  Object,
  String,
  Boolean,
  Set,
  Error,
  Math,
  Date,
  console,
  fetch: async () => { throw new Error("fetch should not run in helper validation"); }
});
vm.runInContext(portalSource, context, { filename: "customer-billing-portal.js" });
const api = fakeWindow.FlipForgeCustomerBillingPortal;

const sandboxUrl = "https://sandbox-customer-portal.paddle.com/flipforge";
const liveUrl = "https://customer-portal.paddle.com/flipforge";
check("013 sandbox portal URL validates", api.validatedPortalUrl(sandboxUrl) === `${sandboxUrl}` || api.validatedPortalUrl(sandboxUrl) === `${sandboxUrl}/`);
check("014 live portal URL validates", Boolean(api.validatedPortalUrl(liveUrl)));
check("015 arbitrary HTTPS host is rejected", api.validatedPortalUrl("https://evil.example/portal") === null);
check("016 query-tokenized Paddle portal URL is rejected", api.validatedPortalUrl(`${sandboxUrl}?token=secret`) === null);
check("017 fragment Paddle portal URL is rejected", api.validatedPortalUrl(`${sandboxUrl}#secret`) === null);
check("018 userinfo Paddle portal URL is rejected", api.validatedPortalUrl("https://user@sandbox-customer-portal.paddle.com/flipforge") === null);
check("019 HTTP Paddle portal URL is rejected", api.validatedPortalUrl("http://sandbox-customer-portal.paddle.com/flipforge") === null);

function envelope(overrides = {}) {
  return {
    data: {
      customerBillingManagementAllowed: true,
      providerHostedSubscriptionManagementAvailable: true,
      customerPlanChangeAllowed: false,
      transactionAuthority: false,
      customerPortal: {
        available: true,
        provider: "PADDLE",
        environment: "SANDBOX",
        url: sandboxUrl,
        authentication: "PADDLE_MAGIC_LINK",
        providerHosted: true,
        portalSessionTokenIncluded: false,
        portalLinksCachedByFlipForge: false,
        paymentCredentialsHandledByFlipForge: false,
        billingChangesAppliedByFlipForge: false,
        transactionAuthority: false,
        ...(overrides.customerPortal || {})
      },
      ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "customerPortal"))
    }
  };
}

check("020 valid provider-managed portal contract is accepted", api.portalHandoff(envelope())?.environment === "SANDBOX");
check("021 unavailable portal contract is rejected", api.portalHandoff(envelope({ customerPortal: { available: false } })) === null);
check("022 wrong provider is rejected", api.portalHandoff(envelope({ customerPortal: { provider: "OTHER" } })) === null);
check("023 wrong authentication mode is rejected", api.portalHandoff(envelope({ customerPortal: { authentication: "TOKEN" } })) === null);
check("024 session token inclusion is rejected", api.portalHandoff(envelope({ customerPortal: { portalSessionTokenIncluded: true } })) === null);
check("025 cached portal link is rejected", api.portalHandoff(envelope({ customerPortal: { portalLinksCachedByFlipForge: true } })) === null);
check("026 FlipForge billing mutation authority is rejected", api.portalHandoff(envelope({ customerPortal: { billingChangesAppliedByFlipForge: true } })) === null);
check("027 customer plan mutation authority is rejected", api.portalHandoff(envelope({ customerPlanChangeAllowed: true })) === null);
check("028 portal transaction authority is rejected", api.portalHandoff(envelope({ customerPortal: { transactionAuthority: true } })) === null);
check("029 non-Paddle URL is rejected even when flags are true", api.portalHandoff(envelope({ customerPortal: { url: "https://evil.example/portal" } })) === null);

const failures = results.filter(result => !result.passed);
console.log("SaaSPaddleCustomerPortalBrowserValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
