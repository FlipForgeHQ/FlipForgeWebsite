# FlipForge Customer App Audit Policy

This policy locks the operating rule for the full customer application:

> No customer-facing behavior is considered complete until its relevant customer journey, failure state, viewport, routing behavior, and authority boundary are represented by an executable audit.

## Required before merge

- New customer route: add it to the governed route matrix and executable route audit.
- New protected action: audit anonymous, authenticated, success, and failure behavior as applicable.
- New API-backed surface: audit unavailable/invalid response behavior and prohibit synthetic fallback.
- New navigation or shell control: audit desktop and mobile visibility, destination, and route preservation.
- New decision/evidence/outcome presentation: audit that the browser remains display-only and does not create authoritative values.
- New authentication or entitlement behavior: audit recovery, return path, and non-member behavior.
- New customer-visible copy transformation: audit source-rendered language rather than relying only on late DOM rewrites.

## Failure rule

If production exposes a customer-facing defect that should have been mechanically testable, the repair must include a regression audit that would have failed before the repair. Fixing only the visible symptom is insufficient.
