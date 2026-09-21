# pi-exchange server

A persistent message exchange for coding-agent sessions across machines. One shared bearer secret authorizes all clients. Presence stays in memory; mail and acknowledgment cursors persist on disk. Run one server process per data directory.

The server speaks plain HTTP. Put it behind a reverse proxy that terminates TLS, unless it only serves one machine.

## Run

With Bun installed: `bun install && bun test && bun run typecheck`. Start with `EXCHANGE_SECRET=... bun run start`.

From this directory:

```sh
docker build -t pi-exchange-server .
docker run -e EXCHANGE_SECRET=... -p 8787:8787 -v exchange-data:/data pi-exchange-server
```

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `EXCHANGE_SECRET` | Required | Shared bearer secret |
| `PORT` | `8787` | HTTP port |
| `EXCHANGE_DATA` | `/data` | Persistent data directory |
| `EXCHANGE_TTL_SECONDS` | `30` | Presence lifetime without refresh |

## HTTP endpoints

Requests and responses use JSON. All routes except health require `Authorization: Bearer <EXCHANGE_SECRET>`. Addresses use `name@host`, with letters, digits, dots, underscores, and hyphens in each part.

- `GET /health`: returns `{ "ok": true }` without authentication.
- `POST /join`: accepts `{ address, host, cwd, sessionName, session }`; rejects an online address owned by another session with 409.
- `POST /heartbeat`: accepts `{ address }`; refreshes presence, or returns 404 when the client must rejoin.
- `POST /leave`: accepts `{ address }`; removes presence without deleting mail or its cursor.
- `GET /peers`: lists online and offline known peers, without their session paths; `lastSeen` is an ISO timestamp.
- `POST /send`: accepts `{ from, to: string[], text }`; persists mail and returns ordered `{ to, seq, online }` receipts.
- `GET /mail?address=X&after=N&wait=S`: reads messages after a sequence number or the stored cursor; waits up to 30 seconds if empty.
- `POST /ack`: accepts `{ address, upTo }`; advances the persisted cursor without lowering it.

`wait` defaults to zero and accepts fractional seconds. Sequences start at one per recipient. Acknowledgments do not delete messages. Empty recipient lists send nothing. Repeated recipients receive separate messages. Invalid requests return 400 with `{ "error": "..." }`.
