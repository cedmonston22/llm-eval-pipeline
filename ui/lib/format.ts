/** Small display helpers shared across UI components (safe on client + server). */

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString();
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ms`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Truncate long text for table cells, appending an ellipsis when cut. */
export function truncate(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
