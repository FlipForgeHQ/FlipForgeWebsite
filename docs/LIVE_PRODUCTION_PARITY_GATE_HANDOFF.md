# Live Production Parity Gate — Handoff

After merge, the next `main` push runs the live production parity workflow automatically. The workflow waits for Netlify to serve the exact merge SHA and then verifies the deployment authority markers.

If that workflow passes, record the exact SHA and result in Website #69, confirm the actual running FlipForge2 production service identity separately, and begin the controlled signed-in customer-path QA. If it fails, production remains unverified and signed-in release QA should not be treated as final proof for that source revision.
