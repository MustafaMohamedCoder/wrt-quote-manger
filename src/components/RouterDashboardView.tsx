import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  WifiOff,
} from 'lucide-react';
import { AggregateTrafficChart } from './AggregateTrafficChart';
import { UserUsageChart } from './UserUsageChart';
import { UserDailyStatsTable } from './UserDailyStatsTable';
import { QuotaAlertsBanner } from './QuotaAlertsBanner';
import { computeUserQuotasAndAlerts } from '../utils/quotaAlerts';
import type {
  BundleSettings,
  NetworkDevice,
  TrafficSample,
  UserProfile,
} from '../types';

interface RouterDashboardViewProps {
  settings: BundleSettings;
  users: UserProfile[];
  devices: NetworkDevice[];
  trafficHistory: TrafficSample[];
  simRunning: boolean;
  darkMode: boolean;
  onToggleSim: () => void;
  onAssignUser: (mac: string, userId: string | null) => void;
  onDeviceOp: (
    mac: string,
    op: 'pause' | 'unpause' | 'block' | 'unblock' | 'kick'
  ) => void;
  onSetDeviceLimit: (mac: string, downMbps: number, upMbps: number) => void;
  onAddTestDevice: () => void;
  onResetCycle: () => void;
}

type DeviceFilter = 'all' | 'active' | 'blocked' | 'unassigned';

export const RouterDashboardView: React.FC<RouterDashboardViewProps> = ({
  settings,
  users,
  devices,
  trafficHistory,
  simRunning,
  darkMode,
  onToggleSim,
  onAssignUser,
  onDeviceOp,
  onSetDeviceLimit,
  onAddTestDevice,
  onResetCycle,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [editingLimitMac, setEditingLimitMac] = useState<string | null>(null);
  const [draftDown, setDraftDown] = useState<number>(0);
  const [draftUp, setDraftUp] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [alertsDismissed, setAlertsDismissed] = useState<boolean>(false);

  const handleDismissAlerts = useCallback(() => setAlertsDismissed(true), []);
  const handleShowAlerts = useCallback(() => setAlertsDismissed(false), []);

  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const { quotaMap: userStats, alerts } = useMemo(
    () => computeUserQuotasAndAlerts(settings.bundleGb, users, devices),
    [settings.bundleGb, users, devices]
  );

  const alertSignature = alerts.map((a) => `${a.userId}:${a.severity}`).join('|');
  const prevAlertSigRef = useRef(alertSignature);
  useEffect(() => {
    if (alertSignature && alertSignature !== prevAlertSigRef.current) {
      setAlertsDismissed(false);
    }
    prevAlertSigRef.current = alertSignature;
  }, [alertSignature]);

  const totalUsedGb = useMemo(
    () => devices.reduce((sum, d) => sum + d.usedGb, 0),
    [devices]
  );
  const remainingGb = Math.max(0, settings.bundleGb - totalUsedGb);
  const usedPct = Math.min(
    100,
    settings.bundleGb > 0 ? (totalUsedGb / settings.bundleGb) * 100 : 0
  );

  const getDeviceBlockReason = useCallback(
    (d: NetworkDevice): string | null => {
      if (d.blocked) return 'محظور يدوياً';
      if (d.paused) return 'متوقف مؤقتاً';
      if (!d.userId || !userMap.has(d.userId)) {
        return settings.blockNewDevices ? 'جهاز جديد محظور (0 GB)' : null;
      }
      const st = userStats.get(d.userId);
      if (st?.isExhausted) {
        return d.userId && (userMap.get(d.userId)?.dailyCapGb || 0) > 0 && st.dailyPct >= 100
          ? 'تجاوز السقف اليومي'
          : 'نفدت حصة المستخدم';
      }
      return null;
    },
    [userMap, settings.blockNewDevices, userStats]
  );

  const activeCount = useMemo(
    () => devices.filter((d) => d.online && !getDeviceBlockReason(d)).length,
    [devices, getDeviceBlockReason]
  );

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      const blockReason = getDeviceBlockReason(d);
      if (filter === 'active' && (blockReason !== null || !d.online)) return false;
      if (filter === 'blocked' && blockReason === null) return false;
      if (filter === 'unassigned' && d.userId !== null) return false;
      if (!q) return true;
      const uName = d.userId ? userMap.get(d.userId)?.name || '' : '';
      return (
        d.hostname.toLowerCase().includes(q) ||
        d.mac.toLowerCase().includes(q) ||
        d.ip.toLowerCase().includes(q) ||
        uName.toLowerCase().includes(q)
      );
    });
  }, [devices, filter, search, userMap, getDeviceBlockReason]);

  const openLimitEditor = (d: NetworkDevice) => {
    setEditingLimitMac(d.mac);
    setDraftDown(d.limitDownMbps);
    setDraftUp(d.limitUpMbps);
  };

  const handleSaveLimit = (mac: string) => {
    onSetDeviceLimit(mac, Math.max(0, draftDown), Math.max(0, draftUp));
    setEditingLimitMac(null);
    setNotice('تم تحديث حد السرعة في قواعد tc / fq_codel.');
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Control strip above KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            مراقبة الباقة والأجهزة — Halo G920
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              الوضع:{' '}
              {settings.operationMode === 'router'
                ? 'راوتر وبوابة (fw4 + NAT)'
                : 'أكسس بوينت (Bridge nftables)'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              QoS للألعاب: {settings.enableQos ? 'مفعل (fq_codel)' : 'معطل'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Port {settings.dashboardPort}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSim}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              simRunning
                ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600 hover:bg-slate-800 dark:hover:bg-sky-700'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {simRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>إيقاف محاكاة الاستهلاك</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>تشغيل محاكاة الاستهلاك الحي</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onAddTestDevice}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>محاكاة اتصال جهاز جديد</span>
          </button>

          <button
            type="button"
            onClick={onResetCycle}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0"
          >
            تصفير الدورة
          </button>
        </div>
      </div>

      {notice && (
        <div className="border border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 rounded-lg px-4 py-2.5 text-xs font-medium">
          {notice}
        </div>
      )}

      {/* In-Dashboard 90%+ Quota Alert Notifications */}
      <QuotaAlertsBanner
        alerts={alerts}
        dismissed={alertsDismissed}
        onDismiss={handleDismissAlerts}
        onShow={handleShowAlerts}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            سعة الباقة الشهرية
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {settings.bundleGb.toFixed(0)} GB
          </div>
          <div className="mt-3 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                usedPct >= 90
                  ? 'bg-red-600'
                  : usedPct >= 75
                  ? 'bg-amber-500'
                  : 'bg-sky-600'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            يوم التجديد: {settings.renewDay} من كل شهر
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            الاستهلاك الفعلي للدورة
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {totalUsedGb.toFixed(2)} GB
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {usedPct.toFixed(1)}% من إجمالي الباقة
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            الرصيد المتبقي
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {remainingGb.toFixed(2)} GB
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            يتوزع تلقائياً على حصص التقسيم المتساوي
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            الأجهزة المسموح لها بالاتصال
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {activeCount} / {devices.length}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {settings.blockNewDevices
              ? 'الأجهزة الجديدة تبدأ محظورة (0 GB)'
              : 'الأجهزة الجديدة مسموحة مؤقتاً'}
          </div>
        </div>
      </div>

      {/* Real-time Aggregate Router Traffic Chart */}
      <AggregateTrafficChart
        samples={trafficHistory}
        darkMode={darkMode}
        simRunning={simRunning}
      />

      {/* Monthly User Usage Charts */}
      <UserUsageChart
        bundleGb={settings.bundleGb}
        users={users}
        devices={devices}
        darkMode={darkMode}
      />

      {/* 7-Day Daily Stats Table */}
      <UserDailyStatsTable users={users} devices={devices} />

      {/* Connected Devices Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              الأجهزة المتصلة بالشبكة
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              ({filteredDevices.length})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، MAC، أو IP..."
                className="pr-9 pl-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 w-56"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'active', label: 'متصل' },
                  { id: 'blocked', label: 'مفصول' },
                  { id: 'unassigned', label: 'غير معين' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filter === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-3 px-4">الجهاز والعنوان</th>
                <th className="py-3 px-4">صاحب الجهاز</th>
                <th className="py-3 px-4">الاستهلاك</th>
                <th className="py-3 px-4">السرعة والحد</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 px-4 text-center text-slate-500 dark:text-slate-400 text-xs"
                  >
                    لا توجد أجهزة مطابقة لخيارات البحث أو التصفية الحالية.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((d) => {
                  const blockReason = getDeviceBlockReason(d);
                  const assignedUser = d.userId ? userMap.get(d.userId) : null;
                  const effectiveDownLimit =
                    d.limitDownMbps > 0
                      ? d.limitDownMbps
                      : assignedUser?.speedDownMbps || 0;
                  const effectiveUpLimit =
                    d.limitUpMbps > 0
                      ? d.limitUpMbps
                      : assignedUser?.speedUpMbps || 0;

                  return (
                    <tr
                      key={d.mac}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {d.hostname}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          <span>{d.mac}</span>
                          <span aria-hidden="true">·</span>
                          <span>{d.ip}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{d.connectionType}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <select
                          aria-label={`تعيين المستخدم للجهاز ${d.hostname}`}
                          value={d.userId || ''}
                          onChange={(e) =>
                            onAssignUser(d.mac, e.target.value || null)
                          }
                          className="text-xs border border-slate-300 dark:border-slate-700 rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="">غير معين</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4 align-top font-mono tabular-nums">
                        <div className="text-slate-900 dark:text-slate-100 font-medium">
                          {d.usedGb.toFixed(2)} GB
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          اليوم: {d.dailyUsedGb.toFixed(2)} GB
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top font-mono tabular-nums">
                        {editingLimitMac === d.mac ? (
                          <div className="space-y-2 min-w-[230px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <label className="flex items-center gap-1 text-[11px] font-sans text-slate-600 dark:text-slate-400">
                                <span>↓</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={1000}
                                  value={draftDown}
                                  onChange={(e) => setDraftDown(Number(e.target.value))}
                                  className="w-14 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  title="حد التحميل Mbps (0 = مفتوح)"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] font-sans text-slate-600 dark:text-slate-400">
                                <span>↑</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={1000}
                                  value={draftUp}
                                  onChange={(e) => setDraftUp(Number(e.target.value))}
                                  className="w-14 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  title="حد الرفع Mbps (0 = مفتوح)"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleSaveLimit(d.mac)}
                                className="px-2 py-1 text-xs font-sans bg-sky-600 text-white rounded hover:bg-sky-700"
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLimitMac(null)}
                                className="px-2 py-1 text-xs font-sans border border-slate-300 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300"
                              >
                                إلغاء
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 font-sans">
                              {[
                                { label: '1M', d: 1, u: 1 },
                                { label: '3M', d: 3, u: 1 },
                                { label: '5M', d: 5, u: 2 },
                                { label: '10M', d: 10, u: 3 },
                                { label: '20M', d: 20, u: 5 },
                                { label: 'مفتوح', d: 0, u: 0 },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setDraftDown(preset.d);
                                    setDraftUp(preset.u);
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-slate-900 dark:text-slate-100">
                              ↓ {blockReason ? '0.0' : d.liveDownMbps.toFixed(1)} · ↑{' '}
                              {blockReason ? '0.0' : d.liveUpMbps.toFixed(1)} Mbps
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              السقف:{' '}
                              {effectiveDownLimit > 0 || effectiveUpLimit > 0
                                ? `${effectiveDownLimit || 'مفتوح'} / ${effectiveUpLimit || 'مفتوح'} Mbps`
                                : 'مفتوح'}
                              {d.limitDownMbps > 0 || d.limitUpMbps > 0
                                ? ' (مخصص)'
                                : assignedUser && (assignedUser.speedDownMbps > 0 || assignedUser.speedUpMbps > 0)
                                ? ' (المستخدم)'
                                : ''}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        {blockReason ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>{blockReason}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>نشط</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onDeviceOp(
                                d.mac,
                                d.blocked || d.paused ? 'unblock' : 'pause'
                              )
                            }
                            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            {d.blocked || d.paused ? 'تشغيل' : 'إيقاف مؤقت'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openLimitEditor(d)}
                            title="تحديد سقف السرعة"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>السرعة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeviceOp(d.mac, 'kick')}
                            title="طرد وفصل Wi-Fi فوراً"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                          >
                            <WifiOff className="w-3 h-3" />
                            <span>طرد</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
