---
name: exchange
description: Apply when an exchange message arrives from another pi session, or when this session should talk to pi sessions on other machines through the exchange tool.
---

Use `exchange` with `action: "join"` to open this session under an address.
Supply `name` to choose the part before the host name.
Use `action: "leave"` to close the connection.
Use `action: "peers"` to list other sessions and their online status.
Use `action: "send"` with `to` as an array of addresses and `text` as the message.

Incoming messages arrive as a steer while you work.
Decide whether to finish the current step first or answer now.
Reply only when the message asks a question or requests something.
Do not acknowledge for its own sake. Every reply costs the other session a turn.
Address a peer by the exact address in its message header or the peers list.
A message to an offline address waits on the server until that address joins again.
