import { useMemo } from 'react';

interface LineChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}

export default function LineChart({ data, height = 200, color = '#3b82f6' }: LineChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
  const minValue = useMemo(() => Math.min(...data.map(d => d.value), 0), [data]);

  const points = useMemo(() => {
    if (data.length === 0) return '';

    const width = 100;
    const chartHeight = 100;
    const range = maxValue - minValue || 1;

    return data
      .map((item, index) => {
        const x = (index / (data.length - 1 || 1)) * width;
        const y = chartHeight - ((item.value - minValue) / range) * chartHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, maxValue, minValue]);

  const areaPath = useMemo(() => {
    if (data.length === 0) return '';

    const width = 100;
    const chartHeight = 100;
    const range = maxValue - minValue || 1;

    const topPath = data
      .map((item, index) => {
        const x = (index / (data.length - 1 || 1)) * width;
        const y = chartHeight - ((item.value - minValue) / range) * chartHeight;
        return `${x},${y}`;
      })
      .join(' L');

    return `M 0,${chartHeight} L ${topPath} L 100,${chartHeight} Z`;
  }, [data, maxValue, minValue]);

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${height}px` }}
      >
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.05 }} />
          </linearGradient>
        </defs>

        <path
          d={areaPath}
          fill={`url(#gradient-${color})`}
          className="transition-all duration-500"
        />

        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500"
          vectorEffect="non-scaling-stroke"
        />

        {data.map((item, index) => {
          const width = 100;
          const chartHeight = 100;
          const range = maxValue - minValue || 1;
          const x = (index / (data.length - 1 || 1)) * width;
          const y = chartHeight - ((item.value - minValue) / range) * chartHeight;

          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="1.5"
              fill={color}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      <div className="flex justify-between mt-2">
        {data.map((item, index) => (
          <div key={index} className="text-xs text-gray-600 text-center flex-1">
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
