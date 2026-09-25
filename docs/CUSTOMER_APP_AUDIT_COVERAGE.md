# Customer App Audit Coverage Matrix

This matrix is a release-control index for the full customer app. It does not replace the executable audits; it makes the intended coverage explicit so missing states are visible during review.

| Area | Anonymous 401 | Authenticated | Stale cached identity + 401 | Desktop | Mobile | Blank-state guard | Route return | Authority guard |
|---|---|---|---|---|---|---|---|---|
| Home / Dashboard | Required | Required | Required | Required | Required | Required | Required | Required |
| Discover | Required | Required | Required | Required | Required | Required | Required | Required |
| Evaluate | Required | Required | Required | Required | Required | Required | Required | Required |
| Decision Intelligence | Required | Required | Required | Required | Required | Required | Required | Required |
| Why This Decision (Decision Intelligence subview) | Required | Required | Required | Required | Required | Required | Required | Required |
| Evidence Review | Required | Required | Required | Required | Required | Required | Required | Required |
| Saved Decisions | Required | Required | Required | Required | Required | Required | Required | Required |
| Outcome Intelligence | Required | Required | Required | Required | Required | Required | Required | Required |
| Portfolio | Required | Required | Required | Required | Required | Required | Required | Required |
| Alerts | Required | Required | Required | Required | Required | Required | Required | Required |
| Forge Heat | Required | Required | Required | Required | Required | Required | Required | Required |
| Market View | Required | Required | Required | Required | Required | Required | Required | Required |
| Account | Required | Required | Required | Required | Required | Required | Required | Required |
| Compare | Required | Required | Required | Required | Required | Required | Required | Required |
| PSA Advisor | Required | Required | Required | Required | Required | Required | Required | Required |
| Audit Export | Required | Required | Required | Required | Required | Required | Required | Required |

Exit Review is intentionally withheld from the governed customer route matrix until a separate Exit / Position Intelligence customer contract is implemented and validated. Direct `#/sell` access must fail closed before legacy prototype content can render.

## Navigation-isolation coverage

The full customer app and private-beta shell are audited as separate navigation surfaces.

- Full customer must expose the complete Card Decision Intelligence hierarchy, including Why This Decision and Evidence Review.
- Private beta must retain its intentionally simplified core navigation.
- Why This Decision and Evidence Review must not appear as full-customer top-level links in private beta.
- Evidence Review must not be duplicated inside Advanced Analysis after promotion to the full-customer top level.
- Private-beta workflow links may still open the existing governed evidence route internally; the shared evidence authority is not duplicated or disabled.

## Merge expectation

If a customer feature adds a route, subview, protected state, action, identity assumption, authority-bearing surface, or navigation tier, the route/state must be added to the executable customer audit before the feature is treated as complete. Browser identity alone is never sufficient evidence of a healthy authenticated state when the authoritative service returns 401.
