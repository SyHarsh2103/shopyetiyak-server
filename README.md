# grocery-server

Backend API for the Grocery Commerce & Retail Operations Platform.

Phase 2 adds Catalog Management on top of the verified Phase 1 authentication/RBAC foundation.

## Runtime
- Node.js 24.19.0
- npm 11.17.0

## Phase 2 setup
1. `nvm use`
2. `npm install`
3. Keep the existing `.env` and add/verify `UPLOAD_PATH=./uploads`.
4. Run `npm run seed:rbac` to apply the Phase 2 catalog permissions without modifying the existing Super Admin account.
5. Optional/recommended initial catalog data: `npm run seed:catalog`.
6. Run `npm run check`.
7. Start with `npm run dev`.

Do not commit runtime uploads or production `.env` files.
