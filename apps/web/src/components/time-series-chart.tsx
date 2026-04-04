import { colors } from "../lib/ui";

type Point = {
  timestamp: string;
  value: number;
};

type Props = {
  points: Point[];
  height?: number;
  unit?: string;
};

export default function TimeSeriesChart({ points, height = 160, unit = "" }: Props) {
  if (points.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 16,
          color: colors.textMuted,
          fontSize: 13
        }}
      >
        No trend data yet.
      </div>
    );
  }

  const width = 600;
  const padX = 24;
  const padY = 20;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min <= 0 ? 1 : max - min;

  const path = points
    .map((point, index) => {
      const x = padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
      const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const latest = points[points.length - 1];

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        background: colors.surface,
        padding: 12
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Trend">
        <rect x={0} y={0} width={width} height={height} fill={colors.surface} />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={colors.border} />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke={colors.border} />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2.5} />
      </svg>
      <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>
        Latest: {formatValue(latest.value, unit)}
      </div>
    </div>
  );
}

function formatValue(value: number, unit: string) {
  const rounded = Math.round(value * 100) / 100;
  if (!unit) return String(rounded);
  return `${rounded}${unit}`;
}
