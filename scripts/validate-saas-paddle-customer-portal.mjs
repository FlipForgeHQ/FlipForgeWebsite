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
  ["004 portal enhancer recognizes authenticated session and legacy handoffs", portalSource.includes('"PADDLE_AUTHENTICATED_SESSION"') && portalSource.includes('"PADDLE_MAGIC_LINK"')],
  ["005 authenticated handoff requires Paddle cpl path, overview action, and one token", portalSource.includes('/^\\/cpl_[a-z0-9]{26}$/') && portalSource.includes('getAll("action")') && portalSource.includes('getAll("token")')],
  ["006 portal enhancer rejects browser-side provider mutation", portalSource.includes("data.customerPlanChangeAllowed !== false")],
  ["007 authenticated URL token is not a separate field or cache", portalSource.includes("portal.portalSessionTokenIncludedAsSeparateField !== false") && portalSource.includes("portal.portalLinksCachedByFlipForge !== false")],
  ["008 portal enhancer requires payment handling outside FlipForge", portalSource.includes("portal.paymentCredentialsHandledByFlipForge !== false") && portalSource.includes("portal.billingChangesAppliedByFlipForge !== false")],
  ["009 portal enhancer requires zero transaction authority", portalSource.includes("portal.transactionAuthority !== false") && portalSource.includes("data.transactionAuthority === false")],
  ["010 portal enhancer contains no Paddle server API or webhook secret", !/FLIPFORGE_PADDLE_(?:API_KEY|WEBHOOK_SECRET|CUSTOMER_PORTAL_API_KEY)/.test(portalSource)],
  ["011 portal enhancer contains no tenant identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(portalSource)],
  ["012 existing checkout adapter remains separate", entitlements.includes('CHECKOUT_PATH = "/api/v1/billing/paddle/checkout"') && !portalSource.includes("/api/v1/billing/paddle/webhook")],
  ["013 temporary Paddle URL is never written into the rendered href", portalSource.includes('href="#" data-paddle-portal-link') && !portalSource.includes('href="${escapeHtml(handoff.url)}"')],
  ["014 billing click refreshes entitlements before immediate navigation", portalSource.includes("const fresh = await fetchPortalHandoff()") && portalSource.includes("window.location.assign(fresh.url)")]
].forEach(([name, condition]) => check(name, condition));

class FakeMutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
}

const fakeWindow = {
  location: {
    hostname: "deploy-preview-50--goflipforge.netlify.app",
    hash: "#/account",
    assign() {}
  },
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
const sessionId = `cpl_${"c".repeat(26)}`;
const authenticatedSandboxUrl = `https://sandbox-customer-portal.paddle.com/${sessionId}?action=overview&token=temporary-session-token`;
const authenticatedLiveUrl = `https://customer-portal.paddle.com/${sessionId}?action=overview&token=temporary-session-token`;

check("020 legacy sandbox portal URL validates", Boolean(api.validatedPortalUrl(sandboxUrl)));
check("021 legacy live portal URL validates", Boolean(api.validatedPortalUrl(liveUrl)));
check("022 authenticated sandbox portal URL validates", api.validatedPortalUrl(authenticatedSandboxUrl) === authenticatedSandboxUrl);
check("023 authenticated live portal URL validates", api.validatedPortalUrl(authenticatedLiveUrl) === authenticatedLiveUrl);
check("024 arbitrary HTTPS host is rejected", api.validatedPortalUrl("https://evil.example/portal") === null);
check("025 arbitrary query on legacy Paddle URL is rejected", api.validatedPortalUrl(`${sandboxUrl}?token=secret`) === null);
check("026 authenticated URL requires overview action", api.validatedPortalUrl(`https://sandbox-customer-portal.paddle.com/${sessionId}?action=other&token=temporary`) === null);
check("027 authenticated URL requires exactly one token", api.validatedPortalUrl(`https://sandbox-customer-portal.paddle.com/${sessionId}?action=overview&token=one&token=two`) === null);
check("028 fragment Paddle portal URL is rejected", api.validatedPortalUrl(`${authenticatedSandboxUrl}#secret`) === null);
check("029 userinfo Paddle portal URL is rejected", api.validatedPortalUrl(`https://user@sandbox-customer-portal.paddle.com/${sessionId}?action=overview&token=temporary`) === null);
check("030 HTTP Paddle portal URL is rejected", api.validatedPortalUrl(`http://sandbox-customer-portal.paddle.com/${sessionId}?action=overview&token=temporary`) === null);

function envelope({ authenticated = false, customerPortal = {}, ...overrides } = {}) {
  const basePortal = authenticated ? {
    available: true,
    provider: "PADDLE",
    environment: "SANDBOX",
    url: authenticatedSandboxUrl,
    authentication: "PADDLE_AUTHENTICATED_SESSION",
    providerHosted: true,
    temporaryAuthenticatedUrl: true,
    portalSessionTokenIncluded: true,
    portalSessionTokenIncludedAsSeparateField: false,
    providerCustomerIdIncluded: false,
    providerApiKeyIncluded: false,
    portalLinksCachedByFlipForge: false,
    paymentCredentialsHandledByFlipForge: false,
    billingChangesAppliedByFlipForge: false,
    verifiedWebhookRequiredForEntitlementChanges: true,
    transactionAuthority: false
  } : {
    available: true,
    provider: "PADDLE",
    environment: "SANDBOX",
    url: sandboxUrl,
    authentication: "PADDLE_MAGIC_LINK",
    providerHosted: true,
    temporaryAuthenticatedUrl: false,
    portalSessionTokenIncluded: false,
    portalLinksCachedByFlipForge: false,
    paymentCredentialsHandledByFlipForge: false,
    billingChangesAppliedByFlipForge: false,
    transactionAuthority: false
  };
  return {
    data: {
      customerBillingManagementAllowed: true,
      providerHostedSubscriptionManagementAvailable: true,
      customerPlanChangeAllowed: false,
      transactionAuthority: false,
      customerPortal: { ...basePortal, ...customerPortal },
      ...overrides
    }
  };
}

check("040 legacy provider-managed portal contract remains accepted", api.portalHandoff(envelope())?.authenticatedSession === false);
check("041 authenticated provider-managed portal contract is accepted", api.portalHandoff(envelope({ authenticated: true }))?.authenticatedSession === true);
check("042 unavailable portal contract is rejected", api.portalHandoff(envelope({ customerPortal: { available: false } })) === null);
check("043 wrong provider is rejected", api.portalHandoff(envelope({ customerPortal: { provider: "OTHER" } })) === null);
check("044 wrong authentication mode is rejected", api.portalHandoff(envelope({ customerPortal: { authentication: "TOKEN" } })) === null);
check("045 authenticated URL must declare embedded session token", api.portalHandoff(envelope({ authenticated: true, customerPortal: { portalSessionTokenIncluded: false } })) === null);
check("046 separate portal token field is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { portalSessionTokenIncludedAsSeparateField: true } })) === null);
check("047 provider customer id exposure is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { providerCustomerIdIncluded: true } })) === null);
check("048 provider API key exposure is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { providerApiKeyIncluded: true } })) === null);
check("049 cached portal link is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { portalLinksCachedByFlipForge: true } })) === null);
check("050 FlipForge billing mutation authority is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { billingChangesAppliedByFlipForge: true } })) === null);
check("051 customer plan mutation authority is rejected", api.portalHandoff(envelope({ authenticated: true, customerPlanChangeAllowed: true })) === null);
check("052 portal transaction authority is rejected", api.portalHandoff(envelope({ authenticated: true, customerPortal: { transactionAuthority: true } })) === null);
check("053 non-Paddle URL is rejected even when flags are true", api.portalHandoff(envelope({ authenticated: true, customerPortal: { url: "https://evil.example/portal" } })) === null);
check("054 tokenized URL cannot masquerade as legacy magic-link handoff", api.portalHandoff(envelope({ customerPortal: { url: authenticatedSandboxUrl } })) === null);
check("055 static URL cannot masquerade as authenticated session handoff", api.portalHandoff(envelope({ authenticated: true, customerPortal: { url: sandboxUrl } })) === null);

const failures = results.filter(result => !result.passed);
console.log("SaaSPaddleCustomerPortalBrowserValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
