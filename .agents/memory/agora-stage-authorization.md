---
name: Agora stage authorization
description: Production configuration required for server-issued listener and speaker audio privileges.
---

Agora Co-host Authentication must be enabled for the exact production app ID before treating listener tokens as unable to publish audio.

**Why:** Agora's per-stream publish privileges are only enforced when Co-host Authentication is enabled. App ID and certificate token generation alone cannot prove that a modified listener client is blocked from publishing.

**How to apply:** Any change to room stage authorization needs a production-safe smoke test: listener publish is rejected, promotion plus token refresh permits publishing, and demotion/removal stops it.