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
  avgDownMbps: number;
  avgUpMbps: number;
  peakDownMbps: number;
  peakUpMbps: number;
}

function formatByteRate(mbps: number): string {
  const kbytesPerSec = mbps * 125; // 1 Mbps = 125 KB/s
  if (kbytesPerSec >= 1024) {
    return `${(kbytesPerSec / 1024).toFixed(2)} MB/s`;
  }
  return `${Math.round(kbytesPerSec)} KB/s`;
}

const AggregateTrafficTooltip: React.FC<TrafficTooltipProps> = ({
  active,
  payload,
  avgDownMbps,
  avgUpMbps,
  peakDownMbps,
  peakUpMbps,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const totalMbps = item.downMbps + item.upMbps;
  const downDelta = item.downMbps - avgDownMbps;
  const upDelta = item.upMbps - avgUpMbps;
  const downSharePct = totalMbps > 0 ? Math.round((item.downMbps / totalMbps) * 100) : 0;

  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 shadow-md text-xs space-y-2 min-w-[240px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
          اللحظة: {item.timeLabel}
        </span>
        {typeof item.activeDevices === 'number' && (
          <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {item.activeDevices} أجهزة نشطة
          </span>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 font-mono tabular-nums">
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 font-sans text-slate-700 dark:text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-xs bg-sky-600 inline-block" />
              <span>التحميل الدقيق</span>
            </span>
            <span className="font-semibold text-sky-700 dark:text-sky-400">
              ↓ {item.downMbps.toFixed(2)} Mbps
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span>{formatByteRate(item.downMbps)}</span>
            <span>
              {downDelta >= 0 ? '+' : ''}
              {downDelta.toFixed(2)} عن المتوسط · ذروة {peakDownMbps.toFixed(1)}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 font-sans text-slate-700 dark:text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-xs bg-emerald-600 inline-block" />
              <span>الرفع الدقيق</span>
            </span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              ↑ {item.upMbps.toFixed(2)} Mbps
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span>{formatByteRate(item.upMbps)}</span>
            <span>
              {upDelta >= 0 ? '+' : ''}
              {upDelta.toFixed(2)} عن المتوسط · ذروة {peakUpMbps.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-[11px] font-mono tabular-nums">
        <span className="font-sans text-slate-600 dark:text-slate-400">
          الإجمالي ({downSharePct}% تحميل)
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {totalMbps.toFixed(2)} Mbps ({formatByteRate(totalMbps)})
        </span>
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
    let sumDown = 0;
    let sumUp = 0;
    for (const s of samples) {
      if (s.downMbps > peakDown) peakDown = s.downMbps;
      if (s.upMbps > peakUp) peakUp = s.upMbps;
      sumDown += s.downMbps;
      sumUp += s.upMbps;
    }
    const count = samples.length || 1;
    return {
      latest,
      peakDown,
      peakUp,
      avgDown: sumDown / count,
      avgUp: sumUp / count,
    };
  }, [samples]);

  const gridStroke = darkMode ? '#1e293b' : '#f1f5f9';
  const axisTickColor = darkMode ? '#94a3b8' : '#334155';
  const axisLineColor = darkMode ? '#334155' : '#e2e8f0';
  const cursorStroke = darkMode ? '#475569' : '#94a3b8';
  const pointRing = darkMode ? '#0f172a' : '#ffffff';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            إجمالي حركة البيانات الحية للراوتر (Aggregate Traffic)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {simRunning
              ? 'تحديث لحظي كل ثانية — مرّر الفأرة فوق النقاط لعرض القيم الدقيقة للتحميل والرفع'
              : 'مرّر الفأرة فوق أي نقطة لعرض تفاصيل التحميل والرفع الدقيقة — شغّل المحاكاة الحية لرصد التدفق المستمر'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">التحميل:</span>
            <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
              ↓ {summary.latest.downMbps.toFixed(2)} Mbps
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
            <span className="text-slate-600 dark:text-slate-400">الرفع:</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
              ↑ {summary.latest.upMbps.toFixed(2)} Mbps
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
            margin={{ top: 10, right: 14, left: 0, bottom: 0 }}
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
              width={66}
            />
            <Tooltip
              cursor={{ stroke: cursorStroke, strokeWidth: 1, strokeDasharray: '4 4' }}
              content={
                <AggregateTrafficTooltip
                  avgDownMbps={summary.avgDown}
                  avgUpMbps={summary.avgUp}
                  peakDownMbps={summary.peakDown}
                  peakUpMbps={summary.peakUp}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="downMbps"
              name="التحميل"
              stroke="#0284c7"
              strokeWidth={2}
              fill="url(#qmDownFill)"
              dot={{ r: 2.5, fill: '#0284c7', stroke: pointRing, strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#0284c7', stroke: pointRing, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="upMbps"
              name="الرفع"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#qmUpFill)"
              dot={{ r: 2.5, fill: '#10b981', stroke: pointRing, strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#10b981', stroke: pointRing, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
