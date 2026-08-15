# FlipForge Launch Roadmap Authority

**Canonical launch roadmap:** `toddholbein/FlipForge2` → `docs/FLIPFORGE_LAUNCH_ROADMAP.md`  
**Roadmap ID:** `FF-LAUNCH-2026-08`  
**Effective date:** 2026-08-15

## Rule

FlipForgeWebsite does not maintain an independent launch roadmap.

The controlling launch sequence lives in FlipForge2 and is:

1. Forge Heat Intelligence Core — COMPLETE / MERGED
2. Consumer Pro Interface — COMPLETE / MERGED
3. Pro Card Intelligence Cockpit — COMPLETE / MERGED
4. Unified Consumer Flow — COMPLETE / MERGED
5. Pro Entitlements & Packaging — COMPLETE / MERGED
6. Consumer UX Refinement — COMPLETE / CLOSED
7. 25-Card Validation / Proof — ACTIVE NEXT PHASE
8. Commercial Readiness — NOT YET PASSED
9. Controlled Pro Beta — NOT YET PASSED
10. Launch Candidate — NOT YET PASSED

## Phase 6 closure evidence in this repository

Consumer UX Refinement is closed based on already-merged customer-facing work and validation, including:

- PR #59 — commercial visual system across the customer app
- PR #61 — customer-shell cleanup and core-platform completion plan
- PR #66 — customer-readable Card Intelligence explainability
- PR #68 — Beta Complete release gate and live QA protocol
- PRs #70–#75 — display cleanup, unsupported-value handling, wrapping, responsive hardening, and production-built browser QA
- PR #76 — production brand/header lock
- PR #77 — customer-readable lifecycle validation
- PR #78 — Tracking label normalization
- PR #82 — visible unavailable/error-safe Price Intelligence states
- PR #83 — saved-history versus current-decision clarity
- PR #91 — Forge Heat responsive browser QA
- PRs #92–#93 — simplified and route-correct customer navigation

The merged QA evidence includes full-site desktop/tablet/mobile browser coverage, production-built `/app/` validation, Beta Complete validation, Forge Heat responsive QA, and focused navigation regression checks.

## Legacy roadmap handling

Older Website documents may contain labels such as Phase 1–5, Phase C, Beta Complete, or other implementation sequencing. Those remain useful historical/technical records but are subordinate to `FF-LAUNCH-2026-08` for launch sequencing.

When discussing them, use **Implementation Phase** or **historical roadmap** language so they cannot be mistaken for the current launch phase.

Open/draft work such as PR #86 (Bulk Evaluate app-shell wiring) or PR #87 (staged CardSight Card Finder/photo UI) may support a launch phase but does not redefine the launch order.

## Operating rule

**Build → validate → pass → immediately advance.**

The next launch phase after this reconciliation is **Phase 7 — 25-Card Validation / Proof**.
