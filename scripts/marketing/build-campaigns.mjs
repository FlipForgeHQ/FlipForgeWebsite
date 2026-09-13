import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const write = (relative, content) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

const brand = readJson("marketing/content/brand.json");
const campaigns = readJson("marketing/content/campaigns.json").campaigns;
const disclaimers = readJson("marketing/content/disclaimers.json");

function carousel(campaign) {
  const beats = campaign.story?.length ? campaign.story : [campaign.hook, `Focus: ${campaign.layer || "Card Decision Intelligence™"}`, "Show the evidence", "Show the decision", brand.slogan];
  return beats.slice(0,6).map((beat,index)=>`<article class="ff-mkt-card"><b>SLIDE ${index+1}</b><h3>${index === 0 ? esc(campaign.name) : `Beat ${index+1}`}</h3><p>${esc(beat)}</p></article>`).join("");
}

function video(campaign) {
  const beats = campaign.story?.length ? campaign.story : [campaign.hook, `Expose the ${campaign.layer || "evidence"} problem`, "Reveal what changed", "Show BUY / WATCH / VERIFY / PASS", brand.slogan];
  return beats.slice(0,6).map((beat,index)=>`<article class="ff-mkt-story-step"><b>${index*4}-${Math.min((index+1)*4,24)}s</b><p>${esc(beat)}</p></article>`).join("");
}

function email(campaign) {
  const subject = campaign.key === "deal-or-decoy" ? "When a 24% deal becomes 2.3%" : `${campaign.name}: what the evidence changes`;
  return `<div class="ff-mkt-grid"><article class="ff-mkt-card"><b>SUBJECT</b><h3>${esc(subject)}</h3><p>${esc(campaign.hook)}</p></article><article class="ff-mkt-card"><b>BODY</b><h3>Lead with the decision problem</h3><p>Show the evidence conflict in plain language, reveal what changed, then connect the lesson to Card Decision Intelligence™.</p></article><article class="ff-mkt-card"><b>CTA</b><h3>See how the decision is built</h3><p>${esc(brand.slogan)}</p></article></div>`;
}

function campaignHtml(campaign) {
  const focus = campaign.layer || "Card Decision Intelligence™";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(campaign.name)} Campaign | FlipForge</title><link rel="stylesheet" href="/marketing/styles/flipforge-marketing.css"></head><body><main class="ff-mkt-doc" data-marketing-campaign="${esc(campaign.key)}">
<header class="ff-mkt-topbar"><a href="/"><img class="ff-mkt-logo" src="${brand.primaryLogo}" alt="FlipForge — Card Decision Intelligence — Before you buy. Know Why."></a><div class="ff-mkt-top-actions"><a class="ff-mkt-btn ff-mkt-btn-secondary" href="/marketing-preview/">All materials</a><a class="ff-mkt-btn ff-mkt-btn-secondary" href="/marketing-preview/campaigns/">Campaign library</a><button class="ff-mkt-btn ff-mkt-btn-primary" type="button" onclick="window.print()">Print / Save PDF</button></div></header>
<section class="ff-mkt-hero"><div><span class="ff-mkt-kicker">CAMPAIGN · ${esc(focus)}</span><h1>${esc(campaign.name)}</h1><p>${esc(campaign.hook)}</p></div><aside class="ff-mkt-hero-aside"><span>AVAILABLE FORMATS</span><strong>${esc((campaign.formats || []).length)} formats</strong><p>${esc((campaign.formats || []).join(" · "))}</p></aside></section>
<section class="ff-mkt-section"><header class="ff-mkt-section-head"><span class="ff-mkt-section-num">01</span><div><h2>Campaign story</h2><p class="ff-mkt-section-intro">The governed reveal order. Keep the evidence change ahead of the sales message.</p></div></header><div class="ff-mkt-story">${video(campaign)}</div></section>
<section class="ff-mkt-section"><header class="ff-mkt-section-head"><span class="ff-mkt-section-num">02</span><div><h2>Carousel / social sequence</h2><p class="ff-mkt-section-intro">Use these beats for a carousel, vertical graphic sequence, or dealer handout.</p></div></header><div class="ff-mkt-grid">${carousel(campaign)}</div></section>
<section class="ff-mkt-section"><header class="ff-mkt-section-head"><span class="ff-mkt-section-num">03</span><div><h2>20–30 second video structure</h2><p class="ff-mkt-section-intro">Fast reveal structure for short-form video, paid social, or the website.</p></div></header><div class="ff-mkt-story">${video(campaign)}</div></section>
<section class="ff-mkt-section"><header class="ff-mkt-section-head"><span class="ff-mkt-section-num">04</span><div><h2>Email package</h2><p class="ff-mkt-section-intro">Subject, body angle, and CTA stay aligned to the same governed campaign source.</p></div></header>${email(campaign)}</section>
<section class="ff-mkt-section"><header class="ff-mkt-section-head"><span class="ff-mkt-section-num">05</span><div><h2>Claim boundary</h2></div></header><div class="ff-mkt-card"><h3>Decision support only</h3><p>${esc(disclaimers.standard)}</p></div></section>
<footer class="ff-mkt-footer"><div><strong>FLIPFORGE · CARD DECISION INTELLIGENCE</strong><br>${esc(brand.slogan)}</div><div>${esc(disclaimers.compact)}</div></footer>
</main></body></html>`;
}

for (const campaign of campaigns) {
  const html = campaignHtml(campaign);
  write(`marketing/generated/campaigns/${campaign.key}.html`, html);
  write(`marketing-preview/campaigns/${campaign.key}/index.html`, html);
}

const cards = campaigns.map((campaign,index)=>`<a class="ff-mkt-preview-card" href="/marketing-preview/campaigns/${esc(campaign.key)}/"><span>${String(index+1).padStart(2,"0")} · CAMPAIGN</span><h2>${esc(campaign.name)}</h2><p>${esc(campaign.hook)}</p><strong>Open campaign kit →</strong></a>`).join("");
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>FlipForge Campaign Library</title><link rel="stylesheet" href="/marketing/styles/flipforge-marketing.css"></head><body><main class="ff-mkt-preview"><header class="ff-mkt-preview-header"><div><span class="ff-mkt-kicker">GOVERNED CAMPAIGN LIBRARY</span><h1>Campaign packages</h1></div><a class="ff-mkt-btn ff-mkt-btn-secondary" href="/marketing-preview/">Marketing center</a></header><section class="ff-mkt-preview-grid">${cards}</section></main></body></html>`;
write("marketing-preview/campaigns/index.html", index);
write("marketing/generated/campaigns/manifest.json", JSON.stringify({schemaVersion:1,campaigns:campaigns.map(item=>({key:item.key,name:item.name,preview:`/marketing-preview/campaigns/${item.key}/`}))},null,2)+"\n");
console.log(`FlipForge campaign build complete: ${campaigns.length} campaign kits.`);
