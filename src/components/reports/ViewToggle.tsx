import { LayoutList, Split, AlignJustify } from 'lucide-react';

export type ViewType = 'horizontal' | 'vertical' | 't-form';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  availableViews?: ViewType[];
}

export default function ViewToggle({
  currentView,
  onViewChange,
  availableViews = ['horizontal', 'vertical', 't-form'],
}: ViewToggleProps) {
  const views = [
    { type: 'horizontal' as ViewType, label: 'Horizontal', icon: AlignJustify },
    { type: 'vertical' as ViewType, label: 'Vertical', icon: LayoutList },
    { type: 't-form' as ViewType, label: 'T-Form', icon: Split },
  ].filter((v) => availableViews.includes(v.type));

  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
      {views.map((view) => {
        const Icon = view.icon;
        return (
          <button
            key={view.type}
            onClick={() => onViewChange(view.type)}
            className={`
              px-4 py-2 text-sm font-medium transition-all
              ${currentView === view.type
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }
              ${views[0].type === view.type ? 'rounded-l-lg' : ''}
              ${views[views.length - 1].type === view.type ? 'rounded-r-lg' : ''}
              border-r border-gray-300 last:border-r-0
              flex items-center gap-2
            `}
          >
            <Icon className="w-4 h-4" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
