# Staging Identity Input Focus Fix

## Purpose

Prevent repeated Netlify Identity auth-state snapshots from rebuilding the staging sign-in form while a user is typing.

## Boundary

This change does not enable the SaaS bridge, change tenant authority, modify Render, or activate production API access. It only stabilizes the non-production Identity form.

## Regression rule

The Identity client fingerprints authenticated user state and roles before re-rendering. Duplicate anonymous or authenticated snapshots are ignored so focused email/password controls remain mounted.
