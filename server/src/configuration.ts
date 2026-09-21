type Environment = Record<string, string | undefined>;
type Configuration = { secret: string; port: number; dataDir: string; ttlSeconds: number };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readSecret(value: string | undefined): string {
  if (!value) {
    return fail("EXCHANGE_SECRET is required");
  }
  return value;
}

function readPort(value = "8787"): number {
  const port = Number(value);
  if (value.trim() === "" || !Number.isInteger(port) || port < 0 || port > 65535) {
    return fail("PORT must be an integer from 0 to 65535");
  }
  return port;
}

function readTtl(value = "30"): number {
  const ttl = Number(value);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return fail("EXCHANGE_TTL_SECONDS must be positive and finite");
  }
  return ttl;
}

export function configure(environment: Environment): Configuration {
  return {
    secret: readSecret(environment.EXCHANGE_SECRET),
    port: readPort(environment.PORT),
    dataDir: environment.EXCHANGE_DATA ?? "/data",
    ttlSeconds: readTtl(environment.EXCHANGE_TTL_SECONDS),
  };
}
