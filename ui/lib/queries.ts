import "server-only";

import type {
  AggregationsAvgAggregate,
  AggregationsStringTermsAggregate,
  AggregationsStringTermsBucket,
  AggregationsSingleBucketAggregateBase,
  SearchHit,
} from "@elastic/elasticsearch/lib/api/types";

import { getElasticsearchClient, INDEX_NAME } from "@/lib/elasticsearch";
import type {
  DashboardData,
  EvalRecord,
  EvalRecordSource,
} from "@/lib/types";

/** How many recent records the dashboard and annotate views pull by default. */
const RECENT_SIZE = 25;
const UNANNOTATED_SIZE = 50;
const SEARCH_SIZE = 50;

/** Map a raw ES hit (source + _id) into our flat EvalRecord. */
function hitToRecord(hit: SearchHit<EvalRecordSource>): EvalRecord {
  const source = hit._source ?? ({} as EvalRecordSource);
  return {
    id: hit._id ?? "",
    prompt: source.prompt ?? null,
    model: source.model ?? null,
    response: source.response ?? null,
    input_tokens: source.input_tokens ?? null,
    output_tokens: source.output_tokens ?? null,
    total_tokens: source.total_tokens ?? null,
    latency_ms: source.latency_ms ?? null,
    timestamp: source.timestamp ?? null,
    error: source.error ?? null,
    annotated: source.annotated ?? null,
  };
}

/** ES `hits.total` may be a number or a {value} object depending on options. */
function totalToNumber(total: unknown): number {
  if (typeof total === "number") return total;
  if (total && typeof total === "object" && "value" in total) {
    return Number((total as { value: number }).value) || 0;
  }
  return 0;
}

/**
 * Fetch dashboard aggregations + the most recent records in a single ES query.
 *
 * Never throws: on any connection/config failure it returns a zeroed payload
 * with an `error` message so the page renders an empty state instead of a 500.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const empty: DashboardData = {
    total: 0,
    perModel: [],
    avgLatencyMs: null,
    avgTotalTokens: null,
    errorRate: 0,
    annotatedRate: 0,
    recent: [],
  };

  try {
    const es = getElasticsearchClient();
    const res = await es.search<EvalRecordSource>({
      index: INDEX_NAME,
      size: RECENT_SIZE,
      track_total_hits: true,
      sort: [{ timestamp: { order: "desc" } }],
      aggs: {
        by_model: { terms: { field: "model", size: 20 } },
        avg_latency: { avg: { field: "latency_ms" } },
        avg_tokens: { avg: { field: "total_tokens" } },
        with_error: { filter: { exists: { field: "error" } } },
        annotated_true: { filter: { term: { annotated: true } } },
      },
    });

    const total = totalToNumber(res.hits.total);
    const aggs = res.aggregations ?? {};

    const byModel = aggs.by_model as AggregationsStringTermsAggregate | undefined;
    const perModel = (
      (byModel?.buckets as AggregationsStringTermsBucket[] | undefined) ?? []
    ).map((b) => ({ model: String(b.key), count: b.doc_count }));

    const avgLatency = aggs.avg_latency as AggregationsAvgAggregate | undefined;
    const avgTokens = aggs.avg_tokens as AggregationsAvgAggregate | undefined;
    const withError = aggs.with_error as
      | AggregationsSingleBucketAggregateBase
      | undefined;
    const annotated = aggs.annotated_true as
      | AggregationsSingleBucketAggregateBase
      | undefined;

    return {
      total,
      perModel,
      avgLatencyMs: avgLatency?.value ?? null,
      avgTotalTokens: avgTokens?.value ?? null,
      errorRate: total > 0 ? (withError?.doc_count ?? 0) / total : 0,
      annotatedRate: total > 0 ? (annotated?.doc_count ?? 0) / total : 0,
      recent: res.hits.hits.map(hitToRecord),
    };
  } catch (err) {
    return { ...empty, error: messageOf(err) };
  }
}

/**
 * Full-text search across eval records. Matches the analyzed `response` text
 * and the `prompt`, optionally filtered to a single model. Returns [] on error.
 */
export async function searchRecords(
  query: string,
  model?: string,
): Promise<EvalRecord[]> {
  const trimmed = query.trim();

  try {
    const es = getElasticsearchClient();
    const must = trimmed
      ? [{ multi_match: { query: trimmed, fields: ["response", "prompt"] } }]
      : [{ match_all: {} }];
    const filter = model ? [{ term: { model } }] : [];

    const res = await es.search<EvalRecordSource>({
      index: INDEX_NAME,
      size: SEARCH_SIZE,
      query: { bool: { must, filter } },
      // With no query text, fall back to most-recent ordering.
      sort: trimmed ? undefined : [{ timestamp: { order: "desc" } }],
    });
    return res.hits.hits.map(hitToRecord);
  } catch {
    return [];
  }
}

/**
 * Records that have not yet been annotated (`annotated` is not `true`), most
 * recent first. Returns [] on error so the annotate page shows an empty state.
 */
export async function getUnannotated(
  limit: number = UNANNOTATED_SIZE,
): Promise<EvalRecord[]> {
  try {
    const es = getElasticsearchClient();
    const res = await es.search<EvalRecordSource>({
      index: INDEX_NAME,
      size: limit,
      sort: [{ timestamp: { order: "desc" } }],
      query: { bool: { must_not: [{ term: { annotated: true } }] } },
    });
    return res.hits.hits.map(hitToRecord);
  } catch {
    return [];
  }
}

/** Distinct model labels present in the index (for the search filter dropdown). */
export async function getModels(): Promise<string[]> {
  try {
    const es = getElasticsearchClient();
    const res = await es.search<EvalRecordSource>({
      index: INDEX_NAME,
      size: 0,
      aggs: { models: { terms: { field: "model", size: 50 } } },
    });
    const agg = res.aggregations?.models as
      | AggregationsStringTermsAggregate
      | undefined;
    return ((agg?.buckets as AggregationsStringTermsBucket[] | undefined) ?? [])
      .map((b) => String(b.key))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
