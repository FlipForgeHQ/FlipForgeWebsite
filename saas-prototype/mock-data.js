window.FlipForgePrototypeData = Object.freeze({
  meta: {
    mode: "NON_PRODUCTION_PROTOTYPE",
    generatedAt: "2026-07-28T22:45:00-04:00",
    source: "Local mock responses shaped like future read-only API contracts",
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence"
  },

  dashboard: {
    metrics: [
      { label: "Tracked opportunities", value: "35", note: "+6 this week", tone: "blue", icon: "↗" },
      { label: "Evidence-ready", value: "72%", note: "+8 percentage points", tone: "green", icon: "◎" },
      { label: "Portfolio value", value: "$18,420", note: "+3.8% prototype trend", tone: "purple", icon: "◫" },
      { label: "Needs verification", value: "7", note: "2 high-priority", tone: "orange", icon: "!" }
    ],
    valueHistory: [
      { date: "Jul 21", ask: 520, supported: 548 },
      { date: "Jul 22", ask: 525, supported: 555 },
      { date: "Jul 23", ask: 510, supported: 561 },
      { date: "Jul 24", ask: 535, supported: 570 },
      { date: "Jul 25", ask: 540, supported: 576 },
      { date: "Jul 26", ask: 532, supported: 582 },
      { date: "Jul 27", ask: 525, supported: 590 },
      { date: "Jul 28", ask: 525, supported: 602 }
    ],
    evidenceReadiness: {
      score: 72,
      checks: [
        { label: "Exact identity", detail: "Year, set, card number, parallel and grade aligned", status: "Confirmed", ok: true },
        { label: "Completed sales", detail: "Four accepted sales within the prototype window", status: "Accepted", ok: true },
        { label: "Freshness", detail: "Latest accepted sale is 11 days old", status: "Current", ok: true },
        { label: "PSA population", detail: "Saved snapshot is available but older than pricing evidence", status: "Display only", ok: false }
      ]
    },
    activities: [
      { icon: "◎", title: "Evidence package refreshed", detail: "Ohtani Chrome PSA 10", time: "8 min ago" },
      { icon: "↗", title: "Opportunity moved to WATCH", detail: "Mahomes Silver Prizm PSA 10", time: "34 min ago" },
      { icon: "⇄", title: "Comparison saved", detail: "Ohtani vs Mahomes", time: "2 hr ago" },
      { icon: "A+", title: "PSA scenario reviewed", detail: "Wembanyama Prizm raw", time: "Yesterday" }
    ]
  },

  opportunities: [
    {
      id: "opp-ohtani-150",
      initials: "SO",
      card: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 10",
      shortCard: "Ohtani Chrome Refractor PSA 10",
      player: "Shohei Ohtani",
      category: "Baseball · Rookie Card",
      ask: 525,
      supported: 602,
      confidence: 86,
      liquidity: 91,
      risk: 32,
      evidence: 4,
      rank: 88,
      recommendation: "BUY",
      updated: "8 min ago",
      gap: 77,
      gapPercent: 14.7,
      identity: "Confirmed",
      freshness: "Current",
      reasons: [
        "Exact card identity is confirmed across saved records.",
        "Four accepted completed sales support the current value range.",
        "Liquidity remains strong for a high-recognition rookie card.",
        "The ask remains below the supported value after fees are considered."
      ],
      risks: [
        "A single premium sale was excluded from the accepted range.",
        "Population growth should be monitored before treating scarcity as fixed.",
        "This is decision support, not a guaranteed resale outcome."
      ]
    },
    {
      id: "opp-mahomes-269",
      initials: "PM",
      card: "2017 Panini Prizm Patrick Mahomes II #269 Silver Prizm PSA 10",
      shortCard: "Mahomes Silver Prizm PSA 10",
      player: "Patrick Mahomes II",
      category: "Football · Rookie Card",
      ask: 8000,
      supported: 8500,
      confidence: 79,
      liquidity: 65,
      risk: 50,
      evidence: 0,
      rank: 57,
      recommendation: "WATCH",
      updated: "34 min ago",
      gap: 500,
      gapPercent: 5.9,
      identity: "Not confirmed",
      freshness: "Needs accepted sales",
      reasons: [
        "The card is highly recognized and remains liquid relative to its price tier.",
        "The current ask is below the saved supported-value estimate.",
        "Collector demand remains strong for the player's flagship rookie issue."
      ],
      risks: [
        "No accepted completed-sale evidence is attached to this exact saved record.",
        "Parallel, grade and card number require exact confirmation.",
        "High-dollar transactions can show wide spreads and slower exits."
      ]
    },
    {
      id: "opp-wemby-136",
      initials: "VW",
      card: "2023 Panini Prizm Victor Wembanyama #136 Silver Prizm Raw",
      shortCard: "Wembanyama Silver Prizm Raw",
      player: "Victor Wembanyama",
      category: "Basketball · Rookie Card",
      ask: 410,
      supported: 445,
      confidence: 73,
      liquidity: 88,
      risk: 61,
      evidence: 5,
      rank: 71,
      recommendation: "VERIFY",
      updated: "1 hr ago",
      gap: 35,
      gapPercent: 7.9,
      identity: "Confirmed",
      freshness: "Current",
      reasons: [
        "Five accepted completed sales support a narrow prototype value range.",
        "Demand and liquidity are strong for the player's rookie-year cards.",
        "The saved ask is below the center of the accepted range."
      ],
      risks: [
        "Raw condition cannot be inferred from listing text or population counts.",
        "Centering, surface and print defects could materially change grading economics.",
        "A raw-card purchase requires manual inspection."
      ]
    },
    {
      id: "opp-doncic-280",
      initials: "LD",
      card: "2018 Panini Prizm Luka Doncic #280 BGS 9.5",
      shortCard: "Doncic Prizm BGS 9.5",
      player: "Luka Doncic",
      category: "Basketball · Rookie Card",
      ask: 1325,
      supported: 1460,
      confidence: 82,
      liquidity: 78,
      risk: 39,
      evidence: 6,
      rank: 80,
      recommendation: "BUY",
      updated: "2 hr ago",
      gap: 135,
      gapPercent: 9.2,
      identity: "Confirmed",
      freshness: "Current",
      reasons: [
        "Six accepted sales support the saved value range.",
        "The grade and card identity are consistently represented.",
        "The ask leaves a positive value gap before optional selling costs."
      ],
      risks: [
        "BGS subgrades can affect buyer preference and resale spread.",
        "PSA cross-grade outcomes are not assumed.",
        "Market demand may change with player performance and supply."
      ]
    },
    {
      id: "opp-mcdavid-201",
      initials: "CM",
      card: "2015 Upper Deck Young Guns Connor McDavid #201 BGS 9.5",
      shortCard: "McDavid Young Guns BGS 9.5",
      player: "Connor McDavid",
      category: "Hockey · Rookie Card",
      ask: 2950,
      supported: 3050,
      confidence: 67,
      liquidity: 59,
      risk: 54,
      evidence: 2,
      rank: 62,
      recommendation: "VERIFY",
      updated: "Yesterday",
      gap: 100,
      gapPercent: 3.3,
      identity: "Confirmed",
      freshness: "Watch",
      reasons: [
        "Two accepted sales support a limited prototype range.",
        "The card has strong collector recognition and established demand."
      ],
      risks: [
        "The accepted evidence count is too small for high confidence.",
        "BGS subgrades and surface characteristics require manual review.",
        "The current value gap is narrow relative to transaction costs."
      ]
    }
  ],

  psaAdvisor: {
    cardId: "opp-wemby-136",
    title: "2023 Panini Prizm Victor Wembanyama #136 Silver Prizm Raw",
    authority: "Existing PSA intelligence",
    guidance: "VERIFY CONDITION",
    confidence: 64,
    rawValue: 445,
    gradingCost: 55,
    scenarios: [
      { grade: "Raw", value: 445, probability: null, net: 445, note: "Sell without grading" },
      { grade: "PSA 9", value: 520, probability: 48, net: 465, note: "Modest upside after prototype cost" },
      { grade: "PSA 10", value: 1125, probability: 18, net: 1070, note: "High upside, low estimated outcome share" }
    ],
    population: [
      { grade: "PSA 10", count: 8120 },
      { grade: "PSA 9", count: 6470 },
      { grade: "PSA 8 or lower", count: 1735 }
    ],
    checks: [
      { label: "Centering", status: "Manual review required", ok: false },
      { label: "Surface", status: "Manual review required", ok: false },
      { label: "Corners and edges", status: "Manual review required", ok: false },
      { label: "Grade spread", status: "Saved market context available", ok: true },
      { label: "Population context", status: "Display only", ok: true }
    ]
  },

  evidence: {
    cardId: "opp-ohtani-150",
    readiness: 86,
    acceptedSales: [
      { marketplace: "eBay", price: 585, date: "2026-07-17", match: "Exact", state: "Accepted" },
      { marketplace: "eBay", price: 610, date: "2026-07-13", match: "Exact", state: "Accepted" },
      { marketplace: "Card marketplace", price: 598, date: "2026-07-08", match: "Exact", state: "Accepted" },
      { marketplace: "Auction house", price: 625, date: "2026-07-03", match: "Exact", state: "Accepted" }
    ],
    timeline: [
      { title: "Identity confirmed", detail: "Year, set, card number, refractor parallel and PSA 10 grade matched.", time: "Jul 28", ok: true },
      { title: "Completed sales accepted", detail: "Four exact completed sales passed the existing evidence acceptance path.", time: "Jul 28", ok: true },
      { title: "Pricing context calculated", detail: "Supported value reflects saved accepted evidence and existing adjustment rules.", time: "Jul 28", ok: true },
      { title: "Population snapshot reviewed", detail: "Saved population context is older than pricing evidence and remains display-only.", time: "Jul 27", ok: false }
    ]
  }
});
