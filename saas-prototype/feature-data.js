window.FlipForgeSaaSFeatureData = Object.freeze({
  meta: {
    mode: "NON_PRODUCTION_PROTOTYPE",
    generatedAt: "2026-07-29T12:15:00-04:00",
    source: "Display-only mock contracts for SaaS route validation",
    persistence: "IN_MEMORY_ONLY"
  },

  discover: {
    marketTrend: [
      { date: "Jul 21", demand: 68, liquidity: 72 },
      { date: "Jul 22", demand: 71, liquidity: 74 },
      { date: "Jul 23", demand: 69, liquidity: 73 },
      { date: "Jul 24", demand: 75, liquidity: 77 },
      { date: "Jul 25", demand: 78, liquidity: 79 },
      { date: "Jul 26", demand: 76, liquidity: 81 },
      { date: "Jul 27", demand: 82, liquidity: 83 },
      { date: "Jul 28", demand: 84, liquidity: 86 }
    ],
    savedSearches: [
      { name: "Rookie cards under supported value", matches: 12, updated: "8 min ago" },
      { name: "PSA 10 with current evidence", matches: 7, updated: "34 min ago" },
      { name: "Raw grading candidates", matches: 5, updated: "Yesterday" }
    ],
    listings: [
      { id: "listing-ohtani", player: "Shohei Ohtani", card: "2018 Topps Chrome #150 Refractor PSA 10", sport: "Baseball", ask: 525, identity: "Exact match", context: "Below saved supported value", status: "Investigate", freshness: "8 min" },
      { id: "listing-mahomes", player: "Patrick Mahomes II", card: "2017 Panini Prizm #269 Silver PSA 10", sport: "Football", ask: 8000, identity: "Unconfirmed parallel", context: "Discovery only", status: "Verify", freshness: "34 min" },
      { id: "listing-wemby", player: "Victor Wembanyama", card: "2023 Panini Prizm #136 Silver Raw", sport: "Basketball", ask: 410, identity: "Exact match", context: "Condition required", status: "Investigate", freshness: "1 hr" },
      { id: "listing-doncic", player: "Luka Doncic", card: "2018 Panini Prizm #280 BGS 9.5", sport: "Basketball", ask: 1325, identity: "Exact match", context: "Saved opportunity exists", status: "Tracked", freshness: "2 hr" },
      { id: "listing-mcdavid", player: "Connor McDavid", card: "2015 Upper Deck Young Guns #201 BGS 9.5", sport: "Hockey", ask: 2950, identity: "Exact match", context: "Thin evidence", status: "Verify", freshness: "Yesterday" },
      { id: "listing-witt", player: "Bobby Witt Jr.", card: "2022 Topps Chrome #35 Refractor PSA 10", sport: "Baseball", ask: 310, identity: "Card number review", context: "Active ask only", status: "Discovery", freshness: "Yesterday" }
    ]
  },

  portfolio: {
    totalValue: 18420,
    costBasis: 15950,
    unrealizedGain: 2470,
    evidenceReady: 74,
    allocation: [
      { label: "Baseball", value: 6820, share: 37 },
      { label: "Basketball", value: 5160, share: 28 },
      { label: "Football", value: 4050, share: 22 },
      { label: "Hockey", value: 2390, share: 13 }
    ],
    history: [
      { date: "Jan", value: 15180 },
      { date: "Feb", value: 15740 },
      { date: "Mar", value: 16220 },
      { date: "Apr", value: 16090 },
      { date: "May", value: 16980 },
      { date: "Jun", value: 17640 },
      { date: "Jul", value: 18420 }
    ],
    holdings: [
      { card: "Ohtani Chrome Refractor PSA 10", sport: "Baseball", quantity: 2, cost: 980, supported: 1204, confidence: 86, evidence: "Current" },
      { card: "Mahomes Silver Prizm PSA 10", sport: "Football", quantity: 1, cost: 7600, supported: 8500, confidence: 79, evidence: "Needs sales" },
      { card: "Doncic Prizm BGS 9.5", sport: "Basketball", quantity: 2, cost: 2480, supported: 2920, confidence: 82, evidence: "Current" },
      { card: "McDavid Young Guns BGS 9.5", sport: "Hockey", quantity: 1, cost: 2290, supported: 2390, confidence: 67, evidence: "Watch" },
      { card: "Wembanyama Silver Prizm Raw", sport: "Basketball", quantity: 3, cost: 1240, supported: 1335, confidence: 73, evidence: "Condition" }
    ]
  },

  sell: {
    assumptions: { marketplaceFeePercent: 13.25, shipping: 12, insurance: 8 },
    candidates: [
      { id: "sell-ohtani", card: "Ohtani Chrome Refractor PSA 10", supported: 602, confidence: 86, liquidity: 91, readiness: 88, evidence: "Current", recommendation: "REVIEW EXIT" },
      { id: "sell-doncic", card: "Doncic Prizm BGS 9.5", supported: 1460, confidence: 82, liquidity: 78, readiness: 81, evidence: "Current", recommendation: "REVIEW EXIT" },
      { id: "sell-mahomes", card: "Mahomes Silver Prizm PSA 10", supported: 8500, confidence: 79, liquidity: 65, readiness: 52, evidence: "Needs accepted sales", recommendation: "WAIT" },
      { id: "sell-mcdavid", card: "McDavid Young Guns BGS 9.5", supported: 3050, confidence: 67, liquidity: 59, readiness: 58, evidence: "Thin evidence", recommendation: "VERIFY" }
    ]
  },

  alerts: {
    rules: [
      { id: "alert-1", name: "Ohtani supported value changes by 5%", type: "Value", target: "Ohtani Chrome Refractor PSA 10", cadence: "Daily", active: true, last: "No trigger" },
      { id: "alert-2", name: "Mahomes receives accepted completed sale", type: "Evidence", target: "Mahomes Silver Prizm PSA 10", cadence: "Daily", active: true, last: "Waiting" },
      { id: "alert-3", name: "Wembanyama PSA population moves 3%", type: "Population", target: "Wembanyama Silver Prizm Raw", cadence: "Weekly", active: true, last: "No trigger" },
      { id: "alert-4", name: "Any tracked card falls below 60 confidence", type: "Risk", target: "Tracked opportunities", cadence: "Daily", active: false, last: "Paused" },
      { id: "alert-5", name: "Portfolio evidence readiness below 70%", type: "Portfolio", target: "Collection", cadence: "Daily", active: true, last: "No trigger" }
    ],
    recent: [
      { title: "Evidence package refreshed", detail: "Ohtani Chrome Refractor PSA 10", time: "8 min ago", severity: "Info" },
      { title: "Opportunity changed to WATCH", detail: "Mahomes Silver Prizm PSA 10", time: "34 min ago", severity: "Review" },
      { title: "Population snapshot became display-only", detail: "Wembanyama Silver Prizm Raw", time: "Yesterday", severity: "Warning" }
    ]
  },

  account: {
    profile: { name: "Todd Holbein", email: "owner-preview@example.com", role: "Prototype owner preview" },
    plan: { name: "Collector Intelligence", status: "Prototype only", renewal: "No billing connected", price: "$0 preview" },
    usage: [
      { label: "Evaluations", used: 12, limit: 50 },
      { label: "Saved opportunities", used: 35, limit: 100 },
      { label: "Active alerts", used: 4, limit: 20 },
      { label: "Portfolio cards", used: 9, limit: 250 }
    ],
    entitlements: [
      { label: "Decision intelligence", enabled: true, detail: "Read saved authority output" },
      { label: "PSA Advisor", enabled: true, detail: "Saved grading-guidance scenarios" },
      { label: "Evidence exports", enabled: false, detail: "Deferred until backend authorization" },
      { label: "Provider administration", enabled: false, detail: "Never exposed to customers" }
    ],
    security: [
      { label: "Authentication", state: "Not connected", detail: "Prototype route only" },
      { label: "Billing", state: "Not connected", detail: "No payment method is stored" },
      { label: "Provider credentials", state: "Server-side only", detail: "No credential field exists in this browser" },
      { label: "Session persistence", state: "Disabled", detail: "Prototype changes reset on refresh" }
    ]
  }
});
