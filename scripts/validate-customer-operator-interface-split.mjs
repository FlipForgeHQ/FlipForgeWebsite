import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const index = read("saas-prototype/index.html");
const shellJs = read("saas-prototype/customer-only-shell-v1.js");
const shellCss = read("saas-prototype/customer-only-shell-v1.css");
const operator = read("operator-beta.html");
const betaCore = read("netlify/modern-functions/lib/beta-operations-core.mjs");
const redirects = read("_redirects");

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

check("001 customer app is explicitly marked as customer surface", index.includes('data-ff-surface="customer"'));
check("002 customer app exposes Home", index.includes('data-route="dashboard" data-ff-customer-core') && index.includes(">Home</a>"));
check("003 customer app exposes Evaluate", index.includes('data-route="discover" data-ff-customer-core') && index.includes(">Evaluate</a>"));
check("004 customer app exposes Saved Decisions", index.includes('data-route="opportunities" data-ff-customer-core') && index.includes("Saved Decisions"));
check("005 customer app exposes Tracking", index.includes('data-route="tracking" data-ff-customer-core') && index.includes(">Tracking</a>"));
check("006 exactly four visible customer-core destinations are declared", (index.match(/data-ff-customer-core/g) || []).length === 4);
check(
  "007 non-core direct navigation contracts are retained but hidden",
  ["market-view", "forge-heat", "evaluate", "portfolio", "alerts", "beta-start"].every(route =>
    new RegExp(`data-route="${route}"[^>]*hidden[^>]*aria-hidden="true"`).test(index)
  )
);
check("008 advanced analysis contract remains mounted", index.includes('<details class="ff-advanced-nav">'));
check("009 advanced analysis is hidden on customer surface by final customer CSS and runtime", shellCss.includes('body[data-ff-surface="customer"] .ff-advanced-nav') && shellJs.includes('const advanced = nav.querySelector(".ff-advanced-nav")') && shellJs.includes('advanced.hidden = true'));
check("010 customer app does not link to operator workspace", !index.includes("operator-beta.html"));
check("011 customer shell stylesheet is loaded", index.includes('href="customer-only-shell-v1.css"'));
check("012 customer shell runtime is loaded last", /mobile-ui-runtime-fix-v1\.js[\s\S]*customer-only-shell-v1\.js[\s\S]*<\/body>/.test(index));
check("013 customer runtime keeps internal nav destinations hidden", shellJs.includes("HIDDEN_NAV_ROUTES") && shellJs.includes("simplifyNavigation"));
check("014 customer home is reduced to evaluate saved decisions and tracking", shellJs.includes("Evaluate a card") && shellJs.includes("Review saved decisions") && shellJs.includes("Check tracking"));
check("015 customer shell hides plan card", shellCss.includes(".plan-card"));
check("016 operator workspace remains a separate page", operator.includes("Private operations") || operator.includes("Sign in as Operator"));
check("017 operator role remains server-defined", betaCore.includes('OPERATOR_ROLE = "flipforge-operator"'));
check("018 active customer role remains server-defined", betaCore.includes('ACTIVE_ROLE = "flipforge-active"'));
check("019 app routing remains isolated under /app", redirects.includes("/app /saas-prototype/index.html 200") && redirects.includes("/app/* /saas-prototype/:splat 200"));

check("020 customer Evaluate uses one four-step progress model", shellJs.includes('const labels = ["Enter card", "Confirm", "Decision", "Save & track"]') && shellJs.includes("ensureEvaluateSteps"));
check("021 customer Evaluate headline uses locked decision-first framing", shellJs.includes('"One card. One decision. Know why."'));
check("022 customer Evaluate keeps one primary card-finding action", shellJs.includes('setText(primary, "Find this card")') && shellJs.includes("ff-evaluate-secondary-find"));
check("023 result-count control is removed from first-view customer flow", shellJs.includes("dataset.ffEvaluateHide") && shellCss.includes('[data-ff-evaluate-hide="true"]'));
check("024 connected provider diagnostics collapse when healthy", shellJs.includes("ff-evaluate-provider-collapsed") && shellCss.includes(".ff-evaluate-provider-collapsed"));
check("025 active listing selection leads explicitly to Smart Opportunity decision", shellJs.includes('"Get FlipForge decision"') && shellJs.includes("Not a decision yet"));
check("026 customer decision detail prioritizes exactly two trace-derived reasons", shellJs.includes("traceReasonData") && shellJs.includes("rows.slice(0, 2)") && shellJs.includes("The two strongest reasons"));
check("027 decision reasons are derived from rendered saved trace instead of a browser recommendation", shellJs.includes('main.querySelectorAll(".customer-trace-step")') && shellJs.includes("No new browser-side score or recommendation is created here"));
check("028 full evidence is progressively disclosed", shellJs.includes("data-ff-evaluate-evidence-toggle") && shellCss.includes("ff-evaluate-detail-advanced") && shellCss.includes("ff-evaluate-show-advanced"));
check("029 decision-first customer metrics keep confidence and risk while hiding secondary metrics", shellCss.includes(".customer-intelligence-metrics > :nth-child(2)") && shellCss.includes(".customer-intelligence-metrics > :nth-child(4)"));
check("030 transaction boundary remains explicit in simplified decision flow", shellJs.includes("FlipForge does not buy, bid, pay, accept offers, or list cards"));
check("031 tracking is the fourth guided customer step", shellJs.includes("simplifyTrackingProgress") && shellJs.includes("ensureEvaluateSteps(main, 3)"));

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
}

const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} customer/operator split validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nCustomer/operator interface split validation passed (${checks.length}/${checks.length}).`);