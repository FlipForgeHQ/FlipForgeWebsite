# Customer App Audit Coverage Matrix

This matrix is a release-control index for the full customer app. It does not replace the executable audits; it makes the intended coverage explicit so missing states are visible during review.

| Area | Anonymous 401 | Authenticated | Desktop | Mobile | Blank-state guard | Route return | Authority guard |
|---|---|---|---|---|---|---|---|
| Home / Dashboard | Required | Required | Required | Required | Required | Required | Required |
| Discover | Required | Required | Required | Required | Required | Required | Required |
| Evaluate | Required | Required | Required | Required | Required | Required | Required |
| Decision Intelligence | Required | Required | Required | Required | Required | Required | Required |
| Saved Decisions | Required | Required | Required | Required | Required | Required | Required |
| Outcome Intelligence | Required | Required | Required | Required | Required | Required | Required |
| Portfolio | Required | Required | Required | Required | Required | Required | Required |
| Alerts | Required | Required | Required | Required | Required | Required | Required |
| Forge Heat | Required | Required | Required | Required | Required | Required | Required |
| Market View | Required | Required | Required | Required | Required | Required | Required |
| Account | Required | Required | Required | Required | Required | Required | Required |
| Compare | Required | Required | Required | Required | Required | Required | Required |
| PSA Advisor | Required | Required | Required | Required | Required | Required | Required |
| Evidence | Required | Required | Required | Required | Required | Required | Required |
| Exit Review | Required | Required | Required | Required | Required | Required | Required |
| Audit Export | Required | Required | Required | Required | Required | Required | Required |

## Merge expectation

If a customer feature adds a route, protected state, action, or authority-bearing surface, the route/state must be added to the executable customer audit before the feature is treated as complete.
