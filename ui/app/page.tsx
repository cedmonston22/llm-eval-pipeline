import { getDashboardData } from "@/lib/queries";
import {
  formatMs,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import RecordTable from "@/components/RecordTable";

// Metrics must reflect live data on every request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Aggregate metrics across the <code className="font-mono">eval-jobs</code> index.
        </p>
      </div>

      {data.error ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Could not reach Elasticsearch: {data.error}. Fill in{" "}
          <code className="font-mono">ELASTIC_CLOUD_ID</code> and{" "}
          <code className="font-mono">ELASTIC_API_KEY</code> in{" "}
          <code className="font-mono">ui/.env.local</code>.
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard label="Total evals" value={formatNumber(data.total)} />
        <MetricCard label="Avg latency" value={formatMs(data.avgLatencyMs)} />
        <MetricCard label="Avg total tokens" value={formatNumber(data.avgTotalTokens)} />
        <MetricCard label="Error rate" value={formatPercent(data.errorRate)} />
        <MetricCard label="Annotated" value={formatPercent(data.annotatedRate)} />
        <MetricCard
          label="Models"
          value={data.perModel.length === 0 ? "—" : String(data.perModel.length)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Evals per model
        </h2>
        {data.perModel.length === 0 ? (
          <p className="text-sm text-neutral-500">No data yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.perModel.map((m) => (
              <span
                key={m.model}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span className="font-mono text-xs">{m.model}</span>
                <span className="rounded-full bg-neutral-100 px-2 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {formatNumber(m.count)}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Recent evals
        </h2>
        <RecordTable
          records={data.recent}
          emptyMessage="No eval records yet. Run the publisher to populate the index."
        />
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
