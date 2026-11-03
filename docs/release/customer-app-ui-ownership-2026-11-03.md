# FlipForge Customer Application — Consolidation ownership ledger

**November 3, 2026 · Website #615 · Draft / NO-GO · original baseline `dcfae390d121c5beef30e0c29e0873c889caf39e`.**

The actual `saas-prototype/index.html` entry loads **74 JavaScript files and 63 stylesheets**. Count alone is not proof of redundant code. This is an initial source audit and not a finished acceptance report.

## Authoritative owners

| Area | Authoritative module | Preservation requirements |
| --- | --- | --- |
| Route dispatch and page ownership | `staging-route-hook.js` | `app.js` retains shell + fail-closed placeholders, not live beta sample records |
| Customer navigation/menu, order, labels, icons, Account chrome, Forge Heat beta marker | **`customer-only-shell-v1.js`** | Navigation writes transferred from `customer-professional-polish.js` and original behavior preserved |
| Discover | `customer-discovery.js` | `customer-professional-polish.js` eligible missing-render fallback only |
| Evaluate | `staging-evaluation.js` | Server validation, entitlement and evidence boundaries unchanged |
| Saved Decisions, card detail, receipts | `customer-opportunities.js` and bridge | Stale response and cross-account guards unchanged; receipt not recalculated |
| Alerts and Tracking | `customer-lifecycle.js` | `tracking-navigation-reload-v1.js` display cleanup retained pending transfer |
| Portfolio | `customer-portfolio.js` | Position/cost/review state always server-owned |
| Forge Heat | `customer-forge-heat.js` | No client-side scoring or decision override |
| Account / entitlements | `customer-account.js`, `customer-entitlements.js` | Auth, tenant isolation, billing boundaries |
| Beta guidance | `beta-customer-flow-v2.js` | Guided copy only; not navigation manifest owner |
| Copy and empty-state presentation | `customer-professional-polish.js`, `beta-qa-customer-polish-v1.js` | Must not change authority, permissions, provenance or saved economics |
| Auth, evidence, CardSight compliance | Server, identity/gateway gates, disclosures | Preserve evidence safeguards and CardSight SUSPENDED |

## Concrete code changes in this audit commit

- Transferred four existing navigation functions (account chrome, nav icons, nav group/secondary treatment, Forge Heat beta status) from the professional-polish overlay to the shell navigation owner; removed their original writer calls. This is not a new overlay.
- Scoped `beta-qa-customer-polish-v1.js`'s MutationObserver to `#main-content`, the only area it edits; stops observing every document character change.
- Updated card-switch and evidence-economics acceptance assertions to require exact cents, matching the customer contract; preserved out-of-order response test coverage.
- Moved read-only Deal Check component audit to `/app/customer`, leaving the actual `/app/beta` flags **disabled** on all hosts.
- Extended render-stability recording with Chromium idle main-thread and script time, not just DOM writes.

## Unresolved conflicts — mandatory release gate

- **Global prototype patch:** `dom-idempotent-writes-v1.js` intercepts Element/Node DOM methods. Do **not** retire it before verifying per-source idempotence; duplicate-render loops could reappear.
- **Broad observers:** `mobile-ui-runtime-fix-v1.js`, `customer-professional-polish.js`; presentation overlap in `tracking-navigation-reload-v1.js`. Requires measured before/after on each screen, then safe ownership transfer.
- `customer-route-ownership-v1.js` exists in the repo but is **not loaded** by the current beta HTML entry. Do not count it as runtime authority.
- Full browser acceptance with two *actual* beta accounts and restored histories has **not yet been performed by this audit**.
- New staging backup must contain and restore the two alert review/visit tables. Prior backup passed but predated the staging RC.
- The pre-change #615 suite had failing CI; a preview being built does not indicate acceptance.

## Required measurements

Run `scripts/journey/render-stability.mjs` against **original RC `3d88d3eb`**, **pre-consolidation `dcfae390`**, and this commit on matching Chromium, hardware, account data and routes. Each route needs an initial settle window and a six-second idle window. Compare mutation records, nodes, API requests, idle JavaScript milliseconds and main-thread milliseconds. Repeat desktop 1440px, tablet 820px and phone 390px.

Walk `/app/beta`: Discover → Evaluate → Save → Decision Receipt → Tracking → Alerts → Re-evaluate → Portfolio → Forge Heat. Confirm buttons, keyboard access, accessibility, cross-tenant access denial, exact card identity, disclosure content, legacy provenance, unchanged original receipt and disabled Decision Monitor.

**Release rule:** Any unresolved script conflict, repeated idle redraws, wrong-card rendering, broken control, prohibited data, failed test, inaccessible screen or unmet real-account gate = **NO-GO**. No production merge/deployment without explicit founder authorization.

## Loaded beta scripts (74)

1. `dom-idempotent-writes-v1.js`
2. `/assets/js/flipforge-identity.js`
3. `private-beta-access-gate.js`
4. `production-dashboard-guard.js`
5. `app.js`
6. `feature-pages.js`
7. `prototype-visual-loader.js`
8. `cockpit-layout-fix.js`
9. `cockpit-polish.js`
10. `cockpit-final-ux.js`
11. `route-guard.js`
12. `scroll-reset.js`
13. `sidebar-edge-fix.js`
14. `identity-login-redirect.js`
15. `production-identity-login-redirect.js`
16. `customer-trust-display-v1.js`
17. `provider-evidence-visibility.js`
18. `price-intelligence.js`
19. `staging-browser.js`
20. `staging-evaluation.js`
21. `bulk-evaluation.js`
22. `customer-opportunities.js`
23. `customer-opportunities-bridge.js`
24. `customer-card-cockpit.js`
25. `customer-explainability.js`
26. `customer-compare.js`
27. `customer-lifecycle.js`
28. `collection-intelligence-alerts-v1.js`
29. `customer-lifecycle-validation.js`
30. `customer-lifecycle-display.js`
31. `customer-reported-sales.js`
32. `customer-sell-watch.js`
33. `customer-management.js`
34. `customer-portfolio.js`
35. `customer-export.js`
36. `customer-discovery.js`
37. `semantic-replay-notice-v1.js`
38. `customer-forge-heat.js`
39. `customer-market-view.js`
40. `customer-entitlements.js`
41. `customer-account.js`
42. `customer-account-bridge.js`
43. `customer-billing-portal.js`
44. `customer-card-intelligence.js`
45. `card-brand-display.js`
46. `staging-route-hook.js`
47. `account-lifecycle.js`
48. `private-beta.js`
49. `core-platform-completion-v1.js`
50. `consumer-ux-refinement.js`
51. `customer-professional-polish.js`
52. `guided-mode-v1.js`
53. `guided-discover-focus-fix-v1.js`
54. `customer-save-flow-v1.js`
55. `beta-customer-flow-v2.js`
56. `decision-authority-consistency-v1.js`
57. `evidence-authority-split-v1.js`
58. `discover-card-entry-emphasis-v1.js`
59. `decision-intelligence-v1.js`
60. `tracking-customer-ux-v1.js?v=20260829-2`
61. `tracking-navigation-reload-v1.js?v=20260829-2`
62. `tracking-context-v1.js`
63. `beta-qa-customer-polish-v1.js`
64. `evidence-final-polish-v1.js`
65. `decision-intelligence-final-polish-v1.js`
66. `decision-intelligence-ux-v2.js`
67. `customer-cdi-signal-stack-v1.js`
68. `mobile-ui-runtime-fix-v1.js`
69. `customer-only-shell-v1.js`
70. `beta-session-v1.js`
71. `phase3-first-decision-activation-v1.js`
72. `beta-guided-discover-v1.js`
73. `deal-check-v1.js`
74. `decision-monitor-v1.js`

## Loaded beta stylesheets (63)

1. `styles.css`
2. `brand.css`
3. `shell-fixes.css`
4. `feature-pages.css`
5. `visual-intelligence.css`
6. `cockpit-expansion.css`
7. `cockpit-layout-fix.css`
8. `cockpit-polish.css`
9. `cockpit-final-ux.css`
10. `sidebar-edge-fix.css`
11. `staging-browser.css`
12. `staging-evaluation.css`
13. `customer-card-intelligence.css`
14. `account-lifecycle.css`
15. `customer-intelligence.css`
16. `customer-explainability.css`
17. `customer-dashboard.css`
18. `customer-compare.css`
19. `customer-management.css`
20. `customer-portfolio.css`
21. `customer-lifecycle.css`
22. `collection-intelligence-alerts-v1.css`
23. `customer-lifecycle-validation.css`
24. `customer-reported-sales.css`
25. `customer-sell-watch.css`
26. `customer-export.css`
27. `customer-discovery.css`
28. `customer-forge-heat.css`
29. `customer-market-view.css`
30. `consumer-pro-navigation.css`
31. `provider-evidence-visibility.css`
32. `price-intelligence.css`
33. `customer-entitlements.css`
34. `private-beta.css`
35. `core-platform-completion-v1.css`
36. `full-site-qa.css`
37. `consumer-ux-refinement.css`
38. `customer-professional-polish.css`
39. `guided-mode-v1.css`
40. `customer-save-flow-v1.css`
41. `beta-customer-flow-v2.css`
42. `discover-card-entry-emphasis-v1.css`
43. `customer-ui-system-v1.css`
44. `decision-intelligence-server-v1.css`
45. `decision-intelligence-ux-v2.css`
46. `customer-cdi-signal-stack-v1.css`
47. `guided-mode-layout-fix-v1.css`
48. `customer-readability.css`
49. `sidebar-nav-description-layout-fix-v1.css`
50. `guided-mode-compact-v1.css`
51. `guided-mode-light-v2.css`
52. `forge-heat-control-room-v2.css`
53. `mobile-shell-v4.css`
54. `customer-only-shell-v1.css`
55. `beta-session-v1.css`
56. `phase3-first-decision-activation-v1.css`
57. `customer-shell-brand-v1.css`
58. `customer-focused-v3-v1.css`
59. `customer-trust-display-v1.css`
60. `deal-check-v1.css`
61. `decision-monitor-v1.css`
62. `mobile-table-layout-v1.css`
63. `beta-guided-discover-v1.css`
