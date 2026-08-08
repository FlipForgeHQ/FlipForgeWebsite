# FlipForge Paddle Live payment link

## Purpose

FlipForge uses a dedicated production page at:

```text
https://goflipforge.com/checkout/
```

as the approved Paddle transaction payment-link base URL.

Paddle appends the transaction id as `_ptxn=<txn_...>`. Paddle.js reads that query parameter and opens the provider-hosted checkout automatically after initialization.

## Browser credential boundary

The page uses only a Paddle **client-side token**. The token is injected during the Netlify build from:

```text
FLIPFORGE_PADDLE_CLIENT_TOKEN
```

The committed browser config remains empty and fail-closed. The build rejects non-Live token values.

Never place any of the following in the payment-link page or browser assets:

- `FLIPFORGE_PADDLE_API_KEY`
- `FLIPFORGE_PADDLE_WEBHOOK_SECRET`
- backend service tokens
- tenant ids
- opaque FlipForge billing references

## Production configuration sequence

1. Create a Paddle Live client-side token.
2. Add `FLIPFORGE_PADDLE_CLIENT_TOKEN` to the production Netlify site's build environment.
3. Deploy the merged website build.
4. Verify `https://goflipforge.com/checkout/` loads and initializes Paddle.js without exposing any server credential.
5. In Paddle Live, ensure `goflipforge.com` is an approved website/domain.
6. Set Paddle's default payment link to `https://goflipforge.com/checkout/`.
7. Set the production backend `FLIPFORGE_PADDLE_CHECKOUT_URL` to the exact same URL.
8. Keep the customer gateway and all Paddle activation switches disabled until the separate production activation gate authorizes launch.

## Authority boundary

Opening or creating a checkout does not grant FlipForge paid entitlement. Verified Paddle webhook processing remains the authority for subscription state. This page never grants sports-card transaction authority.
