"use client";

import { useState } from "react";

import type { AnnotationRating, EvalRecord } from "@/lib/types";
import { formatMs, formatNumber, formatTimestamp } from "@/lib/format";

interface AnnotationListProps {
  initialRecords: EvalRecord[];
}

/** The annotation queue: a card per unannotated record, removed once saved. */
export default function AnnotationList({ initialRecords }: AnnotationListProps) {
  const [records, setRecords] = useState<EvalRecord[]>(initialRecords);

  function handleSaved(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  if (records.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Nothing to annotate. New records will appear here as the pipeline runs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {records.map((record) => (
        <AnnotationCard key={record.id} record={record} onSaved={handleSaved} />
      ))}
    </div>
  );
}

function AnnotationCard({
  record,
  onSaved,
}: {
  record: EvalRecord;
  onSaved: (id: string) => void;
}) {
  const [rating, setRating] = useState<AnnotationRating | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function save() {
    if (!rating) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, rating, notes }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      onSaved(record.id);
    } catch {
      setStatus("error");
    }
  }

  return (
    <article className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
          {record.model ?? "—"}
        </span>
        <span>{formatMs(record.latency_ms)}</span>
        <span>{formatNumber(record.total_tokens)} tokens</span>
        <span>{formatTimestamp(record.timestamp)}</span>
      </header>

      {record.prompt ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Prompt
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {record.prompt}
          </p>
        </div>
      ) : null}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Response
        </div>
        {record.error ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
            {record.error}
          </p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
            {record.response ?? "—"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <RatingButton
          active={rating === "good"}
          tone="good"
          onClick={() => setRating("good")}
        >
          👍 Good
        </RatingButton>
        <RatingButton
          active={rating === "bad"}
          tone="bad"
          onClick={() => setRating("bad")}
        >
          👎 Bad
        </RatingButton>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-w-48 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="button"
          onClick={save}
          disabled={!rating || status === "saving"}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>

      {status === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not save. Check that Redis and Elasticsearch credentials are set
          in <code className="font-mono">ui/.env.local</code>.
        </p>
      ) : null}
    </article>
  );
}

function RatingButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "good" | "bad";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "good"
      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
      : "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
  const idleClass =
    "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? activeClass : idleClass
      }`}
    >
      {children}
    </button>
  );
}
