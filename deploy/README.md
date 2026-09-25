# Deploying Kaalachakra

Two containers: `kaalachakra-api` (Node, the Fastify API, SQLite in `/data`)
and `kaalachakra-web` (nginx: the built React app, and `/api/` proxied to the
API with the prefix stripped). Only the web container is reached from outside,
through Nginx Proxy Manager and the Cloudflare tunnel.

- `Dockerfile.api`, `Dockerfile.web`, `nginx.conf` - the images.
- `docker-compose.snippet.yml` - the two services for jserver1's
  `~/docker/docker-compose.yml`.
- `docker-compose.local.yml` - a throwaway stack for a smoke test.

Persistent data on jserver1: `/data/apps/kaalachakra/data` (the database,
`secret.key`, and on first start `INITIAL_ADMIN_PASSWORD`) and
`/data/apps/kaalachakra/places/gazetteer.db` (built on a workstation with
`pnpm --filter @kaalachakra/places build:data`, copied over, mounted read-only).

First start creates `admin@janmejay.info` with a generated password in
`/data/apps/kaalachakra/data/INITIAL_ADMIN_PASSWORD`; it is deleted when the
admin changes it. If the admin is locked out:
`docker exec -it kaalachakra-api node apps/kaalachakra-api/src/cli.js reset-admin`.

See ../docs/ACCOUNTS.md for the account model.
