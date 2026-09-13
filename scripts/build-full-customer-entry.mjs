import fs from "node:fs";

const sourcePath = "saas-prototype/index.html";
const outputPath = "saas-prototype/customer-index.html";
let html = fs.readFileSync(sourcePath, "utf8");

const replaceRequired = (from, to, label) => {
  if (!html.includes(from)) throw new Error(`Full customer entry build could not find ${label}`);
  html = html.replace(from, to);
};

replaceRequired(
  '<html lang="en">',
  '<html lang="en" class="ff-full-customer-app">',
  "root html element"
);
replaceRequired(
  '<meta name="description" content="FlipForge private-beta card decision intelligence platform.">',
  '<meta name="description" content="FlipForge customer app for Card Decision Intelligence: discover, evaluate, understand, save, and track sports-card decisions.">\n  <meta name="ff-customer-entry" content="full-customer">',
  "customer meta description"
);
replaceRequired(
  '<title>FlipForge | Card Decision Intelligence</title>',
  '<title>FlipForge | Customer App — Card Decision Intelligence</title>',
  "customer document title"
);
replaceRequired(
  '<body data-ff-surface="customer">',
  '<body data-ff-surface="customer" class="ff-full-customer-app">',
  "customer body"
);

const banner = `  <div class="prototype-banner" role="status">\n    <strong>PRIVATE BETA</strong>\n    <span>Customer experience · Card decision intelligence · No transaction authority</span>\n  </div>\n\n`;
replaceRequired(banner, "", "private beta banner");
replaceRequired(
  '<span class="prototype-chip">CUSTOMER BETA</span>',
  '<span class="prototype-chip">CUSTOMER APP</span>',
  "customer app chip"
);
replaceRequired(
  '<small>Plan state and evaluation usage are server-owned. Paid access is not active during private beta.</small>',
  '<small>Plan state and evaluation usage are loaded from your account.</small>',
  "beta plan copy"
);
html = html.replaceAll('<small>Private beta</small>', '<small>Customer</small>');

for (const stylesheet of ["private-beta.css", "beta-customer-flow-v2.css", "beta-session-v1.css"]) {
  html = html.replace(`  <link rel="stylesheet" href="${stylesheet}">\n`, "");
}
for (const script of ["private-beta.js", "beta-customer-flow-v2.js", "beta-session-v1.js"]) {
  html = html.replace(`  <script src="${script}"></script>\n`, "");
}

if (html.includes('<strong>PRIVATE BETA</strong>')) throw new Error("Full customer entry still contains the beta banner");
if (html.includes('class="prototype-chip">CUSTOMER BETA')) throw new Error("Full customer entry still contains the beta chip");
if (!html.includes('class="prototype-chip">CUSTOMER APP')) throw new Error("Full customer entry is missing CUSTOMER APP identity");
if (!html.includes('class="ff-full-customer-app"')) throw new Error("Full customer entry is missing full-customer root state");
if (html.includes('<script src="private-beta.js"></script>')) throw new Error("Full customer entry still loads private-beta.js");
if (html.includes('<script src="beta-customer-flow-v2.js"></script>')) throw new Error("Full customer entry still loads beta-customer-flow-v2.js");
if (html.includes('<script src="beta-session-v1.js"></script>')) throw new Error("Full customer entry still loads beta-session-v1.js");

fs.writeFileSync(outputPath, html);
console.log(`Built ${outputPath} from ${sourcePath}`);
