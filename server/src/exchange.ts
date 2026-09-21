import { authorize } from "./auth.ts";
import { RequestError, readAddress, readBody, readInteger, readOffset, readRecipients, readString, readText, readWait } from "./input.ts";
import { createMailbox } from "./mailbox.ts";
import { createPresence } from "./presence.ts";

type ExchangeOptions = {
  dataDir: string;
  secret: string;
  ttlSeconds: number;
  now: () => Date;
};
type Presence = ReturnType<typeof createPresence>;
type Mailbox = ReturnType<typeof createMailbox>;
type Endpoint = (request: Request) => Response | Promise<Response>;

function reportHealth(): Response {
  return Response.json({ ok: true });
}

function listPeers(presence: Presence): Response {
  return Response.json(presence.list());
}

async function joinPeer(request: Request, presence: Presence): Promise<Response> {
  const body = await readBody(request);
  const peer = {
    address: readAddress(body.address),
    host: readString(body.host, "host"),
    cwd: readString(body.cwd, "cwd"),
    sessionName: readString(body.sessionName, "sessionName"),
    session: readString(body.session, "session"),
  };
  if (!presence.join(peer)) {
    throw new RequestError("address already online", 409);
  }
  return Response.json({ address: peer.address });
}

async function refreshPeer(request: Request, presence: Presence): Promise<Response> {
  const address = readAddress((await readBody(request)).address);
  if (!presence.heartbeat(address)) {
    throw new RequestError("unknown address", 404);
  }
  return Response.json({ ok: true });
}

async function leavePeer(request: Request, presence: Presence): Promise<Response> {
  presence.leave(readAddress((await readBody(request)).address));
  return Response.json({ ok: true });
}

async function readMail(request: Request, mailbox: Mailbox): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const address = readAddress(searchParams.get("address"));
  const after = readOffset(searchParams.get("after"));
  const wait = readWait(searchParams.get("wait"));
  return Response.json(await mailbox.read(address, after, wait));
}

async function acknowledgeMail(request: Request, mailbox: Mailbox): Promise<Response> {
  const body = await readBody(request);
  const address = readAddress(body.address);
  const upTo = readInteger(body.upTo, "upTo");
  await mailbox.acknowledge(address, upTo);
  return Response.json({ ok: true });
}

async function sendMail(request: Request, mailbox: Mailbox, presence: Presence): Promise<Response> {
  const body = await readBody(request);
  const from = readAddress(body.from);
  const recipients = readRecipients(body.to);
  const text = readText(body.text);
  const receipts = [];
  for (const to of recipients) {
    const message = await mailbox.append(from, to, text);
    receipts.push({ to, seq: message.seq, online: presence.isOnline(to) });
  }
  return Response.json(receipts);
}

async function route(request: Request, secret: string, endpoints: Map<string, Endpoint>): Promise<Response> {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  if (key !== "GET /health" && !authorize(request, secret)) {
    throw new RequestError("unauthorized", 401);
  }
  const endpoint = endpoints.get(key);
  if (!endpoint) {
    throw new RequestError("not found", 404);
  }
  return endpoint(request);
}

export function createExchange({ dataDir, secret, ttlSeconds, now }: ExchangeOptions) {
  const presence = createPresence(ttlSeconds, now);
  const mailbox = createMailbox(dataDir, now);
  const endpoints = new Map<string, Endpoint>([
    ["GET /health", reportHealth],
    ["GET /peers", () => listPeers(presence)],
    ["GET /mail", request => readMail(request, mailbox)],
    ["POST /join", request => joinPeer(request, presence)],
    ["POST /heartbeat", request => refreshPeer(request, presence)],
    ["POST /leave", request => leavePeer(request, presence)],
    ["POST /send", request => sendMail(request, mailbox, presence)],
    ["POST /ack", request => acknowledgeMail(request, mailbox)],
  ]);

  return async function handle(request: Request): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, secret, endpoints);
    } catch (error) {
      if (error instanceof RequestError) {
        response = Response.json({ error: error.message }, { status: error.status });
      } else {
        console.error(error);
        response = Response.json({ error: "internal server error" }, { status: 500 });
      }
    }
    console.log(`${request.method} ${new URL(request.url).pathname} ${response.status}`);
    return response;
  };
}
