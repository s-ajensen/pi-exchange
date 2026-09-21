import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Message } from "./protocol.ts";
import { createQueue } from "./queue.ts";
import { createSignal } from "./signal.ts";

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function syncDirectory(path: string) {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function createDirectory(path: string) {
  const firstCreated = await mkdir(path, { recursive: true });
  if (!firstCreated) {
    return;
  }
  let current = path;
  while (current !== dirname(firstCreated)) {
    await syncDirectory(current);
    current = dirname(current);
  }
  await syncDirectory(current);
}

async function writeDurably(path: string, content: string, flag: string) {
  const file = await open(path, flag, 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function readMessages(path: string): Promise<Message[]> {
  const content = await readOptional(path);
  if (content === "") {
    return [];
  }
  return content.trimEnd().split("\n").map(line => JSON.parse(line) as Message);
}

async function readCursor(path: string): Promise<number> {
  const content = await readOptional(path);
  if (content === "") {
    return 0;
  }
  const cursor = Number(content);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new Error("invalid stored cursor");
  }
  return cursor;
}

export function createMailbox(dataDir: string, now: () => Date) {
  const queue = createQueue();
  const signal = createSignal();
  const resolveMailPath = (address: string) => join(dataDir, "mail", `${address}.jsonl`);
  const resolveCursorPath = (address: string) => join(dataDir, "cursor", address);

  function append(from: string, to: string, text: string): Promise<Message> {
    return queue.run(to, async () => {
      const path = resolveMailPath(to);
      await createDirectory(dirname(path));
      const messages = await readMessages(path);
      const message = {
        seq: messages.length + 1,
        from,
        to,
        text,
        at: now().toISOString(),
      };
      await writeDurably(path, `${JSON.stringify(message)}\n`, "a");
      await syncDirectory(dirname(path));
      signal.wake(to);
      return message;
    });
  }

  function acknowledge(address: string, upTo: number): Promise<void> {
    return queue.run(address, async () => {
      const path = resolveCursorPath(address);
      const cursor = await readCursor(path);
      if (upTo < cursor) {
        return;
      }
      await createDirectory(dirname(path));
      const temporary = `${path}:tmp`;
      try {
        await writeDurably(temporary, String(upTo), "w");
        await rename(temporary, path);
        await syncDirectory(dirname(path));
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  async function read(address: string, after: number | undefined, waitSeconds: number): Promise<Message[]> {
    const offset = after ?? await readCursor(resolveCursorPath(address));
    const deadline = performance.now() + waitSeconds * 1000;
    while (true) {
      const remaining = Math.max(0, deadline - performance.now());
      const subscription = signal.wait(address, remaining);
      try {
        const messages = await queue.run(address, () => readMessages(resolveMailPath(address)));
        const unread = messages.filter(message => message.seq > offset);
        if (unread.length > 0 || remaining === 0) {
          return unread;
        }
        await subscription.promise;
      } finally {
        subscription.cancel();
      }
    }
  }

  return { append, read, acknowledge };
}
