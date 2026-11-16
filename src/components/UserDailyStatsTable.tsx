import React, { useMemo } from 'react';
import type { NetworkDevice, UserProfile } from '../types';

interface UserDailyStatsTableProps {
  users: UserProfile[];
  devices: NetworkDevice[];
}

export const UserDailyStatsTable: React.FC<UserDailyStatsTableProps> = React.memo(({
  users,
  devices,
}) => {
  const dayColumns = useMemo(() => {
    const today = new Date();
    const cols: Array<{ key: string; label: string; isToday: boolean }> = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      cols.push({
        key: `d-${offset}`,
        label: offset === 0 ? 'اليوم' : offset === 1 ? 'أمس' : `${dd}/${mm}`,
        isToday: offset === 0,
      });
    }
    return cols;
  }, []);

  const rows = useMemo(() => {
    return users.map((u) => {
      const history = u.dailyHistoryGb ?? [0, 0, 0, 0, 0, 0];
      const normalizedHistory = Array.from({ length: 6 }, (_, i) =>
        Number((history[i] ?? 0).toFixed(2))
      );
      const todayLive = devices
        .filter((d) => d.userId === u.id)
        .reduce((sum, d) => sum + d.dailyUsedGb, 0);

      const days = [...normalizedHistory, Number(todayLive.toFixed(2))];
      const total7d = days.reduce((sum, val) => sum + val, 0);
      const avgDaily = total7d / 7;
      const capExceeded = u.dailyCapGb > 0 && todayLive >= u.dailyCapGb;
      const capCritical =
        u.dailyCapGb > 0 && !capExceeded && todayLive >= u.dailyCapGb * 0.9;

      return {
        user: u,
        days,
        total7d,
        avgDaily,
        capExceeded,
        capCritical,
      };
    });
  }, [users, devices]);

  const totalsByDay = useMemo(() => {
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) {
      for (let i = 0; i < 7; i++) {
        sums[i] += r.days[i];
      }
    }
    const grandTotal = sums.reduce((acc, v) => acc + v, 0);
    return {
      sums,
      grandTotal,
      avgTotal: grandTotal / 7,
    };
  }, [rows]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            جدول الإحصائيات — الاستهلاك اليومي خلال آخر 7 أيام
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ملخص السحب اليومي بوحدة GB لمراقبة الأنماط وتفادي استنفاد الباقة مبكراً
          </p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          إجمالي 7 أيام: {totalsByDay.grandTotal.toFixed(2)} GB · المتوسط اليومي للشبكة:{' '}
          {totalsByDay.avgTotal.toFixed(2)} GB
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
          لا توجد بيانات مستخدمين لعرض جدول الإحصائيات اليومية.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-3 px-4 whitespace-nowrap">المستخدم</th>
                {dayColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-3 px-3 whitespace-nowrap font-mono tabular-nums ${
                      col.isToday ? 'text-sky-700 dark:text-sky-400' : ''
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="py-3 px-4 whitespace-nowrap">إجمالي 7 أيام</th>
                <th className="py-3 px-4 whitespace-nowrap">المتوسط اليومي</th>
                <th className="py-3 px-4 whitespace-nowrap">السقف اليومي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {rows.map((r) => (
                <tr
                  key={r.user.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                      {r.user.name}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {r.user.allocationMode === 'fixed' ? 'حصة ثابتة' : 'تقسيم متساوي'}
                    </div>
                  </td>

                  {r.days.map((val, idx) => {
                    const isToday = idx === 6;
                    const criticalOrOver =
                      r.user.dailyCapGb > 0 && val >= r.user.dailyCapGb * 0.9;
                    return (
                      <td
                        key={`${r.user.id}-${idx}`}
                        className={`py-2.5 px-3 font-mono tabular-nums whitespace-nowrap ${
                          criticalOrOver
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : isToday
                            ? 'text-sky-700 dark:text-sky-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {val.toFixed(2)}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {r.total7d.toFixed(2)} GB
                  </td>

                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {r.avgDaily.toFixed(2)} GB
                  </td>

                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {r.user.dailyCapGb > 0 ? (
                      <span
                        className={`font-mono tabular-nums ${
                          r.capExceeded || r.capCritical
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {r.user.dailyCapGb.toFixed(1)} GB
                        {r.capExceeded
                          ? ' · متجاوز'
                          : r.capCritical
                          ? ' · تنبيه 90%+'
                          : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        بلا سقف
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <td className="py-2.5 px-4 whitespace-nowrap">إجمالي الشبكة</td>
                {totalsByDay.sums.map((sum, idx) => (
                  <td
                    key={`tot-${idx}`}
                    className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap"
                  >
                    {sum.toFixed(2)}
                  </td>
                ))}
                <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">
                  {totalsByDay.grandTotal.toFixed(2)} GB
                </td>
                <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">
                  {totalsByDay.avgTotal.toFixed(2)} GB
                </td>
                <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 font-normal whitespace-nowrap">
                  وحدة القياس: GB
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
});
