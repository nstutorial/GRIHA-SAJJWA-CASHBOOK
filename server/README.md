# G.S. Steel Furniture Cashbook Server

This folder contains the Node.js, Express, and MongoDB backend.

## Structure

```text
server.js       Express app setup, middleware, route mounting
models/         Mongoose schemas and indexes
routes/         Express route modules
services/       Shared business/data logic
middleware/     Authentication middleware
utils/          Small shared helpers
config/         Database configuration
scripts/        Data import/seed scripts
```

The frontend is in:

```text
../client
```

## Run with MongoDB

1. Install and start MongoDB Community Server locally.
2. From the `server` folder, install packages:

```bash
npm install
```

3. Import the Excel data that was extracted into `data/seed-data.json`:

```bash
npm run seed
```

4. Start the website and API:

```bash
npm start
```

5. Open the client through the server:

```text
http://127.0.0.1:8000/
```

## Database

Default MongoDB connection:

```text
mongodb://127.0.0.1:27017/gs_steel_cashbook
```

To use MongoDB Atlas or another server, set `MONGODB_URI` before running:

```bash
set MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/gs_steel_cashbook
npm start
```

## Collections

- `transactions`
- `dues`
- `customers`
- `cheques`
- `outgoingCheques`
- `suppliers`
- `items`
- `purchases`
- `notes`
- `settings`

## API

The server saves app data directly into MongoDB.

- `GET /api/health` checks server and MongoDB status.
- `GET /api/bootstrap` loads selected startup collections for the client.
- `GET /api/:collection` lists one collection. Add `page`, `limit`, `q`, `from`, and `to` query parameters for paged/search requests.
- `POST /api/:collection` saves one record to MongoDB.
- `PATCH /api/:collection/:id` updates one record.
- `DELETE /api/:collection/:id` deletes one record.
- `PUT /api/settings/:key` saves one settings value.
- `POST /api/sync` bulk-syncs browser local-storage data into MongoDB and returns a fresh bootstrap payload.

The server serves the client folder automatically. Keep MongoDB running while using the app.
