import { NextResponse } from "next/server";

import { getElasticsearchClient, INDEX_NAME } from "@/lib/elasticsearch";
import { annotationKey, getRedisClient } from "@/lib/redis";
import type { Annotation, AnnotationRating } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AnnotateBody {
  id: string;
  rating: AnnotationRating;
  notes: string;
  by: string;
}

/** Narrow an untrusted JSON body into a validated AnnotateBody, or null. */
function parseBody(raw: unknown): AnnotateBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (typeof o.id !== "string" || o.id.length === 0) return null;
  if (o.rating !== "good" && o.rating !== "bad") return null;

  return {
    id: o.id,
    rating: o.rating,
    notes: typeof o.notes === "string" ? o.notes : "",
    by: typeof o.by === "string" && o.by.trim() ? o.by.trim() : "anonymous",
  };
}

/**
 * POST /api/annotate — persist a human annotation.
 *
 * Writes the full annotation payload to Upstash Redis under `annotation:{id}`
 * AND flips the record's `annotated` flag to true in Elasticsearch so it drops
 * out of the /annotate queue and counts toward the dashboard's annotated rate.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: "body must be { id: string, rating: 'good' | 'bad', notes?: string }" },
      { status: 400 },
    );
  }

  const annotation: Annotation = {
    rating: body.rating,
    notes: body.notes,
    by: body.by,
    at: new Date().toISOString(),
  };

  try {
    const redis = getRedisClient();
    await redis.set(annotationKey(body.id), annotation);

    const es = getElasticsearchClient();
    await es.update({
      index: INDEX_NAME,
      id: body.id,
      doc: { annotated: true },
    });

    return NextResponse.json({ ok: true, annotation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
