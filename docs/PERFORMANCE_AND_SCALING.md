# Performance and Scaling Plan

This project can grow, but it should not keep loading the whole MongoDB database into the browser as data grows.

## Changes Already Applied

- Static assets now use browser caching in production.
- The Excel importer is lazy-loaded only when a user imports a spreadsheet.
- Audit logs are excluded from the initial bootstrap and loaded when the Audit page opens.
- Customer, cheque, and item tables now render with pagination.
- Filter inputs are debounced so typing does not rerender large tables on every keystroke.
- Frontend normalized data is cached during render work to avoid repeated array rebuilding.
- The client is split into core helpers, reusable UI components, feature workflows, page files, and a small app shell.
- MongoDB indexes were added for common lookup, filter, and sort fields.
- Backend models, routes, services, middleware, and utilities are now split into separate folders.
- `GET /api/:collection` now supports future server-side pagination/search:

```text
GET /api/transactions?page=1&limit=25&q=customer&from=2026-06-01&to=2026-06-30
```

When `page` is provided, the response is:

```json
{
  "rows": [],
  "page": 1,
  "limit": 25,
  "total": 0,
  "totalPages": 1
}
```

## Client Structure

The current client structure is intentionally build-free, so it still deploys as static HTML/CSS/JS:

```text
client/
  js/app.js
  css/
  js/core/
    state.js
    api-auth.js
  js/components/
    ui.js
  js/features/
    settings-notes.js
    receipts-forms.js
  js/pages/
    dashboard-sales.js
    ledger.js
    dues.js
    customers-items.js
    cheques.js
    suppliers-purchases.js
    audit.js
```

As the app grows, move any newly built screen directly into `js/pages/`, and place repeated controls in `js/components/`.

## Data Strategy For Huge Data

- Keep only small reference data in bootstrap, such as settings and dropdown lists.
- Load ledger, customers, cheques, purchases, and audit data page-by-page from the server.
- Use server-side filters for search, date ranges, status, and account heads.
- Add dedicated aggregate endpoints for dashboards instead of calculating all totals in the browser.
- Avoid exporting massive CSV files from in-memory browser arrays. Generate large exports on the server.

## Backend Structure

```text
server/
  models/
  routes/
  middleware/
  services/
  utils/
```

Current split:

- `models/` for Mongoose schemas and indexes.
- `routes/collections.js` for CRUD, sync, seed, settings, and paginated search.
- `routes/auth.js` for login/signup/session identity.
- `routes/action-lock.js` for edit/delete password controls.
- `routes/bootstrap.js` for startup data.
- `services/audit.js` for audit logging.
- `services/records.js` for shared collection save/query/bootstrap logic.
- `services/normalizers.js` for import/API data normalization.
- `middleware/auth.js` for JWT/password helpers and auth enforcement.
