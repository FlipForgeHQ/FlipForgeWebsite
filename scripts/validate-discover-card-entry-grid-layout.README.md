# Discover card-entry grid regression

Run:

```bash
node scripts/validate-discover-card-entry-grid-layout.mjs
```

The regression fails if Guided Mode inserts its direct-entry hint inside the Discover form grid or if the primary Card Identity field depends on being the form's first child to span the full width.
