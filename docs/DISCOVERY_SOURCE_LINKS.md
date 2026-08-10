# Discover Original Marketplace Link Requirement

Status: **LOCKED CUSTOMER REQUIREMENT**

For every active-listing candidate returned by FlipForge Discover, when the authorized provider supplies a valid HTTP/HTTPS listing URL, the customer interface must provide a prominent direct link to the original marketplace listing.

## Required behavior
- Display the marketplace/provider name near the source link.
- Display the source hostname so the customer can see where the link leads.
- Label the action as `View on <Marketplace> ↗` when the marketplace can be identified.
- Open the original listing in a new tab with `noopener noreferrer` protections.
- Never invent, reconstruct, or guess a marketplace URL when the provider did not return one.
- Never convert an active listing into completed-sale evidence merely because the original listing can be opened.
- Smart Opportunity evaluation remains a separate explicit action.

## Trust principle
The customer should be able to inspect the actual source card/listing rather than being asked to trust a FlipForge summary without provenance.
