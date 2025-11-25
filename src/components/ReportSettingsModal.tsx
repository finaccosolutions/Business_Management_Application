import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { X, Check } from 'lucide-react';
import {
  ReportType,
  reportColumnConfigs,
  defaultColumnConfigs,
  reportTypeLabels,
} from '../lib/reportSettings';

interface ReportSettingsModalProps {
  reportType: ReportType;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (visibleColumns: string[]) => void;
}

export default function ReportSettingsModal({
  reportType,
  isOpen,
  onClose,
  onSave,
}: ReportSettingsModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const columns = reportColumnConfigs[reportType];
  const defaults = defaultColumnConfigs[reportType];

  useEffect(() => {
    if (isOpen && user) {
      fetchSettings();
    }
  }, [isOpen, user, reportType]);

  const fetchSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('report_display_settings')
        .select('visible_columns')
        .eq('user_id', user.id)
        .eq('report_type', reportType)
        .maybeSingle();

      if (error) throw error;

      if (data && data.visible_columns && Array.isArray(data.visible_columns)) {
        setSelectedColumns(data.visible_columns);
      } else {
        setSelectedColumns(defaults);
      }
    } catch (error) {
      console.error('Error fetching report settings:', error);
      setSelectedColumns(defaults);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || selectedColumns.length === 0) {
      toast.error('Please select at least one column');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('report_display_settings')
        .upsert({
          user_id: user.id,
          report_type: reportType,
          visible_columns: selectedColumns,
        });

      if (error) throw error;
      toast.success('Report settings saved successfully');
      onSave?.(selectedColumns);
      onClose();
    } catch (error: any) {
      console.error('Error saving report settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedColumns(defaults);
  };

  const toggleColumn = (columnId: string) => {
    setSelectedColumns((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-cyan-600 sticky top-0">
          <h2 className="text-2xl font-bold text-white">
            Configure {reportTypeLabels[reportType]}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select which columns you want to display in this report. By default, the most
              commonly used columns are enabled.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                  onClick={() => toggleColumn(column.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.id)}
                    onChange={() => toggleColumn(column.id)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 mt-0.5"
                  />
                  <div className="flex-1">
                    <label className="block font-medium text-gray-900 dark:text-white cursor-pointer">
                      {column.label}
                    </label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {column.description}
                    </p>
                  </div>
                  {defaults.includes(column.id) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium whitespace-nowrap">
                      <Check size={14} />
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium disabled:opacity-50"
            >
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || selectedColumns.length === 0}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Save Settings
                </>
              )}
            </button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              <strong>Tip:</strong> Your settings are saved and will be remembered for future
              reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
