# orders-api

A small NestJS 12 service for orders, payments, shipping quotes, and nightly invoice export.
It runs on Kubernetes with three replicas behind a load balancer and uses Postgres and Redis.

## Run

```bash
npm ci
npm run start:dev
```

Copy `.env.example` to `.env` for local development.
