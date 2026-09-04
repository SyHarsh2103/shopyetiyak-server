# Authentication — Phase 1

Customer and admin authentication are isolated by cookie names, session collections, token types, and route namespaces.
Access and refresh tokens are HttpOnly cookies. Refresh tokens are SHA-256 hashed in MongoDB, rotated on refresh, and revoked on logout/logout-all. Access middleware validates both JWT claims and persisted session state.

Double-submit CSRF protection uses a readable scope-specific CSRF cookie plus the `x-csrf-token` request header. The frontend obtains it from the scope's `/csrf` endpoint.

## Admin invitation and password setup

`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `SUPER_ADMIN_FULL_NAME` remain bootstrap-only inputs for `npm run seed:admin`.

Normal administrators are created through the Admin Portal. The server creates the identity with `mustSetPassword=true`, generates a one-time 24-hour token, stores only its SHA-256 hash, and sends the setup URL through SMTP. The user completes setup using `POST /api/v1/auth/admin/setup-password`. Successful setup hashes the new password with the configured bcrypt cost, clears `mustSetPassword`, records `passwordChangedAt`, invalidates the setup token, and revokes any existing sessions for that identity.
