# G.S. Steel Furniture Cashbook

Project structure:

```text
client/   HTML, CSS, and browser JavaScript
server/   Node.js, Express API, MongoDB connection, seed script
```

Client structure:

```text
client/
  js/app.js       App shell, navigation, render dispatcher, startup
  css/            Global and print stylesheets
  js/core/        Shared state, data normalizers, API/auth helpers
  js/components/  Reusable UI helpers such as tables, pagination, toast, CSV
  js/features/    Larger workflows such as receipts, forms, settings, notes
  js/pages/       Page renderers and page-specific actions
```

Backend structure:

```text
server/
  models/       Mongoose schemas and indexes
  routes/       Express route modules
  services/     Shared business/data logic
  middleware/   Auth middleware
  utils/        Small shared helpers
```

Run:

```bash
npm install
npm run seed
npm start
```

Open:

```text
http://127.0.0.1:5000/
```

MongoDB connection is configured in `server/.env` or defaults to:

```text
mongodb://127.0.0.1:27017/gs_steel_cashbook
```

The app stores cash denomination records in the `notes` collection.

## Scaling notes

See `docs/PERFORMANCE_AND_SCALING.md` for the current performance work and the recommended page/component split for larger datasets.

For large collections, prefer paged API calls instead of full bootstrap payloads:

```text
GET /api/transactions?page=1&limit=25&q=customer
```

## Deploy to Vercel

This repository includes `vercel.json`, `server/api/index.js`, and a root `package.json` for Vercel.

Set these environment variables in the Vercel project settings:

```text
MONGODB_URI=your MongoDB Atlas connection string
JWT_SECRET=use a long random secret
NODE_ENV=production
```

Optional for a custom domain:

```text
ALLOWED_ORIGINS=https://your-domain.com
```

MongoDB Atlas must allow connections from Vercel. If Atlas network access is locked to your home IP, the deployed app cannot connect.

Vercel Functions have a 4.5 MB request/response payload limit, so very large full-database sync or bootstrap responses may need pagination or a traditional Node host.
