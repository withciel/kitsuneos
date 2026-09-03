# Deploying `apps/app`

Production app runs on AWS App Runner with RDS Postgres. See [`infra/README.md`](../../infra/README.md).

## Local Docker Compose

```bash
docker compose up --build
```

Opens the console at [http://localhost:8080](http://localhost:8080) with Postgres on host port `5433`.

The app uses `network_mode: service:db` so it can reach Postgres on `127.0.0.1` (ports are published on the `db` service). Local demo mode (`KITSUNE_LOCAL_DEMO=1`) skips WorkOS login and seeds a starter CRM workspace. Set real `WORKOS_*` values and clear `KITSUNE_LOCAL_DEMO` for AuthKit.

## WorkOS (AuthKit)

| Variable | Description |
|----------|-------------|
| `WORKOS_API_KEY` | WorkOS API key |
| `WORKOS_CLIENT_ID` | AuthKit client id |
| `WORKOS_COOKIE_PASSWORD` | 32+ char session encryption secret |
| `WORKOS_REDIRECT_URI` | `https://app.kitsuneos.com/callback` |

## Database

| Variable | Description |
|----------|-------------|
| `KITSUNE_OWNER_URL` | Owner role connection string (Secrets Manager in prod) |
| `KITSUNE_APP_URL` | App role connection string |

## Dodo Payments

| Variable | Description |
|----------|-------------|
| `DODO_PAYMENTS_API_KEY` | API key |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Webhook signing secret |
| `DODO_PAYMENTS_ENVIRONMENT` | `test_mode` or `live_mode` |
| `DODO_PRODUCT_ID` | Subscription product for checkout |
| `BILLING_RECONCILE_SECRET` | Protects `/api/billing/reconcile` |

## Endpoints

- `GET /health` — health check
- `POST /api/mcp/tools/call` — HTTP MCP (Bearer API key)
- `GET /review` — review queue UI
- `POST /api/billing/webhook` — Dodo webhooks

## Deploy

```bash
./scripts/deploy-app.sh staging
./scripts/run-migrate.sh staging   # also run on first deploy
```
