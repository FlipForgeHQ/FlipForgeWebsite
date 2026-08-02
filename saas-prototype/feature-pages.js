(() => {
  "use strict";

  const featureData = window.FlipForgeSaaSFeatureData;
  const coreData = window.FlipForgePrototypeData;
  const main = document.querySelector("#main-content");
  const toastRegion = document.querySelector(".toast-region");
  const featureRoutes = new Set(["discover", "portfolio", "sell", "alerts", "account"]);
  const alertState = new Map(featureData.alerts.rules.map(rule => [rule.id, rule.active]));

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  function formatCurrency(value) {
    return currency.format(Number(value) || 0);
  }

  function currentRoute() {
    return (window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard");
  }

  function pageHeading(eyebrow, title, description, actions = "") {
    return `<header class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
  }

  function panel(title, description, body, action = "") {
    return `<section class="panel"><header class="panel-header"><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div>${action}</header><div class="panel-body">${body}</div></section>`;
  }

  function boundaryNote(extra) {
    return `<div class="boundary-note"><strong>Authority boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority. ${extra}</div>`;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
  }

  function scorePill(value) {
    if (value === "Tracked" || value === "Investigate") return `<span class="status-pill status-buy">${value}</span>`;
    if (value === "Verify") return `<span class="status-pill status-verify">${value}</span>`;
    return `<span class="status-pill status-watch">${value}</span>`;
  }

  function makePath(points, key, width, height, padding, min, max) {
    const x = index => padding.left + index * ((width - padding.left - padding.right) / Math.max(points.length - 1, 1));
    const y = value => padding.top + (max - value) * ((height - padding.top - padding.bottom) / Math.max(max - min, 1));
    return points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  }

  function renderMarketTrendChart() {
    const points = featureData.discover.marketTrend;
    const width = 760;
    const height = 250;
    const padding = { left: 38, right: 18, top: 18, bottom: 30 };
    const x = index => padding.left + index * ((width - padding.left - padding.right) / Math.max(points.length - 1, 1));
    const y = value => padding.top + (100 - value) * ((height - padding.top - padding.bottom) / 100);
    const demandPath = makePath(points, "demand", width, height, padding, 0, 100);
    const liquidityPath = makePath(points, "liquidity", width, height, padding, 0, 100);
    const grid = [25, 50, 75, 100];

    return `<div class="chart-shell"><div class="chart-legend"><span class="legend-item"><span class="legend-swatch" style="background:var(--gold-strong)"></span>Demand index</span><span class="legend-item"><span class="legend-swatch" style="background:var(--silver)"></span>Liquidity index</span><span class="legend-item">Display-only prototype trend</span></div><svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype market demand and liquidity timeline"><path class="area" d="${demandPath} L${x(points.length - 1)},${height - padding.bottom} L${x(0)},${height - padding.bottom} Z"></path>${grid.map(value => `<line class="grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y(value)}" y2="${y(value)}"></line><text x="4" y="${y(value) + 3}">${value}</text>`).join("")}<path class="demand-line" d="${demandPath}"></path><path class="liquidity-line" d="${liquidityPath}"></path>${points.map((point, index) => `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${point.date.replace("Jul ", "")}</text>`).join("")}</svg></div>`;
  }

  function renderDiscoverFull() {
    const savedSearches = featureData.discover.savedSearches.map(search => `<div class="saved-search"><span><strong>${search.name}</strong><small>${search.matches} prototype matches · ${search.updated}</small></span><button class="button button-secondary" type="button" data-feature-toast="Saved search opened in this preview only.">Open</button></div>`).join("");

    main.innerHTML = `<div class="page" data-feature-route="discover">${pageHeading("Market discovery", "Discover", "Search approved mock listing context, monitor market movement and decide what deserves investigation without treating active asks as sold evidence.", `<button class="button button-secondary" type="button" data-feature-toast="Saved searches are in-memory only and reset on refresh.">Saved searches</button><a class="button button-primary" href="#/evaluate">Evaluate a card</a>`)}<div class="feature-grid"><div class="stack">${panel("Discovery filters", "Filters narrow the display only; they do not create or change a recommendation.", `<div class="filter-bar"><div class="field"><label for="discover-query">Player, set or card</label><input id="discover-query" type="search" placeholder="Search prototype listings"></div><div class="field"><label for="discover-sport">Sport</label><select id="discover-sport"><option value="all">All sports</option><option>Baseball</option><option>Basketball</option><option>Football</option><option>Hockey</option></select></div><div class="field"><label for="discover-status">Review state</label><select id="discover-status"><option value="all">All states</option><option>Investigate</option><option>Verify</option><option>Tracked</option><option>Discovery</option></select></div><button class="button button-secondary" id="save-search" type="button">Save search</button></div>`)}<div id="discover-results" class="listing-grid" aria-live="polite"></div>${panel("Market trend and liquidity timeline", "Mock aggregate context helps prioritize research; it cannot establish exact-card value.", renderMarketTrendChart())}</div><div class="stack">${panel("Saved searches", "Prototype watch conditions stored only in memory.", `<div class="saved-search-list">${savedSearches}</div>`)}${panel("Discovery rules", "The customer browser keeps discovery and evidence authority separate.", `<div class="check-list"><div class="check-item"><span class="check-mark ok">✓</span><span><strong>Active asks stay discovery-only</strong><small>They never become completed-sale evidence.</small></span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>Identity before value</strong><small>Parallel, card number, grade and variation must resolve.</small></span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>No browser recommendation</strong><small>Evaluate sends normalized identity to the future authoritative backend.</small></span></div></div>`)}</div></div>${boundaryNote("This screen contains mock listing context only. It performs no scraping, provider call, evidence acceptance or recommendation calculation.")}</div>`;

    const query = document.querySelector("#discover-query");
    const sport = document.querySelector("#discover-sport");
    const status = document.querySelector("#discover-status");
    const results = document.querySelector("#discover-results");

    function drawListings() {
      const term = query.value.trim().toLowerCase();
      const filtered = featureData.discover.listings.filter(listing => {
        const matchesTerm = !term || `${listing.player} ${listing.card}`.toLowerCase().includes(term);
        const matchesSport = sport.value === "all" || listing.sport === sport.value;
        const matchesStatus = status.value === "all" || listing.status === status.value;
        return matchesTerm && matchesSport && matchesStatus;
      });

      results.innerHTML = filtered.length ? filtered.map(listing => `<article class="listing-card"><header><div><h3>${listing.player}</h3><p>${listing.card}</p></div>${scorePill(listing.status)}</header><div class="listing-meta"><span><small>Current ask</small><strong>${formatCurrency(listing.ask)}</strong></span><span><small>Identity</small><strong>${listing.identity}</strong></span><span><small>Updated</small><strong>${listing.freshness}</strong></span></div><p>${listing.context}</p><div class="listing-actions"><button class="button button-secondary" type="button" data-feature-toast="Added to the in-memory prototype watchlist.">Track</button><a class="button button-primary" href="#/evaluate">Investigate</a></div></article>`).join("") : `<div class="empty-filter-state">No mock listings match these filters. No live marketplace search was performed.</div>`;
      bindFeatureToasts();
    }

    [query, sport, status].forEach(control => control.addEventListener(control === query ? "input" : "change", drawListings));
    document.querySelector("#save-search").addEventListener("click", () => showToast("Saved in memory for this preview session only."));
    drawListings();
  }

  function renderPortfolioChart() {
    const points = featureData.portfolio.history;
    const width = 760;
    const height = 250;
    const padding = { left: 58, right: 18, top: 18, bottom: 30 };
    const values = points.map(point => point.value);
    const min = Math.floor((Math.min(...values) - 500) / 1000) * 1000;
    const max = Math.ceil((Math.max(...values) + 500) / 1000) * 1000;
    const x = index => padding.left + index * ((width - padding.left - padding.right) / Math.max(points.length - 1, 1));
    const y = value => padding.top + (max - value) * ((height - padding.top - padding.bottom) / Math.max(max - min, 1));
    const valuePath = makePath(points, "value", width, height, padding, min, max);
    const grid = [min, (min + max) / 2, max];

    return `<div class="chart-shell"><div class="chart-legend"><span class="legend-item"><span class="legend-swatch" style="background:var(--gold-strong)"></span>Supported portfolio value</span><span class="legend-item">Mock monthly snapshots</span></div><svg class="portfolio-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype supported portfolio value history"><path class="area" d="${valuePath} L${x(points.length - 1)},${height - padding.bottom} L${x(0)},${height - padding.bottom} Z"></path>${grid.map(value => `<line class="grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y(value)}" y2="${y(value)}"></line><text x="2" y="${y(value) + 3}">${formatCurrency(value)}</text>`).join("")}<path class="value-line" d="${valuePath}"></path>${points.map((point, index) => `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${point.date}</text>`).join("")}</svg></div>`;
  }

  function renderPortfolio() {
    const portfolio = featureData.portfolio;
    const allocation = portfolio.allocation.map(item => `<div class="allocation-item"><span><strong>${item.label}</strong><small>${formatCurrency(item.value)} supported value</small><span class="allocation-bar"><span style="width:${item.share}%"></span></span></span><strong>${item.share}%</strong></div>`).join("");
    const holdings = portfolio.holdings.map(item => {
      const gain = item.supported - item.cost;
      return `<tr><td><strong>${item.card}</strong><br><small>${item.sport} · Qty ${item.quantity}</small></td><td>${formatCurrency(item.cost)}</td><td>${formatCurrency(item.supported)}</td><td class="${gain >= 0 ? "positive-value" : "warning-value"}">${gain >= 0 ? "+" : ""}${formatCurrency(gain)}</td><td>${item.confidence}/100</td><td>${item.evidence}</td></tr>`;
    }).join("");

    main.innerHTML = `<div class="page" data-feature-route="portfolio">${pageHeading("Collection intelligence", "Portfolio", "Review supported value, allocation, evidence quality and concentration without converting estimates into guaranteed liquidation value.", `<button class="button button-secondary" type="button" data-feature-toast="CSV export requires a future authenticated backend entitlement.">Export</button><button class="button button-primary" type="button" data-feature-toast="Portfolio additions are disabled in this non-production preview.">Add card</button>`)}<section class="mini-metric-grid" aria-label="Portfolio metrics"><article class="mini-metric"><span>Supported value</span><strong>${formatCurrency(portfolio.totalValue)}</strong><small>Saved governed mock records</small></article><article class="mini-metric"><span>Cost basis</span><strong>${formatCurrency(portfolio.costBasis)}</strong><small>User-entered prototype basis</small></article><article class="mini-metric"><span>Unrealized change</span><strong class="positive-value">+${formatCurrency(portfolio.unrealizedGain)}</strong><small>Before selling costs and taxes</small></article><article class="mini-metric"><span>Evidence-ready</span><strong>${portfolio.evidenceReady}%</strong><small>Not a probability of profit</small></article></section><div class="feature-grid"><div class="stack">${panel("Portfolio performance", "Supported-value history from saved mock snapshots.", renderPortfolioChart())}${panel("Holdings", "Every holding retains its own evidence and confidence context.", `<div class="table-wrap"><table class="portfolio-table"><thead><tr><th>Card</th><th>Cost</th><th>Supported</th><th>Change</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>${holdings}</tbody></table></div>`)}</div><div class="stack">${panel("Allocation", "Concentration by supported value, not guaranteed sale proceeds.", `<div class="allocation-list">${allocation}</div>`)}${panel("Portfolio risk", "What needs attention before the collection total can be trusted.", `<div class="check-list"><div class="check-item"><span class="check-mark warn">!</span><span><strong>High-value concentration</strong><small>Mahomes represents a large share of the prototype total.</small></span><span>Review</span></div><div class="check-item"><span class="check-mark warn">!</span><span><strong>Evidence gaps</strong><small>Two holdings need stronger completed-sale support.</small></span><span>2</span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>Identity coverage</strong><small>Tracked holdings retain exact-card fields.</small></span><span>Current</span></div></div>`)}</div></div>${boundaryNote("Portfolio totals summarize saved records only and cannot guarantee sale proceeds, liquidity, taxes, fees or future performance.")}</div>`;
    bindFeatureToasts();
  }

  function renderSell() {
    const sell = featureData.sell;
    const options = sell.candidates.map(candidate => `<option value="${candidate.id}">${candidate.card}</option>`).join("");

    main.innerHTML = `<div class="page" data-feature-route="sell">${pageHeading("Exit planning", "Sell", "Estimate exit readiness and likely net proceeds without creating a listing, contacting a marketplace or authorizing a transaction.", `<button class="button button-secondary" type="button" data-feature-toast="No marketplace account is connected.">Marketplace connections</button>`)}${panel("Exit scenario", "Adjust display-only assumptions to understand how costs change the saved supported value.", `<div class="sell-controls"><div class="field"><label for="sell-card">Saved card</label><select id="sell-card">${options}</select></div><div class="field"><label for="sell-fee">Marketplace fee %</label><input id="sell-fee" type="number" min="0" max="30" step="0.25" value="${sell.assumptions.marketplaceFeePercent}"></div><div class="field"><label for="sell-shipping">Shipping</label><input id="sell-shipping" type="number" min="0" value="${sell.assumptions.shipping}"></div><div class="field"><label for="sell-insurance">Insurance</label><input id="sell-insurance" type="number" min="0" value="${sell.assumptions.insurance}"></div></div>`)}<div class="feature-grid"><div class="stack"><div id="sell-summary" class="sell-summary" aria-live="polite"></div>${panel("Exit checklist", "These gates remain advisory and require outside verification.", `<div class="check-list"><div class="check-item"><span class="check-mark ok">✓</span><span><strong>Exact card identity</strong><small>Verify slab, card number, parallel and grade before listing.</small></span></div><div class="check-item"><span class="check-mark warn">!</span><span><strong>Current completed sales</strong><small>Do not substitute active asks for sold evidence.</small></span></div><div class="check-item"><span class="check-mark warn">!</span><span><strong>Seller costs and taxes</strong><small>Confirm marketplace, payment, shipping and tax obligations.</small></span></div></div>`)}</div><div class="stack">${panel("Exit readiness meaning", "Readiness prioritizes review; it does not direct a sale.", `<p style="color:var(--text-soft);font-size:11px;line-height:1.7">A high readiness score means identity, evidence and liquidity context are comparatively complete. It does not mean now is the best time to sell or that a buyer will pay the supported value.</p><button class="button button-primary" type="button" data-feature-toast="Transaction actions are intentionally unavailable.">Review outside selling steps</button>`)}${panel("Customer protections", "Controls intentionally excluded from this preview.", `<div class="check-list"><div class="check-item"><span class="check-mark ok">✓</span><span><strong>No auto-listing</strong><small>No marketplace listing is created.</small></span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>No checkout or payment</strong><small>No funds or payment credentials are handled.</small></span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>No guaranteed proceeds</strong><small>Net estimates remain assumptions.</small></span></div></div>`)}</div></div>${boundaryNote("This page is advisory only. It cannot list, sell, accept an offer, collect payment or authorize any transaction.")}</div>`;

    const card = document.querySelector("#sell-card");
    const fee = document.querySelector("#sell-fee");
    const shipping = document.querySelector("#sell-shipping");
    const insurance = document.querySelector("#sell-insurance");
    const summary = document.querySelector("#sell-summary");

    function updateSellSummary() {
      const candidate = sell.candidates.find(item => item.id === card.value) || sell.candidates[0];
      const feeAmount = candidate.supported * Math.max(Number(fee.value) || 0, 0) / 100;
      const net = candidate.supported - feeAmount - Math.max(Number(shipping.value) || 0, 0) - Math.max(Number(insurance.value) || 0, 0);
      summary.innerHTML = `<header><span class="eyebrow">Display-only estimate</span><h2>${candidate.card}</h2><p>${candidate.recommendation} · ${candidate.evidence}</p></header><div class="sell-summary-grid"><div><span>Supported value</span><strong>${formatCurrency(candidate.supported)}</strong></div><div><span>Estimated fees</span><strong>${formatCurrency(feeAmount)}</strong></div><div><span>Estimated net</span><strong class="positive-value">${formatCurrency(net)}</strong></div><div><span>Exit readiness</span><strong>${candidate.readiness}/100</strong></div></div><p><small>Confidence ${candidate.confidence}/100 · Liquidity ${candidate.liquidity}/100. Actual proceeds depend on the verified listing, buyer, marketplace, taxes, shipping and final transaction.</small></p>`;
    }

    [card, fee, shipping, insurance].forEach(control => control.addEventListener(control === card ? "change" : "input", updateSellSummary));
    updateSellSummary();
    bindFeatureToasts();
  }

  function renderAlerts() {
    const recent = featureData.alerts.recent.map(item => `<div class="activity-item"><span class="activity-icon">!</span><span><strong>${item.title}</strong><small>${item.detail} · ${item.severity}</small></span><span class="activity-time">${item.time}</span></div>`).join("");

    main.innerHTML = `<div class="page" data-feature-route="alerts">${pageHeading("Attention queue", "Alerts", "Review saved conditions for value, evidence, population, risk and portfolio changes. Prototype alerts run only as static examples.", `<button class="button button-primary" type="button" id="create-alert">Create alert</button>`)}<div class="feature-grid"><div class="stack">${panel("Alert rules", "Toggles change in-memory preview state only.", `<div id="alert-rules" class="alert-list"></div>`)}</div><div class="stack">${panel("Recent alert activity", "Mock events, not live telemetry or notifications.", `<div class="activity-list">${recent}</div>`)}${panel("Delivery boundary", "Production delivery requires a separate authenticated service.", `<div class="check-list"><div class="check-item"><span class="check-mark warn">!</span><span><strong>Email delivery</strong><small>Not connected</small></span><span>Deferred</span></div><div class="check-item"><span class="check-mark warn">!</span><span><strong>Push notifications</strong><small>Not connected</small></span><span>Deferred</span></div><div class="check-item"><span class="check-mark ok">✓</span><span><strong>Authority isolation</strong><small>Alerts never calculate or change a recommendation.</small></span><span>Protected</span></div></div>`)}</div></div>${boundaryNote("Alert conditions observe saved output only. They cannot accept evidence, change authority state, buy, sell or contact a marketplace.")}</div>`;

    const rules = document.querySelector("#alert-rules");
    function drawRules() {
      rules.innerHTML = featureData.alerts.rules.map(rule => {
        const active = alertState.get(rule.id);
        return `<article class="alert-rule"><header><div><h3>${rule.name}</h3><p>${rule.type} · ${rule.target}</p></div><span class="status-pill ${active ? "status-buy" : "status-watch"}">${active ? "ACTIVE" : "PAUSED"}</span></header><footer><span><small>${rule.cadence} check · ${active ? rule.last : "Paused"}</small></span><button class="button button-secondary toggle-button" type="button" data-alert-toggle="${rule.id}" aria-pressed="${active}">${active ? "Pause" : "Enable"}</button></footer></article>`;
      }).join("");
      rules.querySelectorAll("[data-alert-toggle]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.alertToggle;
        alertState.set(id, !alertState.get(id));
        drawRules();
        showToast("Alert preview state changed in memory only.");
      }));
    }

    document.querySelector("#create-alert").addEventListener("click", () => showToast("Alert creation requires the future authenticated backend. No rule was persisted."));
    drawRules();
  }

  function renderAccount() {
    const account = featureData.account;
    const usage = account.usage.map(item => `<div class="usage-item"><header><span>${item.label}</span><strong>${item.used} / ${item.limit}</strong></header><div class="usage-track" aria-label="${item.used} of ${item.limit} ${item.label.toLowerCase()} used"><span style="width:${Math.min(item.used / item.limit * 100, 100)}%"></span></div></div>`).join("");
    const entitlements = account.entitlements.map(item => `<article class="entitlement-card" data-enabled="${item.enabled}"><h3>${item.label}</h3><p>${item.detail}</p><span class="entitlement-state">${item.enabled ? "Included" : "Unavailable"}</span></article>`).join("");
    const security = account.security.map(item => `<div class="security-row"><span><strong>${item.label}</strong><small>${item.detail}</small></span><strong>${item.state}</strong></div>`).join("");

    main.innerHTML = `<div class="page" data-feature-route="account">${pageHeading("Customer boundary", "Account", "Review the planned profile, plan, usage and security boundaries without collecting credentials, payment information or production identity data.", `<button class="button button-secondary" type="button" data-feature-toast="Profile editing is disabled in this prototype.">Edit profile</button>`)}<section class="mini-metric-grid" aria-label="Account overview"><article class="mini-metric"><span>Plan</span><strong>${account.plan.name}</strong><small>${account.plan.status}</small></article><article class="mini-metric"><span>Price</span><strong>${account.plan.price}</strong><small>${account.plan.renewal}</small></article><article class="mini-metric"><span>Role</span><strong>Owner</strong><small>${account.profile.role}</small></article><article class="mini-metric"><span>Session</span><strong>Temporary</strong><small>Changes reset on refresh</small></article></section><div class="account-grid"><div class="stack">${panel("Profile", "Display-only identity for route validation.", `<div class="key-value-grid"><div class="key-value"><span>Name</span><strong>${account.profile.name}</strong></div><div class="key-value"><span>Email</span><strong>${account.profile.email}</strong></div></div>`)}${panel("Usage boundaries", "Prototype meters illustrate future server-enforced entitlements.", `<div class="usage-grid">${usage}</div>`)}</div><div class="stack">${panel("Security and connections", "No real authentication, payment method or provider credential is present.", `<div class="security-list">${security}</div>`)}${panel("Plan actions", "Billing and account changes require explicit production architecture.", `<div class="page-actions"><button class="button button-secondary" type="button" data-feature-toast="No billing portal is connected.">Manage billing</button><button class="button button-secondary" type="button" data-feature-toast="No sign-in session exists in this prototype.">Sign out</button></div>`)}</div></div>${panel("Entitlements", "Customer-facing capability boundaries for the planned SaaS product.", `<div class="entitlement-grid">${entitlements}</div>`)}${boundaryNote("Authentication, billing, entitlement enforcement and provider administration are not implemented. No password, payment method, secret or production account is stored.")}</div>`;
    bindFeatureToasts();
  }

  function bindFeatureToasts() {
    document.querySelectorAll("[data-feature-toast]").forEach(button => {
      if (button.dataset.featureBound === "true") return;
      button.dataset.featureBound = "true";
      button.addEventListener("click", () => showToast(button.dataset.featureToast));
    });
  }

  function renderFeatureRoute() {
    const route = currentRoute();
    if (!featureRoutes.has(route)) return;
    if (window.FlipForgeCustomerManagement
        && typeof window.FlipForgeCustomerManagement.handles === "function"
        && window.FlipForgeCustomerManagement.handles(route)
        && window.FlipForgeCustomerManagement.isEligible()) return;

    switch (route) {
      case "discover": renderDiscoverFull(); break;
      case "portfolio": renderPortfolio(); break;
      case "sell": renderSell(); break;
      case "alerts": renderAlerts(); break;
      case "account": renderAccount(); break;
      default: return;
    }

    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  window.addEventListener("hashchange", () => window.requestAnimationFrame(renderFeatureRoute));
  window.requestAnimationFrame(renderFeatureRoute);
})();
