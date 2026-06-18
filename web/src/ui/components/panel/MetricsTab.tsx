import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { SamplePointDto, SpecValueDto } from "../../../core/metrics/models/dtos/metricsDto";
import { formatBytes, formatCores } from "../../shared/format";
import { Skeleton } from "@heroui/react";

type MetricsTabProps = {
  uid: string;
};

type ChartDef = {
  title: string;
  seriesKeys: { key: string; label: string; color: string }[];
  formatValue: (v: number) => string;
  spec?: SpecValueDto;
};

type TooltipEntry = { name?: string; value?: number; color?: string; dataKey?: string | number };

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#3c3c3c] bg-[#0F0F0F] px-2.5 py-1.5 text-xs text-[#e5e5e5]">
      <div className="mb-1 text-default-400">{format(new Date((label ?? 0) * 1000), "MMM d HH:mm")}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-mono tabular-nums">{formatValue(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartHeader({ def }: { def: ChartDef }) {
  return (
    <div className="flex items-baseline gap-3">
      <h3 className="text-sm font-semibold">{def.title}</h3>
      {def.spec && (
        <span className="text-xs text-default-400 font-mono">
          {`requested ${def.spec.requests != null ? def.formatValue(def.spec.requests) : "—"} · limit ${
            def.spec.limits != null ? def.formatValue(def.spec.limits) : "—"
          }`}
        </span>
      )}
    </div>
  );
}

function ChartBody({ def, series }: { def: ChartDef; series: Record<string, SamplePointDto[]> }) {
  // Join series by timestamp, not index — scrape gaps can leave one series
  // shorter than another, and an index join would silently shift values.
  const byTime = new Map<number, Record<string, number>>();
  for (const sk of def.seriesKeys) {
    for (const point of series[sk.key] ?? []) {
      const row = byTime.get(point.t) ?? { t: point.t };
      row[sk.key] = point.v;
      byTime.set(point.t, row);
    }
  }
  const data = [...byTime.values()].sort((a, b) => a.t - b.t);

  const specLine = (value: number | null | undefined, label: string) =>
    value != null ? (
      <ReferenceLine y={value} strokeDasharray="4 4" stroke="#888" label={{ value: label, fontSize: 10, fill: "#888" }} />
    ) : null;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis
          dataKey="t"
          tickFormatter={(t: number) => format(new Date(t * 1000), "HH:mm")}
          fontSize={10}
          minTickGap={40}
        />
        <YAxis tickFormatter={(v: number) => def.formatValue(v)} fontSize={10} width={56} />
        <Tooltip cursor={{ stroke: "#3c3c3c" }} content={<ChartTooltip formatValue={def.formatValue} />} />
        {def.seriesKeys.map((sk) => (
          <Area key={sk.key} dataKey={sk.key} name={sk.label} stroke={sk.color} fill={sk.color} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} />
        ))}
        {def.spec && specLine(def.spec.requests, "request")}
        {def.spec && specLine(def.spec.limits, "limit")}
      </AreaChart>
    </ResponsiveContainer>
  );
}

const MetricsTab = observer(({ uid }: MetricsTabProps) => {
  const metricsStore = useInjection(MetricsStore);
  const metrics = metricsStore.resourceMetrics.get(uid);

  const charts: ChartDef[] = [
    {
      title: "CPU (cores)",
      seriesKeys: [{ key: "cpu", label: "used", color: "#3b82f6" }],
      formatValue: formatCores,
      spec: metrics?.spec.cpu,
    },
    {
      title: "Memory",
      seriesKeys: [{ key: "memory", label: "used", color: "#22c55e" }],
      formatValue: formatBytes,
      spec: metrics?.spec.memory,
    },
    {
      title: "Network (B/s)",
      seriesKeys: [
        { key: "networkRx", label: "rx", color: "#a855f7" },
        { key: "networkTx", label: "tx", color: "#f97316" },
      ],
      formatValue: formatBytes,
    },
    {
      title: "Disk I/O (B/s)",
      seriesKeys: [
        { key: "diskRead", label: "read", color: "#06b6d4" },
        { key: "diskWrite", label: "write", color: "#ef4444" },
      ],
      formatValue: formatBytes,
    },
  ];

  // Title bar and chart area fade in independently once metrics arrive.
  return (
    <div className="flex flex-col gap-6">
      {charts.map((def) => (
        <div key={def.title}>
          <Skeleton isLoaded={!!metrics} className="rounded-md mb-2 w-fit">
            <ChartHeader def={def} />
          </Skeleton>
          <Skeleton isLoaded={!!metrics} className="rounded-lg w-full">
            <ChartBody def={def} series={metrics?.series ?? {}} />
          </Skeleton>
        </div>
      ))}
    </div>
  );
});

export default MetricsTab;
