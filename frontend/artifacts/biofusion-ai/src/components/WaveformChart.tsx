import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface WaveformChartProps {
  signal: number[];
  color?: string;
  label?: string;
  peaks?: number[];
  maxPoints?: number;
  height?: number;
  yDomain?: [number, number];
  showGrid?: boolean;
}

export function WaveformChart({
  signal,
  color = "#14b8a6",
  label,
  peaks = [],
  maxPoints = 500,
  height = 200,
  yDomain,
  showGrid = true,
}: WaveformChartProps) {
  const data = useMemo(() => {
    const step = Math.max(1, Math.floor(signal.length / maxPoints));
    const result: { t: number; v: number }[] = [];
    for (let i = 0; i < signal.length; i += step) {
      result.push({ t: parseFloat((i / 360).toFixed(3)), v: parseFloat(signal[i]?.toFixed(4) ?? "0") });
    }
    return result;
  }, [signal, maxPoints]);

  const peakTimes = useMemo(() => peaks.map((p) => parseFloat((p / 360).toFixed(3))), [peaks]);

  const domain: [number, number] = yDomain || [
    Math.min(...signal.slice(0, 2000)) * 1.2,
    Math.max(...signal.slice(0, 2000)) * 1.2,
  ];

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          )}
          <XAxis
            dataKey="t"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickFormatter={(v) => `${v}s`}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 6 }}
            labelStyle={{ color: "#9ca3af", fontSize: 11 }}
            itemStyle={{ color, fontSize: 11 }}
            formatter={(v: number) => [v.toFixed(4), label || "Value"]}
            labelFormatter={(l) => `t=${l}s`}
          />
          {peakTimes.slice(0, 20).map((t) => (
            <ReferenceLine key={t} x={t} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 2" />
          ))}
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
