import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const owner = read("owner.html");
const ownerJs = read("assets/js/owner-hub.js");
const ownerCss = read("assets/css/owner-hub.css");
const customerGate = read("assets/js/owner-customer-gate.js");
const customer = read("saas-prototype/customer.html");
const identity = read("scripts/lib/flipforge-identity-client.mjs");
const operator = read("operator-beta.html");
const redirects = read("_redirects");
const netlify = read("netlify.toml");
const publicHome = read("index.html");
const platformStatus = read("platform-status.html");

const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);

check("001 Owner Hub is noindex", owner.includes('name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"'));
check("002 Owner Hub uses current locked brand language", owner.includes("CARD DECISION INTELLIGENCE") && owner.includes("Before you buy. Know Why."));
check("003 Owner Hub requires operator identity before workspace reveal", ownerJs.includes("identity.authenticated && identity.operatorActive") && owner.includes("data-owner-workspace hidden"));
check("004 Owner Hub exposes Private Beta", owner.includes('href="/app/beta/#/beta-start"') && owner.includes(">Private Beta<"));
check("005 Owner Hub exposes customer owner preview", owner.includes('href="/owner/customer/#/dashboard"') && owner.includes("Customer Experience"));
check("006 Owner Hub exposes Beta Operations", owner.includes('href="/operator-beta.html"'));
check("007 Owner Hub exposes public site without exposing owner nav there", owner.includes('href="/"') && !publicHome.includes('href="/owner"') && !publicHome.includes("Owner Hub"));
check("008 hosted SaaS explicitly has no DEV mode", owner.includes("No DEV mode exists in hosted SaaS") && !owner.includes("DEV Customer"));
check("009 Owner Hub describes exactly two SaaS product experiences", owner.includes("Private Beta · Customer") && owner.includes("two product experiences only"));
check("010 owner identity route is interactive on production", identity.includes("PRODUCTION_OPERATOR_PATH") && identity.includes("owner") && identity.includes("customer"));
check("011 customer preview route keeps raw production customer hidden until gate", customer.includes("ffOwnerCustomerPath") && customer.includes('document.documentElement.style.visibility = "hidden"'));
check("012 raw customer page still rejects ordinary production access", customer.includes('if (!ffOwnerCustomerPath) window.location.replace("/")'));
check("013 owner customer gate is operator-only", customerGate.includes("snapshot.operatorActive") && customerGate.includes('window.location.replace("/owner")'));
check("013b owner customer gate waits for identity readiness before denying", customerGate.includes("snapshot.ready !== true") && customerGate.indexOf("snapshot.ready !== true") < customerGate.indexOf("!snapshot.authenticated"));
check("013c identity snapshot reports readiness only after the first session lookup", read("scripts/lib/flipforge-identity-client.mjs").includes("ready: Boolean(state.ready)") && read("scripts/lib/flipforge-identity-client.mjs").includes("state.ready = true;\n  publishIdentityChange();"));
check("014 owner customer mode banner is unmistakable", customerGate.includes("OWNER PREVIEW · CUSTOMER") && customerGate.includes("Real customer SaaS surface · not public"));
check("015 customer owner preview uses same real customer document", redirects.includes("/owner/customer /saas-prototype/customer.html 200") && redirects.includes("/owner/customer/* /saas-prototype/:splat 200"));
check("016 public customer route remains unpublished", !redirects.includes("/app/customer /saas-prototype/customer.html 200") && !redirects.includes("/app/customer/* /saas-prototype/:splat 200"));
check("017 Owner Hub has no public redirect or marketing CTA", !publicHome.includes("/owner") && !owner.includes("Request Beta Access"));
check("018 operator page returns to Owner Hub", operator.includes('href="/owner">Owner Hub</a>') && !operator.includes('href="/app/#/dashboard">Customer App</a>'));
check("019 owner routes are no-store and noindex", netlify.includes('for = "/owner"') && netlify.includes('X-Robots-Tag = "noindex, nofollow, noarchive, nosnippet"') && netlify.includes('for = "/owner/customer/*"'));
check("020 Owner Hub responsive stylesheet exists", ownerCss.includes("@media(max-width:820px)") && ownerCss.includes(".ff-owner-grid"));
check("021 public platform status uses only Private Beta + Customer model", platformStatus.includes("One engine · Private Beta + Customer") && platformStatus.includes("Private Beta + Customer") && !platformStatus.includes("Beta + DEV") && !platformStatus.includes("DEV Mode"));
check("022 routing comments do not describe a hosted DEV customer", !redirects.includes("DEV-only") && redirects.includes("owner-only Customer preview uses /owner/customer"));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
console.log(`OwnerHubValidation: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
