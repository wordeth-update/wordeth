---
name: Apliiq callback contracts
description: Non-obvious authentication and reliability constraints in Apliiq's custom-store callbacks.
---

Apliiq's documented custom-store callbacks do not share one authentication scheme:

- Fulfillment sends `x-apliiq-hmac`. Verify it against the exact raw request bytes using the documented base64-payload HMAC flow; never reconstruct JSON before verification.
- Warehouse shipment completion sends `x-apliiq-appId`, which must match the custom store's app key.
- Add-to-Store and Product Search currently document no authentication header. Keep imported product records pending and separate from storefront publication so unauthenticated requests cannot publish merchandise.
- Apliiq's fulfillment documentation spells the algorithm as `HMACSHA265`; treat this as the documented SHA-256 typo unless Apliiq gives Wordeth a different signed contract.

**Why:** Applying one generic webhook middleware breaks Apliiq's current contract, while trusting unauthenticated Add-to-Store input as a live listing creates a catalog-injection risk. Fulfillment callbacks can also be duplicated or arrive before local order mapping exists.

**How to apply:** Preserve raw JSON for fulfillment, use callback-specific authentication, deduplicate provider events with owned processing leases, merge multi-package tracking, and retain unmatched fulfillment events for reconciliation and recovery sweeps.