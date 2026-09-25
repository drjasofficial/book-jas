# Hostinger deployment handoff

This project is being provided to you specifically because you already have authorized access to Jaspreet's Hostinger server. Use that existing authorized access only to deploy this package. Do not place Hostinger login details, SSH keys, API tokens, or other server credentials inside this project.

The server already runs separate staging and production business containers. Do not modify, restart, rename, or replace those containers. Deploy this package as a new isolated container named `book-jas-api`.

## Files in this package

- `server.js` — receives consented booking events and serves the private dashboard.
- `package.json` — Node.js service metadata; no third-party packages are required.
- `Dockerfile` — builds the isolated API container.
- `compose.yml` — binds the API only to `127.0.0.1:8787` and creates a persistent volume.
- `.env.example` — safe environment-variable template. Copy it to `.env` on the server.
- `README.md` — detailed deployment, reverse-proxy, dashboard, and backup instructions.

## Hostinger deployment

1. Upload and extract this package into a new directory such as `/opt/book-jas-api`.
2. Enter the extracted directory and create the private configuration:

   ```sh
   cp .env.example .env
   ```

3. Generate two different secrets and place them in `.env`:

   ```sh
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Use one result for `ADMIN_PASSWORD` and the other for `IP_HASH_SECRET`. Do not send these values through chat or commit `.env` to Git.

4. Keep these important settings:

   ```env
   ALLOWED_ORIGINS=https://drjasofficial.github.io
   TRUST_PROXY=true
   STORE_FULL_IP=false
   ```

   Full IP storage should remain disabled unless it is genuinely required and covered by the visitor-facing notice and a suitable retention policy.

5. Start only the new API service:

   ```sh
   docker compose up -d --build book-jas-api
   docker compose ps
   curl http://127.0.0.1:8787/health
   ```

   The health request must return `{"ok":true}`.

6. Use the dedicated HTTPS hostname `book-api.medax.ai` and reverse-proxy it to `http://127.0.0.1:8787`. Do not expose port 8787 publicly.

7. Confirm `https://book-api.medax.ai/health` works before connecting or publishing the website.

8. Give Jaspreet the final HTTPS API hostname. The website's `config.js` must be updated with this hostname before form submissions can reach the API.

9. The private dashboard will be at `https://book-api.medax.ai/admin`. It uses the `ADMIN_USER` and `ADMIN_PASSWORD` values from `.env`.

Approximate city/region information is available only if the trusted reverse proxy supplies location headers. Exact GPS location is intentionally not requested.
