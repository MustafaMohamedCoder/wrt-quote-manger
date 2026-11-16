import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrafficSample } from '../types';

interface AggregateTrafficChartProps {
  samples: TrafficSample[];
  darkMode: boolean;
  simRunning: boolean;
}

interface TrafficTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TrafficSample }>;
}

const AggregateTrafficTooltip: React.FC<TrafficTooltipProps> = ({
  active,
  payload,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm text-xs space-y-1.5 min-w-[170px]"
    >
      <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
        الوقت: {item.timeLabel}
      </div>
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            التحميل الكلي:
          </span>
          <span className="font-semibold text-sky-700 dark:text-sky-400">
            ↓ {item.downMbps.toFixed(1)} Mbps
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-slate-600 dark:text-slate-400">
            الرفع الكلي:
          </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            ↑ {item.upMbps.toFixed(1)} Mbps
          </span>
        </div>
      </div>
    </div>
  );
};

export const AggregateTrafficChart: React.FC<AggregateTrafficChartProps> = React.memo(({
  samples,
  darkMode,
  simRunning,
}) => {
  const summary = useMemo(() => {
    const latest = samples[samples.length - 1] || {
      timeLabel: '--:--:--',
      downMbps: 0,
      upMbps: 0,
    };
    let peakDown = 0;
    let peakUp = 0;
    for (const s of samples) {
      if (s.downMbps > peakDown) peakDown = s.downMbps;
      if (s.upMbps > peakUp) peakUp = s.upMbps;
    }
    return { latest, peakDown, peakUp };
  }, [samples]);

  const gridStroke = darkMode ? '#1e293b' : '#f1f5f9';
  const axisTickColor = darkMode ? '#94a3b8' : '#334155';
  const axisLineColor = darkMode ? '#334155' : '#e2e8f0';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            إجمالي حركة البيانات الحية للراوتر (Aggregate Traffic)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {simRunning
              ? 'تحديث لحظي كل ثانية لمجموع سرعات التحميل والرفع لجميع الأجهزة المتصلة'
              : 'يعرض السرعة التراكمية الحالية للراوتر — شغّل المحاكاة الحية لرصد التدفق المستمر'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">التحميل:</span>
            <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
              ↓ {summary.latest.downMbps.toFixed(1)} Mbps
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">الرفع:</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
              ↑ {summary.latest.upMbps.toFixed(1)} Mbps
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span className="font-sans">الذروة:</span>
            <span>↓ {summary.peakDown.toFixed(1)}</span>
            <span aria-hidden="true">/</span>
            <span>↑ {summary.peakUp.toFixed(1)} Mbps</span>
          </div>
        </div>
      </div>

      <div className="h-56 pt-4" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={samples}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="qmDownFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="qmUpFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={gridStroke}
              vertical={false}
            />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: axisTickColor, fontSize: 11 }}
              axisLine={{ stroke: axisLineColor }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: axisTickColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              unit=" Mbps"
              width={64}
            />
            <Tooltip content={<AggregateTrafficTooltip />} />
            <Area
              type="monotone"
              dataKey="downMbps"
              name="التحميل"
              stroke="#0284c7"
              strokeWidth={2}
              fill="url(#qmDownFill)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="upMbps"
              name="الرفع"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#qmUpFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
