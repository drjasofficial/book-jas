# Book Jas API deployment

This API is intentionally separate from the existing business staging and production containers. It listens only on `127.0.0.1:8787`, persists events in a Docker volume, and should be exposed through the server's existing HTTPS reverse proxy.

## 1. Copy and configure

On the server, copy the `server` directory into its own folder, then create the private environment file:

```sh
cp .env.example .env
```

Set these values in `.env`:

- `ALLOWED_ORIGINS`: keep `https://drjasofficial.github.io` and the local preview origins.
- `ADMIN_PASSWORD`: a new password with at least 12 characters.
- `IP_HASH_SECRET`: a different random secret with at least 20 characters.
- `TRUST_PROXY=true`: use this only because the API is bound to localhost and reached through your trusted reverse proxy.
- `STORE_FULL_IP=false`: recommended. Change it to `true` only if full IP storage is genuinely required and disclosed to visitors.

Protect `.env`; do not commit it to Git.

## 2. Start the isolated container

```sh
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8787/health
```

The persistent data stays in the `book-jas-data` Docker volume when the container is replaced.

For a local end-to-end test, open `http://127.0.0.1:4173/?api=local`. Without that query parameter, the local page keeps the no-tracking share/download flow.

## 3. Add an HTTPS hostname

Create the `book-api.medax.ai` DNS record, then point the existing reverse proxy at `http://127.0.0.1:8787`. Example Nginx site:

```nginx
server {
    listen 443 ssl http2;
    server_name book-api.medax.ai;

    # Use your existing certificate configuration here.

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    }
}
```

Do not expose port 8787 publicly. HTTPS is required because the public GitHub Pages site is also HTTPS.

IP-based city/region data is only populated when the trusted proxy provides location headers. Cloudflare can add these with its visitor-location managed transform. Without those headers, the dashboard shows the IP or private hash but marks location unavailable. Exact GPS is never requested.

## 4. Connect the website

Edit `config.js` in the website root and replace the empty production `apiBaseUrl` with the HTTPS hostname:

```js
apiBaseUrl: localHosts.has(window.location.hostname)
  ? "http://127.0.0.1:8787"
  : "https://book-api.medax.ai",
```

Commit and push the website only after the public `/health` URL works.

## 5. Read submissions

Open `https://book-api.medax.ai/admin`. The browser will ask for `ADMIN_USER` and `ADMIN_PASSWORD`.

The dashboard shows the visitor name, completed choices, furthest step, open/leave times, device summary, IP or private hash, and approximate location when available. It refreshes every 30 seconds.

## Operations

```sh
# View status and recent logs
docker compose ps
docker compose logs --tail=100 book-jas-api

# Update only this API, without touching business containers
docker compose up -d --build book-jas-api

# Back up the append-only event file
docker compose exec book-jas-api sh -c 'cp /data/events.jsonl /data/events.backup.jsonl'
```

Keep a short retention period and remove old event data when it is no longer needed. Rotate the admin password immediately if it is ever exposed.
