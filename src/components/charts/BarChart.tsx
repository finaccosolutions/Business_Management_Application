import { useMemo } from 'react';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

export default function BarChart({ data, height = 200 }: BarChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div className="flex items-end justify-around h-full gap-2">
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * 100;
          return (
            <div key={index} className="flex flex-col items-center flex-1 h-full justify-end">
              <div className="text-xs font-bold text-gray-700 mb-1">
                {item.value}
              </div>
              <div
                className={`w-full rounded-t-lg transition-all duration-500 hover:opacity-80 ${
                  item.color || 'bg-blue-500'
                }`}
                style={{ height: `${barHeight}%`, minHeight: item.value > 0 ? '4px' : '0px' }}
                title={`${item.label}: ${item.value}`}
              />
              <div className="text-xs text-gray-600 mt-2 text-center font-medium">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
