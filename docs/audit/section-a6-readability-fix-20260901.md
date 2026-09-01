# Independent Audit Section A6 — responsive readability repair

Date: 2026-09-01

The first independent A6 Chromium run found customer-facing text below the 12px readability floor on the homepage, Product, Launch Plans, and Beta Application pages. It also exposed a false-positive desktop-navigation selector for the homepage's decision-focused header.

Repairs in this branch:

- enforce a 12px minimum for visible customer decision/help text on the homepage and marketing pages without changing larger typography;
- preserve the existing mobile navigation behavior;
- update the independent audit to recognize the homepage `.decision-nav-links` shell as valid desktop navigation;
- retain A1-A5 static/live checks in the same independent Section A workflow.

Acceptance: all A1-A6 jobs must complete successfully before Section A is marked PASS.
