"use client";

import { useState } from "react";

import type { EvalRecord } from "@/lib/types";
import RecordTable from "@/components/RecordTable";

interface SearchClientProps {
  models: string[];
}

interface SearchResponse {
  records: EvalRecord[];
}

/** Search form + results, talking to the /api/search route handler. */
export default function SearchClient({ models }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [records, setRecords] = useState<EvalRecord[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (model) params.set("model", model);

      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error(`search failed (${res.status})`);

      const data: SearchResponse = await res.json();
      setRecords(data.records);
      setStatus("done");
    } catch {
      setRecords([]);
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search response or prompt text…"
          className="min-w-64 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {status === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      {status === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Search failed. Check that Elasticsearch credentials are set in{" "}
          <code className="font-mono">ui/.env.local</code>.
        </p>
      ) : null}

      {status === "done" ? (
        <p className="text-xs text-neutral-500">
          {records.length} result{records.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {status === "done" || status === "error" ? (
        <RecordTable records={records} emptyMessage="No matching records." />
      ) : null}
    </div>
  );
}
