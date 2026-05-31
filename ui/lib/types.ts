/**
 * Shared types for the eval pipeline UI.
 *
 * The eval-record shape is the contract produced by `publisher/main.py` and
 * indexed into the `eval-jobs` Elasticsearch index by `consumer/lambda_function.py`.
 * Keep these fields in sync with that pipeline.
 */

/** A single model-result document as stored in the `eval-jobs` ES index. */
export interface EvalRecord {
  /** Elasticsearch `_id` for the document (used to key annotations). */
  id: string;
  prompt: string | null;
  model: string | null;
  response: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  /** ISO-8601 timestamp string. */
  timestamp: string | null;
  error: string | null;
  /** Null/false until a human marks it via the /annotate page. */
  annotated: boolean | null;
}

/** The raw `_source` shape of an ES document, before we attach the `_id`. */
export type EvalRecordSource = Omit<EvalRecord, "id">;

/** A human verdict on a single eval record. */
export type AnnotationRating = "good" | "bad";

/** The annotation payload stored in Redis under `annotation:{id}`. */
export interface Annotation {
  rating: AnnotationRating;
  notes: string;
  /** Who annotated it (free-form; defaults to "anonymous"). */
  by: string;
  /** ISO-8601 timestamp of when the annotation was saved. */
  at: string;
}

/** Aggregated metrics shown on the dashboard. */
export interface DashboardData {
  total: number;
  perModel: { model: string; count: number }[];
  avgLatencyMs: number | null;
  avgTotalTokens: number | null;
  /** Fraction (0..1) of records that carry an `error`. */
  errorRate: number;
  /** Fraction (0..1) of records with `annotated: true`. */
  annotatedRate: number;
  recent: EvalRecord[];
  /** Set when the underlying data store could not be reached. */
  error?: string;
}
