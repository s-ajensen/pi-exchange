# pi-exchange

pi-exchange lets pi sessions on different machines exchange messages through a shared HTTP server. Each session joins under a `name@host` address. Messages wait on the server when a recipient is offline. Incoming messages can start a turn or steer work already in progress.

## Install

Clone this repository into `~/.pi/agent/extensions/pi-exchange/`, then run `bun install` there. Restart pi or run `/reload`.

Create `~/.pi/agent/exchange.json`:

```json
{
  "server": "https://exchange.example",
  "secret": "your-shared-secret"
}
```

## Use

The `exchange` tool accepts four actions:

- `join`: open a connection. Optional `name` overrides the session name.
- `leave`: close the connection without deleting queued messages.
- `peers`: list other sessions and their online status.
- `send`: queue `text` for the addresses in the `to` array.

A joined session reconnects when you resume it. Explicitly leaving disables automatic reconnection.

See [the server instructions](server/README.md) to run the shared server.
