import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, content) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const brand = readJson("marketing/content/brand.json");
const positioning = readJson("marketing/content/positioning.json");
const cdi = readJson("marketing/content/decision-intelligence.json");
const product = readJson("marketing/content/product-messaging.json");
const audiences = readJson("marketing/content/audience-messaging.json");
const disclaimers = readJson("marketing/content/disclaimers.json");
const proof = readJson("marketing/content/proof-points.json");
const campaigns = readJson("marketing/content/campaigns.json");
const docs = readJson("marketing/content/documents.json").documents;
const documentShell = read("marketing/templates/document-shell.html");
const previewShell = read("marketing/templates/preview-shell.html");

const section = (number, title, intro, body) => `
<section class="ff-mkt-section" data-section="${escapeHtml(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">
  <header class="ff-mkt-section-head"><span class="ff-mkt-section-num">${String(number).padStart(2, "0")}</span><div><h2>${escapeHtml(title)}</h2>${intro ? `<p class="ff-mkt-section-intro">${escapeHtml(intro)}</p>` : ""}</div></header>
  ${body}
</section>`;

function hero(doc) {
  return `<section class="ff-mkt-hero">
    <div><span class="ff-mkt-kicker">${escapeHtml(doc.eyebrow)}</span><h1>${escapeHtml(doc.headline)}</h1><p>${escapeHtml(doc.summary)}</p></div>
    <aside class="ff-mkt-hero-aside"><span>${escapeHtml(brand.category)}</span><strong>${escapeHtml(cdi.coreQuestion)}</strong><p>${escapeHtml(brand.publicPosition)}</p></aside>
  </section>`;
}

function renderProblem() {
  return section(1, "The problem", "More information does not automatically produce a better decision.", `<div class="ff-mkt-grid">
    <article class="ff-mkt-card"><b>01</b><h3>Identity can be wrong</h3><p>Wrong parallels, grades, variations, and listing contexts can make a clean-looking comparison invalid.</p></article>
    <article class="ff-mkt-card"><b>02</b><h3>Evidence can be noisy</h3><p>${escapeHtml(positioning.problem)}</p></article>
    <article class="ff-mkt-card"><b>03</b><h3>A price is not a decision</h3><p>Cost, liquidity, uncertainty, seller quality, grading context, and missing evidence still change what action is defensible.</p></article>
  </div>`);
}

function renderMarketGaps() {
  return section(2, "Where the trust gap lives", "FlipForge is designed around the places where sports-card decisions most often become fragile.", `<div class="ff-mkt-grid">
    ${["A confident comp can still be the wrong card.","Five repeated records do not become five independent facts.","A discount can vanish when invalid evidence is removed.","A strong grade does not eliminate market or seller risk.","A prediction without a receipt cannot be audited later.","An outcome should add context without rewriting the original decision."].map((copy,index)=>`<article class="ff-mkt-card"><b>${String(index+1).padStart(2,"0")}</b><h3>${index < 2 ? "Evidence problem" : index < 4 ? "Decision problem" : "Trust problem"}</h3><p>${escapeHtml(copy)}</p></article>`).join("")}
  </div>`);
}

function renderSolution() {
  return section(2, "The FlipForge answer", positioning.promise, `<div class="ff-mkt-callout"><div><strong>${escapeHtml(positioning.categoryStatement)}</strong><p>${escapeHtml(positioning.differentiator)}</p></div><span class="ff-mkt-kicker">${escapeHtml(brand.slogan)}</span></div>
  <div class="ff-mkt-grid" style="margin-top:16px">${positioning.notA.map((item,index)=>`<article class="ff-mkt-card"><b>NOT ${String(index+1).padStart(2,"0")}</b><h3>${escapeHtml(item)}</h3><p>FlipForge is built to support a governed decision, not replace it with this category.</p></article>`).join("")}</div>`);
}

function renderDecisionStates() {
  return section(3, "Four decisions. Clear meaning.", "The same decision vocabulary is used across the customer product and marketing system.", `<div class="ff-mkt-states">${Object.entries(positioning.decisionStates).map(([state,copy])=>`<article class="ff-mkt-state" data-state="${state}"><strong>${state}</strong><p>${escapeHtml(copy)}</p></article>`).join("")}</div>`);
}

function renderProofPoints() {
  return section(4, "What makes the decision defensible", "FlipForge is designed to preserve the difference between what is known, what is excluded, and what still needs verification.", `<div class="ff-mkt-grid">${proof.proofPoints.map((item,index)=>`<article class="ff-mkt-card"><span class="ff-mkt-card-number">${String(index+1).padStart(2,"0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.copy)}</p></article>`).join("")}</div>`);
}

function renderSevenLayers() {
  return section(5, "Seven layers of Card Decision Intelligence™", "Each layer answers a different question. No single price, score, or grade is allowed to stand in for the whole decision.", `<div class="ff-mkt-layers">${cdi.layers.map(layer=>`<article class="ff-mkt-layer" data-cdi-layer="${escapeHtml(layer.key)}"><span class="ff-mkt-layer-num">${escapeHtml(layer.number)}</span><div><h3>${escapeHtml(layer.name)}</h3><strong>${escapeHtml(layer.question)}</strong><p>${escapeHtml(layer.publicCopy)}</p></div></article>`).join("")}</div>`);
}

function renderAudience(doc) {
  const wanted = doc.audience === "dealer" ? ["dealer","flipper"] : doc.audience === "collector" ? ["collector","investor"] : audiences.audiences.map(a=>a.key);
  const matches = audiences.audiences.filter(a=>wanted.includes(a.key));
  return section(2, "Built for the decision you actually face", "Different users have different stakes. The decision structure stays consistent.", `<div class="ff-mkt-grid">${matches.map((item,index)=>`<article class="ff-mkt-card"><b>${String(index+1).padStart(2,"0")}</b><h3>${escapeHtml(item.name)}</h3><p><strong>${escapeHtml(item.pain)}</strong></p><p style="margin-top:10px">${escapeHtml(item.value)}</p><p style="margin-top:10px;color:var(--ff-gold-soft)">${escapeHtml(item.cta)}</p></article>`).join("")}</div>`);
}

function renderDecisionReceipt() {
  return section(6, "The Decision Receipt", "A recommendation is more useful when the evidence and reasoning can be inspected later.", `<div class="ff-mkt-callout"><div><strong>Do not just tell me VERIFY. Show me why.</strong><p>The Decision Receipt preserves the exact-card identity, accepted evidence, excluded evidence, uncertainty, supported economics, decision state, and next action that existed when the decision was made.</p></div><span class="ff-mkt-kicker">TRACEABLE BY DESIGN</span></div>`);
}

function renderOutcomes() {
  return section(7, "Outcome Intelligence", "What happened next should inform future judgment without rewriting what FlipForge knew at the start.", `<div class="ff-mkt-story">${[
    ["T0","Lock the original decision and receipt."],
    ["T7","Review meaningful evidence and market changes."],
    ["T14","Check whether the original reasoning still holds."],
    ["T30","Record the governed outcome context."],
    ["LEARN","Use outcomes to improve the system without changing history."]
  ].map(([label,copy])=>`<article class="ff-mkt-story-step"><b>${label}</b><p>${escapeHtml(copy)}</p></article>`).join("")}</div>`);
}

function renderDealOrDecoy() {
  const campaign = campaigns.campaigns.find(item=>item.key === "deal-or-decoy");
  return section(3, "Deal or Decoy: 24% → 2.3%", campaign.hook, `<div class="ff-mkt-story">${campaign.story.slice(0,5).map((copy,index)=>`<article class="ff-mkt-story-step"><b>STEP ${index+1}</b><p>${escapeHtml(copy)}</p></article>`).join("")}</div><div class="ff-mkt-callout" style="margin-top:16px"><div><strong>VERIFY</strong><p>Five of seven comparisons did not survive review. The apparent spread fell from 24% to 2.3%, leaving too little margin and too much evidence uncertainty for a defensible BUY.</p></div><span class="ff-mkt-kicker">EVIDENCE CHANGED THE DECISION</span></div>`);
}

function renderEvidenceChain() {
  const rows = [
    ["Comp 01","Exact parallel · distinct sale","ACCEPTED"],
    ["Comp 02","Exact parallel · distinct sale","ACCEPTED"],
    ["Comp 03","Wrong parallel","EXCLUDED"],
    ["Comp 04","Duplicate record","EXCLUDED"],
    ["Comp 05","Identity conflict","EXCLUDED"],
    ["Comp 06","Wrong grade context","EXCLUDED"],
    ["Comp 07","Duplicate / stale comparison","EXCLUDED"]
  ];
  return section(4, "Evidence chain", "The point is not to collect the most records. The point is to know which records deserve to influence the decision.", `<div class="ff-mkt-evidence-chain">${rows.map(([name,copy,status])=>`<div class="ff-mkt-evidence-row"><span>${name}</span><small>${copy}</small><span class="ff-mkt-evidence-status">${status}</span></div>`).join("")}</div>`);
}

function renderCta() {
  return section(8, "Before you buy. Know Why.", "Use FlipForge to understand what the evidence supports before money gets committed.", `<div class="ff-mkt-callout"><div><strong>${escapeHtml(product.hero.headline)}</strong><p>${escapeHtml(product.hero.copy)}</p></div><a class="ff-mkt-btn ff-mkt-btn-primary" href="/decision-intelligence.html">See Card Decision Intelligence</a></div>`);
}

function renderDisclaimer() {
  return section(9, "Decision-support boundary", "FlipForge keeps the product boundary explicit.", `<div class="ff-mkt-card"><h3>Decision support — not transaction authority</h3><p>${escapeHtml(disclaimers.standard)}</p></div>`);
}

function bodyFor(doc) {
  const renderers = {
    "problem": renderProblem,
    "market-gaps": renderMarketGaps,
    "solution": renderSolution,
    "decision-states": renderDecisionStates,
    "proof-points": renderProofPoints,
    "seven-layers": renderSevenLayers,
    "audience": () => renderAudience(doc),
    "decision-receipt": renderDecisionReceipt,
    "outcomes": renderOutcomes,
    "deal-or-decoy": renderDealOrDecoy,
    "evidence-chain": renderEvidenceChain,
    "cta": renderCta,
    "disclaimer": renderDisclaimer
  };
  return hero(doc) + doc.sections.map(key => {
    if (!renderers[key]) throw new Error(`Unknown marketing section: ${key}`);
    return renderers[key]();
  }).join("");
}

for (const doc of docs) {
  const html = documentShell
    .replaceAll("{{TITLE}}", escapeHtml(doc.title))
    .replaceAll("{{DESCRIPTION}}", escapeHtml(doc.summary))
    .replaceAll("{{SLUG}}", escapeHtml(doc.slug))
    .replaceAll("{{CSS_PATH}}", "/marketing/styles/flipforge-marketing.css")
    .replaceAll("{{LOGO_PATH}}", brand.primaryLogo)
    .replaceAll("{{DISCLAIMER}}", escapeHtml(disclaimers.compact))
    .replace("{{BODY}}", bodyFor(doc));
  write(`marketing/generated/${doc.slug}.html`, html);
  write(`marketing-preview/${doc.slug}/index.html`, html);
}

const cards = docs.map((doc,index)=>`<a class="ff-mkt-preview-card" href="/marketing-preview/${escapeHtml(doc.slug)}/"><span>${String(index+1).padStart(2,"0")} · ${escapeHtml(doc.eyebrow)}</span><h2>${escapeHtml(doc.title)}</h2><p>${escapeHtml(doc.summary)}</p><strong>Open preview →</strong></a>`).join("");
write("marketing-preview/index.html", previewShell.replace("{{CARDS}}", cards));
write("marketing/generated/manifest.json", JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "marketing/content",
  documents: docs.map(doc=>({ slug: doc.slug, title: doc.title, preview: `/marketing-preview/${doc.slug}/` }))
}, null, 2) + "\n");

console.log(`FlipForge marketing build complete: ${docs.length} documents + preview center.`);
