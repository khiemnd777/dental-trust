const MAX_SERIES = 5_000;

type Labels = Readonly<Record<string, string | number | boolean>>;

interface CounterSeries {
  readonly name: string;
  readonly labels: Labels;
  value: number;
}

interface SummarySeries {
  readonly name: string;
  readonly labels: Labels;
  count: number;
  sum: number;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, CounterSeries>();
  private readonly summaries = new Map<string, SummarySeries>();

  increment(name: string, labels: Labels = {}, value = 1): void {
    if (!Number.isFinite(value) || value < 0) return;
    const metric = metricName(name);
    const key = seriesKey(metric, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
      return;
    }
    if (this.seriesCount() >= MAX_SERIES) return;
    this.counters.set(key, { name: metric, labels: normalizedLabels(labels), value });
  }

  observe(name: string, value: number, labels: Labels = {}): void {
    if (!Number.isFinite(value) || value < 0) return;
    const metric = metricName(name);
    const key = seriesKey(metric, labels);
    const existing = this.summaries.get(key);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
      return;
    }
    if (this.seriesCount() >= MAX_SERIES) return;
    this.summaries.set(key, {
      name: metric,
      labels: normalizedLabels(labels),
      count: 1,
      sum: value,
    });
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const series of [...this.counters.values()].sort(compareSeries)) {
      lines.push(`${series.name}${formatLabels(series.labels)} ${series.value}`);
    }
    for (const series of [...this.summaries.values()].sort(compareSeries)) {
      lines.push(`${series.name}_count${formatLabels(series.labels)} ${series.count}`);
      lines.push(`${series.name}_sum${formatLabels(series.labels)} ${series.sum}`);
    }
    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.summaries.clear();
  }

  private seriesCount(): number {
    return this.counters.size + this.summaries.size;
  }
}

export const applicationMetrics = new MetricsRegistry();

function metricName(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_:]/gu, '_');
  return /^[a-zA-Z_:]/u.test(normalized) ? normalized : `metric_${normalized}`;
}

function normalizedLabels(labels: Labels): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key.replace(/[^a-zA-Z0-9_]/gu, '_'), String(value)]),
  );
}

function seriesKey(name: string, labels: Labels): string {
  return `${name}:${JSON.stringify(normalizedLabels(labels))}`;
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries
    .map(
      ([key, value]) =>
        `${key}="${String(value).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, '\\n')}"`,
    )
    .join(',')}}`;
}

function compareSeries(
  left: CounterSeries | SummarySeries,
  right: CounterSeries | SummarySeries,
): number {
  return `${left.name}${formatLabels(left.labels)}`.localeCompare(
    `${right.name}${formatLabels(right.labels)}`,
  );
}
