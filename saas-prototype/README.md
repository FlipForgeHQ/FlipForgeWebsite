# FlipForge SaaS Prototype

This directory contains the isolated, non-production customer SaaS UI prototype tracked by issue #10 and PR #12.

It does not replace the public homepage, connect to customer accounts, call live providers, calculate recommendations, accept evidence, or authorize transactions.

## Run locally

From the `FlipForgeWebsite` repository root on Windows:

```powershell
py -m http.server 4173 --directory .\saas-prototype
```

Then open:

```text
http://localhost:4173/#/dashboard
```

The prototype is dependency-free and can also be served by any static local web server.

## Validate

Node.js 20 or newer:

```powershell
node .\saas-prototype\validate.mjs
```

Expected result:

```text
SaaSPrototypeValidation
PASSED: 63
FAILED: 0
```

## Implemented milestone routes

- `#/dashboard`
- `#/discover`
- `#/evaluate`
- `#/opportunities`
- `#/opportunities/{id}`
- `#/compare`
- `#/psa-advisor`
- `#/evidence`
- `#/portfolio`
- `#/sell`
- `#/alerts`
- `#/account`

## Implemented customer intelligence

- Responsive desktop, tablet, and mobile application shell
- Saved opportunity dashboard and ranking table
- Interactive ask-versus-supported-value chart
- Opportunity detail with decision factors and evidence status
- Direct two-card comparison
- PSA grade-economics and population visuals
- Evidence readiness and provenance timeline
- Prototype account, plan, alerts, portfolio, discover, and sell route foundations
- Keyboard navigation, focus states, reduced-motion support, and mobile drawer navigation

## Authority boundaries

- Smart Opportunity remains the sole `BUY/WATCH/VERIFY/PASS` authority.
- Existing PSA intelligence remains the sole grading-guidance authority.
- The browser renders local mock responses shaped like future read-only API contracts.
- No provider key, provider administration, evidence acceptance, recommendation recalculation, bidding, checkout, or purchase authority exists in this prototype.
- No deployment or customer migration is included.
