# Production Hardening

Phase 17 hardening requires HTTPS application origins, strong distinct JWT secrets, live Stripe server credentials, SMTP configuration, and an absolute persistent upload directory in production.

## Required checks

```bash
npm ci
npm run check
npm run audit:prod
```

Before production deployment, validate CORS/cookies behind the final proxy, persistent upload storage, MongoDB backups and restore procedure, Stripe webhook delivery/signature verification, responsive layouts, and accessibility.
