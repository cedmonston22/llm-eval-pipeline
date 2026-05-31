import { NextResponse } from "next/server";

import { searchRecords } from "@/lib/queries";

// Always run on the server at request time — never statically cached.
export const dynamic = "force-dynamic";

/** GET /api/search?q=<text>&model=<label> — full-text search over eval records. */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const model = searchParams.get("model")?.trim() || undefined;

  const records = await searchRecords(q, model);
  return NextResponse.json({ records });
}
