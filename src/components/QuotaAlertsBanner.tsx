import React from 'react';
import { AlertTriangle, Bell, X } from 'lucide-react';
import type { QuotaAlert } from '../utils/quotaAlerts';

interface QuotaAlertsBannerProps {
  alerts: QuotaAlert[];
  dismissed: boolean;
  onDismiss: () => void;
  onShow: () => void;
}

export const QuotaAlertsBanner: React.FC<QuotaAlertsBannerProps> = React.memo(({
  alerts,
  dismissed,
  onDismiss,
  onShow,
}) => {
  if (alerts.length === 0) return null;

  if (dismissed) {
    return (
      <div className="flex items-center justify-between gap-4 border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/40 rounded-lg px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-red-900 dark:text-red-200 font-medium">
          <Bell className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
          <span>
            يوجد{' '}
            <span className="font-mono tabular-nums font-semibold">
              {alerts.length}
            </span>{' '}
            تنبيهات استهلاك حرجة (&ge; 90% من الباقة الشهرية أو اليومية)
          </span>
        </div>
        <button
          type="button"
          onClick={onShow}
          className="px-3 py-1 text-xs font-medium text-red-800 dark:text-red-200 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950/60 transition-colors whitespace-nowrap shrink-0"
        >
          عرض التنبيهات
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/35 rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-red-900 dark:text-red-200">
          <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
          <h2 className="text-sm font-semibold">
            تنبيهات اقتراب نفاد الباقة (&ge; 90%)
          </h2>
          <span className="text-xs text-red-700 dark:text-red-300 font-mono tabular-nums">
            ({alerts.length})
          </span>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="إخفاء الإشعارات مؤقتاً"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span>إخفاء</span>
        </button>
      </div>

      <div className="divide-y divide-red-200/70 dark:divide-red-900/50 border-t border-red-200/70 dark:border-red-900/50">
        {alerts.map((alert) => (
          <div
            key={alert.userId}
            className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2 text-red-950 dark:text-red-100">
              <span className="font-semibold">{alert.userName}</span>
              <span aria-hidden="true" className="text-red-400 dark:text-red-500">·</span>
              <span className="text-red-900 dark:text-red-200">{alert.message}</span>
            </div>

            <div className="flex items-center gap-3 font-mono tabular-nums text-red-800 dark:text-red-300">
              <span>شهري: {alert.monthlyPct.toFixed(0)}%</span>
              {alert.dailyCapGb > 0 && (
                <>
                  <span aria-hidden="true" className="text-red-300 dark:text-red-700">·</span>
                  <span>يومي: {alert.dailyPct.toFixed(0)}%</span>
                </>
              )}
              <span aria-hidden="true" className="text-red-300 dark:text-red-700">·</span>
              <span className="font-semibold">
                {alert.severity === 'exhausted' ? 'مفصول تلقائياً' : 'تحذير حرج'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
