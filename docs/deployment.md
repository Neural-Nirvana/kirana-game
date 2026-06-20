# Deployment

This document explains how to run the game locally and how the current VM deployment is structured.

## Local Development

Install:

```bash
npm install
```

Run frontend and backend:

```bash
npm run dev
```

This starts:

- Fastify backend on `127.0.0.1:8787`
- Vite frontend on `127.0.0.1:5175`

Vite proxies `/api` to the backend.

## Production Build

```bash
npm run build
```

Build output:

```text
dist/
```

## Production Server

```bash
npm run start
```

This runs:

```text
node --experimental-sqlite --import tsx server/index.ts
```

Node 22 or newer is required because the backend uses `node:sqlite`.

## Environment

Production `.env` should live at:

```text
/opt/kirana-game/.env
```

Recommended permissions:

```text
root:kirana
640
```

Common production variables:

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=z-ai/glm-5.2
KIRANA_SERVER_HOST=127.0.0.1
KIRANA_SERVER_PORT=8787
KIRANA_DB_PATH=/var/lib/kirana-game/kirana.sqlite
KIRANA_STATIC_ROOT=/opt/kirana-game/dist
```

Use this only behind HTTPS:

```text
KIRANA_COOKIE_SECURE=true
```

The current HTTP VM deployment keeps it unset so cookies work on plain HTTP.

## Current GCP VM Deployment

Current VM:

```text
taxfile-build-vm
```

Zone:

```text
asia-south1-b
```

Project:

```text
naari-479016
```

Current public URL:

```text
http://34.14.197.72/
```

App directory:

```text
/opt/kirana-game
```

Database:

```text
/var/lib/kirana-game/kirana.sqlite
```

Service:

```text
kirana-game
```

nginx proxies:

```text
public :80 -> 127.0.0.1:8787
```

## systemd Service Shape

The VM service runs as a dedicated `kirana` user.

Expected shape:

```ini
[Service]
User=kirana
Group=kirana
WorkingDirectory=/opt/kirana-game
EnvironmentFile=/opt/kirana-game/.env
Environment=NODE_ENV=production
Environment=KIRANA_SERVER_HOST=127.0.0.1
Environment=KIRANA_SERVER_PORT=8787
Environment=KIRANA_DB_PATH=/var/lib/kirana-game/kirana.sqlite
Environment=KIRANA_STATIC_ROOT=/opt/kirana-game/dist
ExecStart=/usr/bin/npm run server:start
Restart=always
```

## Update Flow

1. Build and verify locally.
2. Commit and push to GitHub.
3. Create a clean archive from the commit.
4. Copy archive to VM.
5. Extract into `/opt/kirana-game`.
6. Preserve `.env` and `/var/lib/kirana-game/kirana.sqlite`.
7. Run `npm ci`.
8. Run `npm run build`.
9. Restart `kirana-game`.
10. Verify local and public health.

Useful checks:

```bash
systemctl is-active kirana-game
curl -fsS http://127.0.0.1/api/health
curl -fsS http://34.14.197.72/api/health
```

## Operational Notes

- The current IP is HTTP only.
- The external IP may be ephemeral unless reserved in GCP.
- The SQLite DB is local to the VM, so VM disk persistence matters.
- Back up `/var/lib/kirana-game/kirana.sqlite` before risky schema or simulation changes.
- Session cookies are `HttpOnly`; browser JavaScript cannot read them directly.
- Player-owned runs are protected by backend ownership checks.

