type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
};

/** Minimal SVG polyline — used inside React Flow nodes, so no chart lib. */
function Sparkline({ values, width = 56, height = 16, className = "stroke-primary" }: SparklineProps) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1e-9);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline points={points} fill="none" strokeWidth="1.5" className={className} />
    </svg>
  );
}

export default Sparkline;
