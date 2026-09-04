# Staff Management

## Purpose

The Admin Portal uses MongoDB-backed staff identities. `.env` seeding is reserved for the bootstrap `SUPER_ADMIN`; normal staff accounts are created through the Admin Portal.

## Account lifecycle

```text
SUPER_ADMIN / authorized staff manager
        ↓
Create Admin User
        ↓
Assign one or more roles
        ↓
One-time 24-hour setup token is generated
        ↓
Only the SHA-256 token hash is stored
        ↓
SMTP sends the setup URL
        ↓
Staff member creates their own strong password
        ↓
Account becomes ACTIVE
```

Passwords are never emailed or stored in plaintext.

## Statuses

- `PENDING_SETUP` — active identity exists but a one-time password setup is still required.
- `ACTIVE` — the staff member may authenticate normally.
- `DISABLED` — authentication is blocked and active sessions are revoked.

## Security rules

- `SUPER_ADMIN` is the root bootstrap role.
- Only a `SUPER_ADMIN` can assign or modify another `SUPER_ADMIN` account.
- The final active `SUPER_ADMIN` cannot be disabled or stripped of the role.
- A delegated staff manager cannot assign a role containing permissions they do not personally hold.
- A delegated role manager cannot grant permissions they do not personally hold.
- The `CUSTOMER` role cannot be assigned to an admin user.
- Admin-initiated password reset revokes existing sessions and requires the user to establish a new password.
- Account deactivation revokes existing sessions.
- Staff, role, password-reset, and session-revocation actions are audit logged.
- `SUPER_ADMIN` role permissions are system-protected and not editable in the Admin Portal.

## Admin routes

```text
/staff/users
/staff/roles
/staff/permissions
/staff/audit-logs
```

Public account setup:

```text
/setup-password?token=<one-time-token>
```

## API

```text
GET   /api/v1/admin/staff/users
GET   /api/v1/admin/staff/users/:id
POST  /api/v1/admin/staff/users
PATCH /api/v1/admin/staff/users/:id
POST  /api/v1/admin/staff/users/:id/reset-password
POST  /api/v1/admin/staff/users/:id/logout-all

GET   /api/v1/admin/staff/roles
POST  /api/v1/admin/staff/roles
PATCH /api/v1/admin/staff/roles/:id

GET   /api/v1/admin/staff/permissions
GET   /api/v1/admin/staff/audit-logs

POST  /api/v1/auth/admin/setup-password
```

All authenticated write endpoints require Admin CSRF protection. Backend permission middleware remains authoritative.

## MongoDB

Existing collections:

```text
adminUsers
adminSessions
roles
permissions
auditLogs
```

New collection:

```text
adminAccountTokens
```

`adminAccountTokens` stores only token hashes and uses a TTL index on `expiresAt`.
