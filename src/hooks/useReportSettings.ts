import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ReportType, defaultColumnConfigs } from '../lib/reportSettings';

export function useReportSettings(reportType: ReportType) {
  const { user } = useAuth();
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultColumnConfigs[reportType]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchSettings();
  }, [user, reportType]);

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

      if (data?.visible_columns && Array.isArray(data.visible_columns)) {
        setVisibleColumns(data.visible_columns);
      } else {
        setVisibleColumns(defaultColumnConfigs[reportType]);
      }
    } catch (error) {
      console.error('Error fetching report settings:', error);
      setVisibleColumns(defaultColumnConfigs[reportType]);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = (columns: string[]) => {
    setVisibleColumns(columns);
  };

  return {
    visibleColumns,
    loading,
    fetchSettings,
    updateSettings,
  };
}
