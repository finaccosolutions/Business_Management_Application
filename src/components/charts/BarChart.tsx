import { useMemo } from 'react';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

export default function BarChart({ data, height = 200 }: BarChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div className="flex items-end justify-around h-full gap-4 px-2">
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * 100;
          return (
            <div key={index} className="flex flex-col items-center flex-1 h-full justify-end group">
              <div className="text-sm font-bold text-gray-800 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.value}
              </div>
              <div className="relative w-full flex flex-col items-center">
                <div
                  className={`w-full rounded-t-xl transition-all duration-700 hover:scale-105 shadow-lg hover:shadow-xl ${
                    item.color || 'bg-gradient-to-t from-blue-500 to-blue-400'
                  }`}
                  style={{
                    height: `${barHeight}%`,
                    minHeight: item.value > 0 ? '8px' : '0px',
                  }}
                  title={`${item.label}: ${item.value}`}
                >
                  <div className="absolute inset-0 bg-white opacity-0 hover:opacity-20 rounded-t-xl transition-opacity duration-200"></div>
                </div>
                <div className="absolute -bottom-8 text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded shadow-sm">
                  {item.value}
                </div>
              </div>
              <div className="text-sm text-gray-700 mt-10 text-center font-semibold">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
