# Live Production Parity Boundary

The parity gate proves only that the public Website deployment corresponds to the intended Git commit and preserves the deployment authority markers.

It does not:

- authenticate as a customer;
- inspect tenant data;
- mutate production records;
- exercise Smart Opportunity decisions;
- recalculate PSA guidance;
- activate checkout or billing;
- validate the running Java service identity;
- replace the signed-in Beta Complete customer-path QA.

Those boundaries are deliberate so deployment verification cannot quietly become a second product authority or an operator shortcut around the live QA checklist.
