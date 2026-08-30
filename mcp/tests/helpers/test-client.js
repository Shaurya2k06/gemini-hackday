import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createZoronServer } from "../../src/server.js";

/**
 * Connect a client to an in-process Zoron server over a linked in-memory pair.
 *
 * Preferred over spawning the stdio entrypoint: no child-process lifecycle, and
 * it exercises the same registration code paths. The stdio wiring itself is
 * covered separately by tests/stdio.test.js.
 *
 * @param env   process.env overrides, restored on close (undefined deletes)
 * @param opts  forwarded to createZoronServer, e.g. a pre-seeded `store` or a
 *              stub `pipeline`
 */
export async function connectTestClient(env = {}, opts = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const server = createZoronServer(opts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "zoron-test-client", version: "1.0.0" });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    server,
    store: server.zoronStore,
    async close() {
      await client.close();
      await server.close();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
