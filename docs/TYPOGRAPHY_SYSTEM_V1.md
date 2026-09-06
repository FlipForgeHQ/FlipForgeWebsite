# FlipForge Public Typography System V1

This document defines the authoritative public-site typography hierarchy.

## Principle
Consistency does not mean every heading is the same size. It means the same semantic role uses the same scale everywhere.

## Locked public scales
- Home display: `clamp(42px, 4vw, 54px)`
- Internal page title: `clamp(36px, 3.6vw, 48px)`
- Section title: `clamp(28px, 2.6vw, 36px)`
- Lead copy: `16px`
- Standard body / section copy: `15px`
- Desktop navigation: `13px`
- Labels / eyebrows: `10px` to `12px` depending on function

## Mobile scales
- Home display: `clamp(36px, 9.5vw, 44px)`
- Internal page title: `clamp(32px, 8.8vw, 40px)`
- Section title: `clamp(24px, 7vw, 30px)`
- Lead copy: `16px`

## App distinction
The authenticated SaaS application intentionally uses a smaller workspace-heading scale because it is an application UI rather than a marketing page. Do not enlarge app page headings to marketing-hero sizes.

## Rule
Page-specific styles may control layout, color, spacing, and composition, but must not redefine the shared public title hierarchy unless an explicit exception is approved.
