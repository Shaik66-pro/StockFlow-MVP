# StockFlow MVP

A dependency-light SaaS inventory management MVP built from the provided PRD.

## Features

- Signup and login with email, password, and organization name
- Password hashing with PBKDF2 and HTTP-only session cookies
- Organization-scoped products to prevent cross-tenant data access
- Product create, read, update, and delete
- Unique SKU validation per organization
- Dashboard with total products, total quantity, retail value, and low-stock items
- Low-stock threshold per product with a global default in settings
- Responsive desktop-first interface

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

The app stores demo data in `data/db.json`, which is created automatically on first run.

## Notes

This MVP intentionally avoids external services and package dependencies so it can be demoed quickly. It uses Node's built-in HTTP server, file-backed JSON storage, PBKDF2 password hashing, and same-site HTTP-only cookies.
