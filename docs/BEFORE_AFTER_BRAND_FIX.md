# Before vs. After graphic brand correction

The legacy gold shield remains inside the historical WebP source, but the website now renders an approved vector correction layer over that area so the public graphic follows the current FlipForge identity without re-encoding or degrading the original visual.

## Applied correction

- Approved four open silver corner forms.
- Centered faceted gold square.
- FLIPFORGE™ wordmark.
- CARD INTELLIGENCE identity line.
- Dark navy integration field matching the graphic background.
- Responsive overlay sizing for desktop and mobile.
- Increased top breathing room for the Before vs. After section.

## Decision visual rendering

Two earlier generated WebP decision visuals could decode as WebP files yet still fail to paint reliably in some browser/Netlify combinations. The website now uses native SVG assets for these core panels:

- `assets/images/flipforge-grading-scenario.svg`
- `assets/images/flipforge-traceback-guidance.svg`

The build validates that both SVG files exist and rewrites any legacy homepage references away from the generated WebP paths. This keeps the Grading Scenario and Recommendation/Traceback panels crisp and deterministic across desktop and mobile.

## Authority boundary

The grading scenario graphic is illustrative decision-support content only. It does not predict the grade a raw card will receive, does not recalculate PSA guidance, and does not create a second grading authority. Existing PSA intelligence remains the sole grading-guidance authority.

## Preservation boundary

The remainder of the original Before vs. After comparison graphic is unchanged. These corrections are visual-only and do not affect SaaS behavior, recommendation authority, evidence policy, grading guidance, authentication, tenant isolation, billing, providers, or deployment activation.
