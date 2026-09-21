import type { JoinRequest, Peer } from "./protocol.ts";

type Presence = JoinRequest & { lastSeen: number };

function checkOnline(presence: Presence | undefined, now: Date, ttlSeconds: number): boolean {
  if (!presence) {
    return false;
  }
  return now.getTime() - presence.lastSeen < ttlSeconds * 1000;
}

function describePeer(presence: Presence, now: Date, ttlSeconds: number): Peer {
  const { address, host, cwd, sessionName, lastSeen } = presence;
  return {
    address,
    host,
    cwd,
    sessionName,
    lastSeen: new Date(lastSeen).toISOString(),
    online: checkOnline(presence, now, ttlSeconds),
  };
}

export function createPresence(ttlSeconds: number, now: () => Date) {
  const peers = new Map<string, Presence>();

  function isOnline(address: string) {
    return checkOnline(peers.get(address), now(), ttlSeconds);
  }

  function join(peer: JoinRequest): boolean {
    const existing = peers.get(peer.address);
    if (existing && isOnline(peer.address) && existing.session !== peer.session) {
      return false;
    }
    peers.set(peer.address, { ...peer, lastSeen: now().getTime() });
    return true;
  }
  function heartbeat(address: string): boolean {
    const peer = peers.get(address);
    if (!peer) {
      return false;
    }
    peer.lastSeen = now().getTime();
    return true;
  }

  function leave(address: string) {
    peers.delete(address);
  }

  function list(): Peer[] {
    return [...peers.values()].map(peer => describePeer(peer, now(), ttlSeconds));
  }

  return { join, heartbeat, leave, list, isOnline };
}
