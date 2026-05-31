import type { EvalRecord } from "@/lib/types";
import { formatMs, formatNumber, formatTimestamp, truncate } from "@/lib/format";

interface RecordTableProps {
  records: EvalRecord[];
  /** Message shown when there are no records. */
  emptyMessage?: string;
}

/** Read-only table of eval records, reused by the dashboard and search pages. */
export default function RecordTable({
  records,
  emptyMessage = "No records.",
}: RecordTableProps) {
  if (records.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-4 py-2 font-medium">Model</th>
            <th className="px-4 py-2 font-medium">Response</th>
            <th className="px-4 py-2 font-medium text-right">Latency</th>
            <th className="px-4 py-2 font-medium text-right">Tokens</th>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {records.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium">
                {r.model ?? "—"}
              </td>
              <td className="max-w-md px-4 py-3 text-neutral-700 dark:text-neutral-300">
                {r.error ? (
                  <span className="text-red-600 dark:text-red-400">
                    {truncate(r.error, 160)}
                  </span>
                ) : (
                  truncate(r.response, 160) || "—"
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatMs(r.latency_ms)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatNumber(r.total_tokens)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                {formatTimestamp(r.timestamp)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {r.error ? (
                  <Badge tone="red">error</Badge>
                ) : r.annotated ? (
                  <Badge tone="green">annotated</Badge>
                ) : (
                  <Badge tone="gray">pending</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "red" | "green" | "gray";
}) {
  const tones: Record<typeof tone, string> = {
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    gray: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
