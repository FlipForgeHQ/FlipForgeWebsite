(() => {
  "use strict";

  function route() {
    return String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
  }

  function text(node, fallback = "—") {
    const value = String(node?.textContent || "").replace(/\s+/g, " ").trim();
    return value || fallback;
  }

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function metricMap(card) {
    const map = new Map();
    card.querySelectorAll(".forge-heat-metrics > div").forEach(item => {
      const label = text(item.querySelector("span"), "");
      const value = text(item.querySelector("strong"), "—");
      if (label) map.set(label, value);
    });
    return map;
  }

  function reason(card, index) {
    const section = card.querySelectorAll(".forge-heat-reason-grid > section")[index];
    if (!section) return [];
    return [...section.querySelectorAll("li")].map(li => text(li, "")).filter(Boolean);
  }

  function cardData(card) {
    const metrics = metricMap(card);
    const link = card.querySelector(".forge-heat-card-foot a[href]");
    const kicker = text(card.querySelector(".forge-heat-kicker"), "");
    const recommendation = kicker.includes("·") ? kicker.split("·").pop().trim() : "";
    return {
      rank: text(card.querySelector(".forge-heat-rank")),
      card: text(card.querySelector(".forge-heat-identity h3")),
      detail: text(card.querySelector(".forge-heat-identity p"), ""),
      heat: text(card.querySelector(".forge-heat-score strong")),
      band: text(card.querySelector(".forge-heat-score span"), "HEAT"),
      recommendation,
      ask: metrics.get("All-in ask") || "—",
      supported: metrics.get("Supported value") || "—",
      gap: metrics.get("Supported-value gap") || "—",
      confidence: metrics.get("Forge Confidence") || "—",
      risk: metrics.get("Opportunity Risk") || "—",
      evidence: metrics.get("Exact evidence") || "—",
      why: reason(card, 0),
      cool: reason(card, 1),
      invalidate: reason(card, 2),
      href: link?.getAttribute("href") || ""
    };
  }

  function heatTone(value) {
    const n = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(n)) return "neutral";
    if (n >= 90) return "white";
    if (n >= 80) return "hot";
    if (n >= 70) return "heating";
    if (n >= 60) return "warm";
    return "cool";
  }

  function list(items, empty) {
    return items.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p>${esc(empty)}</p>`;
  }

  function buildConsole(shell) {
    if (!shell || shell.dataset.ffHeatControlRoom === "true") return;
    const cards = [...shell.querySelectorAll(".forge-heat-card")];
    const tabs = shell.querySelector(".forge-heat-tabs");
    const hero = shell.querySelector(".forge-heat-hero");
    const lock = shell.querySelector(".forge-heat-lock");
    if (lock || !cards.length || !hero) return;

    const rows = cards.map(cardData);
    const lead = rows[0];
    const originalList = shell.querySelector(".forge-heat-list");
    if (!originalList) return;

    const console = document.createElement("section");
    console.className = "ff-heat-control-room";
    console.setAttribute("aria-label", "Forge Heat ranked opportunity intelligence");
    console.innerHTML = `
      <div class="ff-heat-console-head">
        <div><span class="eyebrow">LIVE RANKING · GOVERNED SAVED EVALUATIONS</span><h2>🔥 Forge Heat — ${esc(rows.length > 5 ? "Top Opportunities" : `Top ${rows.length}`)}</h2></div>
        <span class="ff-heat-live-dot">LIVE</span>
      </div>
      <div class="ff-heat-console-grid">
        <div class="ff-heat-table-wrap">
          <table class="ff-heat-table">
            <thead><tr><th>Rank</th><th>Card</th><th>Heat</th><th>Ask</th><th>Supported</th><th>Value Gap</th><th>Confidence</th><th>Evidence</th><th>Risk</th></tr></thead>
            <tbody>${rows.map(row => `<tr>
              <td class="ff-heat-rank-cell">#${esc(row.rank)}</td>
              <td><strong>${esc(row.card)}</strong><small>${esc(row.recommendation || row.detail)}</small></td>
              <td><span class="ff-heat-score-pill" data-tone="${heatTone(row.heat)}">🔥 ${esc(row.heat)}</span></td>
              <td>${esc(row.ask)}</td><td>${esc(row.supported)}</td><td class="ff-heat-positive">${esc(row.gap)}</td>
              <td>${esc(row.confidence)}</td><td>${esc(row.evidence)}</td><td>${esc(row.risk)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
        <aside class="ff-heat-band-panel">
          <span class="eyebrow">HEAT SCORE</span><strong>Evidence-adjusted rank</strong><small>0–100 presentation of backend-returned Forge Heat.</small>
          <div class="ff-heat-bands">
            <div><b>90–100</b><span>WHITE HOT 🔥🔥🔥</span></div>
            <div><b>80–89</b><span>HOT 🔥🔥</span></div>
            <div><b>70–79</b><span>HEATING UP 🔥</span></div>
            <div><b>60–69</b><span>WARM</span></div>
            <div><b>&lt;60</b><span>LOWER HEAT</span></div>
          </div>
        </aside>
      </div>
      <div class="ff-heat-deep-grid">
        <article class="ff-heat-deep-dive">
          <span class="eyebrow">DEEP DIVE TRACEBACK · #${esc(lead.rank)}</span>
          <h3>${esc(lead.card)}</h3>
          <div class="ff-heat-deep-metrics"><div><span>Value gap</span><strong>${esc(lead.gap)}</strong></div><div><span>Confidence</span><strong>${esc(lead.confidence)}</strong></div><div><span>Risk</span><strong>${esc(lead.risk)}</strong></div><div><span>Evidence</span><strong>${esc(lead.evidence)}</strong></div></div>
          ${lead.href ? `<a class="button button-secondary" href="${esc(lead.href)}">Open Smart Opportunity decision →</a>` : ""}
        </article>
        <article class="ff-heat-gates">
          <span class="eyebrow">QUALIFICATION TRACE</span><h3>Why it surfaced</h3>${list(lead.why, "No additional qualification factor was returned.")}
        </article>
        <article class="ff-heat-cool">
          <span class="eyebrow">RISK CHECK</span><h3>What could cool it</h3>${list(lead.cool, "No additional cooling factor was returned.")}
        </article>
      </div>
      <div class="ff-heat-authority-strip"><strong>Smart Opportunity remains the decision authority.</strong><span>Forge Heat ranks qualified saved evaluations; it does not create a second BUY/WATCH/VERIFY/PASS authority, estimate profit, or authorize transactions.</span></div>`;

    hero.insertAdjacentElement("afterend", console);
    if (tabs) console.insertAdjacentElement("afterend", tabs);
    originalList.hidden = true;
    originalList.setAttribute("aria-hidden", "true");
    shell.dataset.ffHeatControlRoom = "true";
  }

  function apply() {
    if (route() !== "forge-heat") return;
    buildConsole(document.querySelector(".forge-heat-shell"));
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  }

  const main = document.querySelector("#main-content");
  if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  schedule();
})();
