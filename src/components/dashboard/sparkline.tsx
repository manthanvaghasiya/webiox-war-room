"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

// TODO(step-9): replace `data` with real time-series from the table this card represents.
export function Sparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const points = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
