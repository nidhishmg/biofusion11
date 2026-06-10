import { motion } from "framer-motion";

interface RiskGaugeProps {
  value: number;
  size?: number;
  label?: string;
}

export function RiskGauge({ value, size = 180, label = "Risk Score" }: RiskGaugeProps) {
  const clampedValue = Math.max(0, Math.min(1, value));
  const angle = -135 + clampedValue * 270;

  const color =
    clampedValue > 0.85 ? "#ef4444" :
    clampedValue > 0.65 ? "#f97316" :
    clampedValue > 0.3 ? "#f59e0b" :
    "#10b981";

  const level =
    clampedValue > 0.85 ? "CRITICAL" :
    clampedValue > 0.65 ? "HIGH" :
    clampedValue > 0.3 ? "MODERATE" :
    "LOW";

  const r = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;

  function arcPath(startAngle: number, endAngle: number, color: string) {
    const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return (
      <path
        key={color}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        stroke={color}
        strokeWidth={12}
        fill="none"
        strokeLinecap="round"
        opacity={0.3}
      />
    );
  }

  const needleAngle = -135 + clampedValue * 270;
  const needleRad = ((needleAngle - 90) * Math.PI) / 180;
  const nx = cx + (r - 10) * Math.cos(needleRad);
  const ny = cy + (r - 10) * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
        {arcPath(-135, -27, "#10b981")}
        {arcPath(-27, 27, "#f59e0b")}
        {arcPath(27, 81, "#f97316")}
        {arcPath(81, 135, "#ef4444")}

        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill={color} />

        <text x={cx} y={cy + 28} textAnchor="middle" fill="white" fontSize={size * 0.15} fontWeight="bold">
          {clampedValue.toFixed(2)}
        </text>
        <text x={cx} y={cy + 44} textAnchor="middle" fill="#6b7280" fontSize={size * 0.07}>
          {label}
        </text>
      </svg>

      <motion.div
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="px-4 py-1 rounded-full text-xs font-bold"
        style={{ backgroundColor: color + "33", color, border: `1px solid ${color}55` }}
      >
        {level} RISK
      </motion.div>
    </div>
  );
}
