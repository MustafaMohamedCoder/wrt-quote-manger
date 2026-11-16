import React, { useMemo, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { computeUserQuotasAndAlerts } from '../utils/quotaAlerts';
import type { NetworkDevice, UserProfile } from '../types';

interface BundleDistributionPieChartProps {
  bundleGb: number;
  users: UserProfile[];
  devices: NetworkDevice[];
  darkMode: boolean;
}

type PieViewScope = 'bundle' | 'consumed';

interface DistributionSlice {
  key: string;
  name: string;
  valueGb: number;
  bundlePct: number;
  consumedPct: number;
  userQuotaGb: number;
  userQuotaPct: number;
  allocationLabel: string;
  isCriticalOrExhausted: boolean;
  isRemaining?: boolean;
  color: string;
}

interface DistributionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DistributionSlice }>;
  bundleGb: number;
}

const SLICE_PALETTE = [
  '#0284c7',
  '#0d9488',
  '#4f46e5',
  '#d97706',
  '#0ea5e9',
  '#059669',
];

const DistributionTooltip: React.FC<DistributionTooltipProps> = ({
  active,
  payload,
  bundleGb,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 shadow-md text-xs space-y-2 min-w-[225px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
          <span
            className="w-2.5 h-2.5 rounded-xs inline-block shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.name}</span>
        </span>
        {item.isCriticalOrExhausted && (
          <span className="text-red-700 dark:text-red-400 font-semibold">
            تنبيه &ge; 90%
          </span>
        )}
      </div>

      <div className="text-slate-500 dark:text-slate-400">
        {item.allocationLabel}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            الكمية:
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {item.valueGb.toFixed(2)} GB
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            من الباقة ({bundleGb} GB):
          </span>
          <span className="font-semibold text-sky-700 dark:text-sky-400">
            {item.bundlePct.toFixed(1)}%
          </span>
        </div>

        {!item.isRemaining && (
          <div className="flex items-center justify-between gap-4">
            <span className="font-sans text-slate-600 dark:text-slate-400">
              من إجمالي المستهلك:
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              {item.consumedPct.toFixed(1)}%
            </span>
          </div>
        )}

        {item.userQuotaGb > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="font-sans text-slate-600 dark:text-slate-400">
              من حصة المستخدم:
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              {item.userQuotaPct.toFixed(0)}% ({item.userQuotaGb.toFixed(1)} GB)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface SliceLabelArgs {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

const RADIAN = Math.PI / 180;

export const BundleDistributionPieChart: React.FC<BundleDistributionPieChartProps> = React.memo(({
  bundleGb,
  users,
  devices,
  darkMode,
}) => {
  const [scope, setScope] = useState<PieViewScope>('bundle');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { slices, totalUsedGb, remainingGb, totalUsedPct } = useMemo(() => {
    const { quotaMap } = computeUserQuotasAndAlerts(bundleGb, users, devices);
    const totalUsed = devices.reduce((sum, d) => sum + d.usedGb, 0);
    const safeBundle = bundleGb > 0 ? bundleGb : 1;
    const safeConsumed = totalUsed > 0 ? totalUsed : 1;

    const list: DistributionSlice[] = users.map((u, idx) => {
      const q = quotaMap.get(u.id)!;
      const val = Number(q.usedGb.toFixed(2));
      return {
        key: u.id,
        name: u.name,
        valueGb: val,
        bundlePct: (val / safeBundle) * 100,
        consumedPct: totalUsed > 0 ? (val / safeConsumed) * 100 : 0,
        userQuotaGb: q.quotaGb,
        userQuotaPct: q.monthlyPct,
        allocationLabel:
          u.allocationMode === 'fixed' ? 'حصة ثابتة' : 'تقسيم متساوي',
        isCriticalOrExhausted: q.isCriticalOrExhausted,
        color: q.isCriticalOrExhausted
          ? '#dc2626'
          : SLICE_PALETTE[idx % SLICE_PALETTE.length],
      };
    });

    const unassignedUsed = devices
      .filter((d) => !d.userId || !users.some((u) => u.id === d.userId))
      .reduce((sum, d) => sum + d.usedGb, 0);

    if (unassignedUsed > 0) {
      const val = Number(unassignedUsed.toFixed(2));
      list.push({
        key: '__unassigned__',
        name: 'أجهزة غير معينة',
        valueGb: val,
        bundlePct: (val / safeBundle) * 100,
        consumedPct: totalUsed > 0 ? (val / safeConsumed) * 100 : 0,
        userQuotaGb: 0,
        userQuotaPct: 0,
        allocationLabel: 'أجهزة بدون مستخدم مرتبط',
        isCriticalOrExhausted: false,
        color: '#64748b',
      });
    }

    const rem = Math.max(0, bundleGb - totalUsed);
    if (scope === 'bundle' && rem > 0) {
      const val = Number(rem.toFixed(2));
      list.push({
        key: '__remaining__',
        name: 'رصيد الباقة المتبقي',
        valueGb: val,
        bundlePct: (val / safeBundle) * 100,
        consumedPct: 0,
        userQuotaGb: 0,
        userQuotaPct: 0,
        allocationLabel: 'المتبقي غير المستهلك من الدورة',
        isCriticalOrExhausted: false,
        isRemaining: true,
        color: darkMode ? '#1e293b' : '#cbd5e1',
      });
    }

    return {
      slices: list,
      totalUsedGb: totalUsed,
      remainingGb: rem,
      totalUsedPct: Math.min(100, (totalUsed / safeBundle) * 100),
    };
  }, [bundleGb, users, devices, darkMode, scope]);

  const chartSlices = useMemo(
    () => slices.filter((s) => s.valueGb > 0),
    [slices]
  );

  const renderSliceLabel = ({
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    percent = 0,
  }: SliceLabelArgs) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill={darkMode ? '#f8fafc' : '#0f172a'}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        className="font-mono tabular-nums pointer-events-none"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            توزيع استهلاك الباقة الشهرية بين المستخدمين (Pie Chart)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            يوضح نسبة مساهمة كل مستخدم من إجمالي الباقة الشهرية ({bundleGb} GB) — مستهلك{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
              {totalUsedGb.toFixed(2)} GB ({totalUsedPct.toFixed(1)}%)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setScope('bundle')}
            className={`px-3 py-1 font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              scope === 'bundle'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            نسبة من إجمالي الباقة
          </button>
          <button
            type="button"
            onClick={() => setScope('consumed')}
            className={`px-3 py-1 font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              scope === 'consumed'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            المستهلكون فقط
          </button>
        </div>
      </div>

      {chartSlices.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
          لا توجد بيانات استهلاك بعد لعرض التوزيع النسبي للباقة.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-center">
          {/* Pie Chart Canvas */}
          <div className="lg:col-span-5 h-64 relative" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartSlices}
                  dataKey="valueGb"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={98}
                  paddingAngle={1.5}
                  labelLine={false}
                  label={renderSliceLabel}
                  stroke={darkMode ? '#0f172a' : '#ffffff'}
                  strokeWidth={2}
                  isAnimationActive={false}
                  onMouseEnter={(_, idx) => {
                    if (chartSlices[idx]) setActiveKey(chartSlices[idx].key);
                  }}
                  onMouseLeave={() => setActiveKey(null)}
                >
                  {chartSlices.map((slice) => (
                    <Cell
                      key={slice.key}
                      fill={slice.color}
                      fillOpacity={
                        activeKey && activeKey !== slice.key ? 0.45 : 1
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<DistributionTooltip bundleGb={bundleGb} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {scope === 'bundle' ? 'الباقة' : 'المستهلك'}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {scope === 'bundle'
                  ? `${bundleGb} GB`
                  : `${totalUsedGb.toFixed(1)} GB`}
              </span>
            </div>
          </div>

          {/* Structured User Percentage Share Table */}
          <div className="lg:col-span-7 space-y-2.5">
            {slices.map((slice) => {
              const displayPct =
                scope === 'bundle' ? slice.bundlePct : slice.consumedPct;
              const isHighlighted = activeKey === slice.key;
              return (
                <div
                  key={slice.key}
                  onMouseEnter={() => setActiveKey(slice.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    isHighlighted
                      ? 'border-sky-300 dark:border-sky-700 bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-100 dark:border-slate-800/80 bg-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {slice.name}
                      </span>
                      {slice.isCriticalOrExhausted && (
                        <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
                          (تنبيه &ge; 90%)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                      <span className="text-slate-600 dark:text-slate-400">
                        {slice.valueGb.toFixed(2)} GB
                      </span>
                      <span
                        className={`font-semibold min-w-[52px] text-left ${
                          slice.isCriticalOrExhausted
                            ? 'text-red-700 dark:text-red-400'
                            : slice.isRemaining
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {displayPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, displayPct)}%`,
                        backgroundColor: slice.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
              <span className="font-sans">
                المتبقي من الباقة الشهرية:
              </span>
              <span>
                {remainingGb.toFixed(2)} GB ({Math.max(0, 100 - totalUsedPct).toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
