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
        className="w-full drop-shadow-md"
        style={{ height: `${height}px` }}
      >
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.4 }} />
            <stop offset="50%" style={{ stopColor: color, stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.05 }} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <path
          d={areaPath}
          fill={`url(#gradient-${color})`}
          className="transition-all duration-700"
        />

        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-700"
          vectorEffect="non-scaling-stroke"
          filter="url(#glow)"
        />

        {data.map((item, index) => {
          const width = 100;
          const chartHeight = 100;
          const range = maxValue - minValue || 1;
          const x = (index / (data.length - 1 || 1)) * width;
          const y = chartHeight - ((item.value - minValue) / range) * chartHeight;

          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r="3"
                fill="white"
                stroke={color}
                strokeWidth="2.5"
                className="transition-all duration-700 hover:r-4"
              />
              <circle
                cx={x}
                cy={y}
                r="1.5"
                fill={color}
                className="transition-all duration-700"
              />
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between mt-4 px-2">
        {data.map((item, index) => (
          <div key={index} className="flex flex-col items-center flex-1">
            <div className="text-sm text-gray-700 font-semibold text-center">
              {item.label}
            </div>
            <div className="text-xs text-gray-500 font-medium mt-1">
              ₹{item.value.toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
