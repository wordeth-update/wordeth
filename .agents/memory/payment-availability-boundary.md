---
name: Payment availability boundary
description: How Wordeth should behave when Stripe webhook verification is not configured.
---

Wordeth may serve its public site without a Stripe webhook signing secret, but the webhook endpoint must reject every event until verification is configured.

**Why:** Payment configuration failure should not take the entire public site offline, while unverified callbacks must never activate subscriptions, grant tokens, or change orders.

**How to apply:** Keep public browsing available, fail Stripe webhook requests closed, surface a startup warning, and treat checkout/subscription activation as unavailable until all Stripe production credentials are configured.