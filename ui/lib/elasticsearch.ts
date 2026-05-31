import "server-only";

import { Client } from "@elastic/elasticsearch";

/** The index the consumer Lambda writes every eval record into. */
export const INDEX_NAME = "eval-jobs";

/**
 * Lazily-built singleton Elasticsearch client.
 *
 * Auth mirrors `consumer/lambda_function.py`: Elastic Cloud ID + API key. The
 * client is built on first use (not at module load) and cached on `globalThis`
 * so Next.js's dev hot-reload doesn't leak a new client per recompile. Throws a
 * clear error if the credentials are missing so callers can surface an empty
 * state instead of a cryptic connection failure.
 */
let cached: Client | undefined =
  (globalThis as { __esClient?: Client }).__esClient;

export function getElasticsearchClient(): Client {
  if (cached) return cached;

  const cloudId = process.env.ELASTIC_CLOUD_ID;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!cloudId || !apiKey) {
    throw new Error(
      "Elasticsearch is not configured: set ELASTIC_CLOUD_ID and ELASTIC_API_KEY in ui/.env.local",
    );
  }

  cached = new Client({
    cloud: { id: cloudId },
    auth: { apiKey },
  });
  (globalThis as { __esClient?: Client }).__esClient = cached;
  return cached;
}
