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
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90 drop-shadow-lg">
          <defs>
            {segments.map((segment, index) => (
              <filter key={`shadow-${index}`} id={`shadow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.3" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>
          <circle
            cx={center}
            cy={center}
            r={radius - strokeWidth / 2}
            fill="none"
            stroke="#f3f4f6"
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
                className="transition-all duration-700 hover:opacity-80 cursor-pointer"
                style={{ transformOrigin: 'center', filter: `url(#shadow-${index})` }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center bg-white rounded-full w-20 h-20 flex flex-col items-center justify-center shadow-lg">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-xs text-gray-500 font-medium">Total</div>
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3 w-full">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer border border-gray-200">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full shadow-md"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-gray-800 font-semibold">{segment.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-900 text-lg">{segment.value}</span>
              <span className="text-gray-600 text-xs bg-white px-2 py-1 rounded-full font-medium">
                {segment.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
