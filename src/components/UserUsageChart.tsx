import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeUserQuotasAndAlerts } from '../utils/quotaAlerts';
import type { NetworkDevice, UserProfile } from '../types';

interface UserUsageChartProps {
  bundleGb: number;
  users: UserProfile[];
  devices: NetworkDevice[];
  darkMode: boolean;
}

interface UserChartDatum {
  id: string;
  name: string;
  usedGb: number;
  remainingGb: number;
  quotaGb: number;
  monthlyPct: number;
  dailyUsedGb: number;
  dailyCapGb: number;
  dailyPct: number;
  liveDownMbps: number;
  liveUpMbps: number;
  onlineDevicesCount: number;
  allocationLabel: string;
  isCriticalOrExhausted: boolean;
  isExhausted: boolean;
  isDailyCritical: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: UserChartDatum }>;
}

const UserBarTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm text-xs space-y-1.5 min-w-[210px]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {item.name}
        </span>
        {item.isCriticalOrExhausted && (
          <span className="text-red-700 dark:text-red-400 font-semibold">
            {item.isExhausted ? 'نفد الرصيد' : 'تنبيه ≥ 90%'}
          </span>
        )}
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        {item.allocationLabel}
      </div>
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            الاستهلاك الشهري:
          </span>
          <span
            className={`font-semibold ${
              item.monthlyPct >= 90
                ? 'text-red-700 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {item.usedGb.toFixed(2)} GB ({item.monthlyPct.toFixed(0)}%)
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            المتبقي من الحصة:
          </span>
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
            {item.remainingGb.toFixed(2)} GB
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            إجمالي الحصة:
          </span>
          <span className="text-slate-700 dark:text-slate-300">
            {item.quotaGb.toFixed(2)} GB
          </span>
        </div>
        {item.dailyCapGb > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="font-sans text-slate-600 dark:text-slate-400">
              الاستهلاك اليومي:
            </span>
            <span
              className={
                item.isDailyCritical
                  ? 'text-red-700 dark:text-red-400 font-semibold'
                  : 'text-slate-700 dark:text-slate-300'
              }
            >
              {item.dailyUsedGb.toFixed(2)} / {item.dailyCapGb.toFixed(1)} GB (
              {item.dailyPct.toFixed(0)}%)
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            السرعة الحالية ({item.onlineDevicesCount} جهاز):
          </span>
          <span className="text-slate-800 dark:text-slate-200">
            <span className="text-sky-700 dark:text-sky-400">
              ↓ {item.liveDownMbps.toFixed(2)}
            </span>
            {' · '}
            <span className="text-emerald-700 dark:text-emerald-400">
              ↑ {item.liveUpMbps.toFixed(2)} Mbps
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export const UserUsageChart: React.FC<UserUsageChartProps> = React.memo(({
  bundleGb,
  users,
  devices,
  darkMode,
}) => {
  const userData = useMemo(() => {
    const { quotaMap } = computeUserQuotasAndAlerts(bundleGb, users, devices);

    const rows: UserChartDatum[] = users.map((u) => {
      const q = quotaMap.get(u.id)!;
      const remainingGb = Math.max(0, q.quotaGb - q.usedGb);
      const userDevices = devices.filter((d) => d.userId === u.id);
      const activeUserDevices = userDevices.filter(
        (d) => d.online && !d.blocked && !d.paused && !q.isExhausted
      );
      const liveDownMbps = activeUserDevices.reduce(
        (sum, d) => sum + d.liveDownMbps,
        0
      );
      const liveUpMbps = activeUserDevices.reduce(
        (sum, d) => sum + d.liveUpMbps,
        0
      );
      return {
        id: u.id,
        name: u.name,
        usedGb: Number(q.usedGb.toFixed(2)),
        remainingGb: Number(remainingGb.toFixed(2)),
        quotaGb: Number(q.quotaGb.toFixed(2)),
        monthlyPct: q.monthlyPct,
        dailyUsedGb: Number(q.dailyUsedGb.toFixed(2)),
        dailyCapGb: u.dailyCapGb,
        dailyPct: q.dailyPct,
        liveDownMbps: Number(liveDownMbps.toFixed(2)),
        liveUpMbps: Number(liveUpMbps.toFixed(2)),
        onlineDevicesCount: activeUserDevices.length,
        allocationLabel:
          u.allocationMode === 'fixed' ? 'حصة ثابتة' : 'تقسيم متساوي',
        isCriticalOrExhausted: q.isCriticalOrExhausted,
        isExhausted: q.isExhausted,
        isDailyCritical: q.isDailyCritical,
      };
    });

    return rows;
  }, [bundleGb, users, devices]);

  const getBarColor = (entry: UserChartDatum) => {
    if (entry.isCriticalOrExhausted) return '#dc2626';
    if (entry.monthlyPct >= 75 || (entry.dailyCapGb > 0 && entry.dailyPct >= 75)) {
      return '#d97706';
    }
    return '#0284c7';
  };

  const gridStroke = darkMode ? '#1e293b' : '#f1f5f9';
  const axisTickColor = darkMode ? '#94a3b8' : '#334155';
  const axisLineColor = darkMode ? '#334155' : '#e2e8f0';
  const remainingBarFill = darkMode ? '#1e293b' : '#e2e8f0';
  const cursorFill = darkMode
    ? 'rgba(30, 41, 59, 0.55)'
    : 'rgba(241, 245, 249, 0.7)';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            الاستهلاك الشهري للمستخدمين مقارنة بالحصص
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            يتحول لون العمود إلى الأحمر تلقائياً عند وصول المستخدم إلى 90% من باقته الشهرية أو اليومية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
            <span>استهلاك طبيعي</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 inline-block" />
            <span>تحذير (75%–89%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" />
            <span>حرج / مستنفد (&ge; 90%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-800 inline-block" />
            <span>المتبقي من الحصة</span>
          </span>
        </div>
      </div>

      {userData.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
          لا يوجد مستخدمون مسجلون لعرض الرسم البياني. أضف مستخدمين من تبويب «المستخدمون والحظر».
        </div>
      ) : (
        <div className="pt-5">
          {/* Bar Chart: Used vs Remaining per user */}
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={userData}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                barSize={36}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStroke}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: axisTickColor, fontSize: 12 }}
                  axisLine={{ stroke: axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit=" GB"
                  width={56}
                />
                <Tooltip
                  content={<UserBarTooltip />}
                  cursor={{ fill: cursorFill }}
                />
                <Bar
                  dataKey="usedGb"
                  stackId="quota"
                  radius={[0, 0, 4, 4]}
                  isAnimationActive={false}
                >
                  {userData.map((entry) => (
                    <Cell key={entry.id} fill={getBarColor(entry)} />
                  ))}
                </Bar>
                <Bar
                  dataKey="remainingGb"
                  stackId="quota"
                  fill={remainingBarFill}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
});
