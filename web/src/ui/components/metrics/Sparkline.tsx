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
  // viewBox + width:100% lets the sparkline scale to its container (the sidebar
  // widget is narrower than the intrinsic width), so it never forces horizontal
  // overflow. non-scaling-stroke keeps the line crisp despite the scaling.
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      height={height}
      preserveAspectRatio="none"
      className="block w-full"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={className}
      />
    </svg>
  );
}

export default Sparkline;
