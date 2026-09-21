export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new RequestError(`${field} must be a string`);
  }
  return value;
}

export function readAddress(value: unknown): string {
  const address = readString(value, "address");
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.exec(address)?.[0] !== address) {
    throw new RequestError("invalid address");
  }
  return address;
}

export function readInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RequestError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

export function readOffset(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (value.trim() === "") {
    throw new RequestError("invalid after");
  }
  return readInteger(Number(value), "after");
}

export function readWait(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const seconds = Number(value);
  if (value.trim() === "" || !Number.isFinite(seconds) || seconds < 0) {
    throw new RequestError("invalid wait");
  }
  return Math.min(seconds, 30);
}

export function readRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new RequestError("to must be an array");
  }
  return value.map(readAddress);
}

export function readText(value: unknown): string {
  const text = readString(value, "text");
  if (text.length === 0) {
    throw new RequestError("text must not be empty");
  }
  return text;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestError("malformed JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError("body must be an object");
  }
  return body as Record<string, unknown>;
}
