import { configure } from "./src/configuration.ts";
import { createExchange } from "./src/exchange.ts";

const configuration = configure(process.env);

Bun.serve({
  port: configuration.port,
  idleTimeout: 60,
  fetch: createExchange({ ...configuration, now: () => new Date() }),
});
