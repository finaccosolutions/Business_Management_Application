import { useMemo } from 'react';

interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export default function PieChart({ data, size = 200 }: PieChartProps) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

  const segments = useMemo(() => {
    let cumulativePercentage = 0;
    return data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      const startAngle = (cumulativePercentage * 360) / 100;
      const endAngle = ((cumulativePercentage + percentage) * 360) / 100;
      cumulativePercentage += percentage;

      return {
        ...item,
        percentage,
        startAngle,
        endAngle,
      };
    });
  }, [data, total]);

  const radius = size / 2;
  const center = size / 2;
  const strokeWidth = size * 0.35;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius - strokeWidth / 2}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {segments.map((segment, index) => {
          const circumference = 2 * Math.PI * (radius - strokeWidth / 2);
          const offset = ((100 - segment.percentage) / 100) * circumference;
          const dashArray = `${(segment.percentage / 100) * circumference} ${circumference}`;
          const rotation = (segment.startAngle * circumference) / 360;

          return (
            <circle
              key={index}
              cx={center}
              cy={center}
              r={radius - strokeWidth / 2}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={-rotation}
              className="transition-all duration-500"
              style={{ transformOrigin: 'center' }}
            />
          );
        })}
      </svg>
      <div className="mt-4 space-y-2 w-full">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-gray-700 font-medium">{segment.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{segment.value}</span>
              <span className="text-gray-500">({segment.percentage.toFixed(1)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
