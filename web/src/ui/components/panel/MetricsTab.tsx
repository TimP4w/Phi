import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { format } from "date-fns";
import { Button, Input } from "@heroui/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import {
  SamplePointDto,
  SpecValueDto,
} from "../../../core/metrics/models/dtos/metricsDto";
import {
  METRICS_RANGE_PRESETS,
  normalizeRange,
} from "../../../core/metrics/constants/metrics.const";
import { formatBytes, formatCores } from "../../shared/format";
import { Skeleton } from "@heroui/react";

type MetricsTabProps = {
  uid: string;
  range: string;
  onRangeChange: (range: string) => void;
};

const PRESETS: readonly string[] = METRICS_RANGE_PRESETS;

// Preset buttons plus a manual entry (e.g. "2h", "45m", "5d") for arbitrary windows.
function RangeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (r: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const isPreset = PRESETS.includes(value);

  const applyCustom = () => {
    const norm = normalizeRange(custom);
    if (norm) {
      onChange(norm);
      setCustom("");
    }
  };

  const rangeButton = (label: string, active: boolean) => (
    <Button
      key={label}
      size="sm"
      variant={active ? "primary" : "secondary"}
      className="h-7 min-w-0 px-2.5 font-mono text-xs"
      onPress={() => onChange(label)}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PRESETS.map((preset) => rangeButton(preset, value === preset))}
      {!isPreset && rangeButton(value, true)}
      <Input
        aria-label="Custom range"
        placeholder="custom"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyCustom();
        }}
        onBlur={applyCustom}
        className="w-20 h-7"
      />
    </div>
  );
}

type ChartDef = {
  title: string;
  seriesKeys: { key: string; label: string; color: string }[];
  formatValue: (v: number) => string;
  spec?: SpecValueDto;
};

type TooltipEntry = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
};

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
      <div className="mb-1 text-muted">
        {format(new Date((label ?? 0) * 1000), "MMM d HH:mm")}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-mono tabular-nums">
            {formatValue(entry.value ?? 0)}
          </span>
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
        <span className="text-xs text-muted font-mono">
          {`requested ${def.spec.requests != null ? def.formatValue(def.spec.requests) : "—"} · limit ${
            def.spec.limits != null ? def.formatValue(def.spec.limits) : "—"
          }`}
        </span>
      )}
    </div>
  );
}

// A client-side x-axis window [start, end] in epoch-seconds, shared by all
// charts. null means "fit to data".
type ZoomDomain = [number, number] | null;

type ChartMouseEvent = { activeLabel?: string | number } | null;

function ChartBody({
  def,
  series,
  zoom,
  onZoom,
}: {
  def: ChartDef;
  series: Record<string, SamplePointDto[]>;
  zoom: ZoomDomain;
  onZoom: (z: ZoomDomain) => void;
}) {
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

  // In-progress drag selection (epoch-seconds); committed to onZoom on mouse up.
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  const labelOf = (e: ChartMouseEvent): number | null => {
    const v = e?.activeLabel;
    return v == null ? null : Number(v);
  };
  const onDown = (e: ChartMouseEvent) => {
    const t = labelOf(e);
    if (t != null) {
      setSelStart(t);
      setSelEnd(t);
    }
  };
  const onMove = (e: ChartMouseEvent) => {
    if (selStart == null) return;
    const t = labelOf(e);
    if (t != null) setSelEnd(t);
  };
  const onUp = () => {
    if (selStart != null && selEnd != null && selStart !== selEnd) {
      onZoom([Math.min(selStart, selEnd), Math.max(selStart, selEnd)]);
    }
    setSelStart(null);
    setSelEnd(null);
  };

  // Tick density follows the *visible* span so a zoom into a few hours of a
  // multi-day window still shows clock labels.
  const visibleSpan = zoom
    ? zoom[1] - zoom[0]
    : data.length > 1
      ? data[data.length - 1].t - data[0].t
      : 0;
  const tickFormat = visibleSpan > 36 * 3600 ? "MMM d" : "HH:mm";

  const specLine = (value: number | null | undefined, label: string) =>
    value != null ? (
      <ReferenceLine
        y={value}
        strokeDasharray="4 4"
        stroke="#888"
        label={{ value: label, fontSize: 10, fill: "#888" }}
      />
    ) : null;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart
        data={data}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        style={{ cursor: "crosshair", userSelect: "none" }}
      >
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis
          dataKey="t"
          type="number"
          domain={zoom ?? ["dataMin", "dataMax"]}
          allowDataOverflow
          tickFormatter={(t: number) => format(new Date(t * 1000), tickFormat)}
          fontSize={10}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v: number) => def.formatValue(v)}
          fontSize={10}
          width={56}
        />
        <Tooltip
          cursor={{ stroke: "#3c3c3c" }}
          content={<ChartTooltip formatValue={def.formatValue} />}
        />
        {def.seriesKeys.map((sk) => (
          <Area
            key={sk.key}
            dataKey={sk.key}
            name={sk.label}
            stroke={sk.color}
            fill={sk.color}
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
        {def.spec && specLine(def.spec.requests, "request")}
        {def.spec && specLine(def.spec.limits, "limit")}
        {selStart != null && selEnd != null && selStart !== selEnd && (
          <ReferenceArea
            x1={Math.min(selStart, selEnd)}
            x2={Math.max(selStart, selEnd)}
            strokeOpacity={0.3}
            fill="#3b82f6"
            fillOpacity={0.1}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

const MetricsTab = observer(
  ({ uid, range, onRangeChange }: MetricsTabProps) => {
    const metricsStore = useInjection(MetricsStore);
    const metrics = metricsStore.resourceMetrics.get(uid);

    // Client-side zoom, shared across all charts. Reset when the fetched window
    // (range) or resource (uid) changes, since the old domain no longer applies.
    const [zoom, setZoom] = useState<ZoomDomain>(null);
    useEffect(() => setZoom(null), [range, uid]);

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted uppercase tracking-widest">
              Range
            </span>
            {zoom ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 min-w-0 px-2.5 text-xs"
                onPress={() => setZoom(null)}
              >
                Reset zoom
              </Button>
            ) : (
              <span className="text-xs text-muted">drag a chart to zoom</span>
            )}
          </div>
          <RangeSelector value={range} onChange={onRangeChange} />
        </div>
        {charts.map((def) => (
          <div key={def.title}>
            <ChartHeader def={def} />
            {metrics ? (
              <div className="select-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
                <ChartBody
                  def={def}
                  series={metrics.series ?? {}}
                  zoom={zoom}
                  onZoom={setZoom}
                />
              </div>
            ) : (
              <Skeleton className="rounded-lg w-full h-[220px] mt-2" />
            )}
          </div>
        ))}
      </div>
    );
  },
);

export default MetricsTab;
