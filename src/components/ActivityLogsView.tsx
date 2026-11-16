import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { MAX_ACTIVITY_LOGS } from '../data/initialSimulation';
import type {
  ActivityLogEntry,
  NetworkDevice,
  UserProfile,
} from '../types';

interface ActivityLogsViewProps {
  logs: ActivityLogEntry[];
  users: UserProfile[];
  devices: NetworkDevice[];
  onClearLogs: () => void;
  onSimulateNewDevice: () => void;
  onSimulateToggleConnection: () => void;
  onDeviceOp: (
    mac: string,
    op: 'pause' | 'unpause' | 'block' | 'unblock' | 'kick'
  ) => void;
  onAssignUser: (mac: string, userId: string | null) => void;
}

type LogFilter = 'all' | 'connect' | 'disconnect' | 'unknown';

function formatLogTime(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} · ${hh}:${min}:${ss}`;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = React.memo(({
  logs,
  users,
  devices,
  onClearLogs,
  onSimulateNewDevice,
  onSimulateToggleConnection,
  onDeviceOp,
  onAssignUser,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');

  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const deviceMap = useMemo(() => {
    const map = new Map<string, NetworkDevice>();
    for (const d of devices) map.set(d.mac, d);
    return map;
  }, [devices]);

  const stats = useMemo(() => {
    let connects = 0;
    let disconnects = 0;
    const unknownMacs = new Set<string>();
    for (const entry of logs) {
      if (
        entry.event === 'connect' ||
        entry.event === 'new_device' ||
        entry.event === 'unblocked'
      ) {
        connects++;
      } else {
        disconnects++;
      }
      const liveDev = deviceMap.get(entry.mac);
      const isCurrentlyUnknown = liveDev ? !liveDev.userId : entry.isUnknown;
      if (isCurrentlyUnknown) unknownMacs.add(entry.mac);
    }
    return {
      total: logs.length,
      connects,
      disconnects,
      unknownCount: unknownMacs.size,
    };
  }, [logs, deviceMap]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      const liveDev = deviceMap.get(entry.mac);
      const effectiveUserId = liveDev ? liveDev.userId : entry.userId;
      const isUnknownNow = !effectiveUserId;

      if (
        filter === 'connect' &&
        entry.event !== 'connect' &&
        entry.event !== 'new_device' &&
        entry.event !== 'unblocked'
      ) {
        return false;
      }
      if (
        filter === 'disconnect' &&
        entry.event !== 'disconnect' &&
        entry.event !== 'blocked'
      ) {
        return false;
      }
      if (filter === 'unknown' && !isUnknownNow) {
        return false;
      }
      if (!q) return true;
      const userName = effectiveUserId ? userMap.get(effectiveUserId)?.name || '' : '';
      return (
        entry.hostname.toLowerCase().includes(q) ||
        entry.mac.toLowerCase().includes(q) ||
        entry.ip.toLowerCase().includes(q) ||
        entry.note.toLowerCase().includes(q) ||
        userName.toLowerCase().includes(q)
      );
    });
  }, [logs, filter, search, deviceMap, userMap]);

  const renderEventMeta = (entry: ActivityLogEntry) => {
    switch (entry.event) {
      case 'new_device':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>اتصال جهاز جديد</span>
          </span>
        );
      case 'connect':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span>اتصال بالشبكة</span>
          </span>
        );
      case 'unblocked':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>إعادة تفعيل</span>
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
            <ShieldBan className="w-3.5 h-3.5 shrink-0" />
            <span>حظر / إيقاف</span>
          </span>
        );
      case 'disconnect':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>انفصال عن الراوتر</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Control strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            سجلات النشاط واتصال الأجهزة
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يحتفظ تلقائياً بآخر {MAX_ACTIVITY_LOGS} عملية اتصال وفصل على الراوتر لاكتشاف أي جهاز غريب وحظره فوراً.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSimulateNewDevice}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>محاكاة جهاز غريب</span>
          </button>

          <button
            type="button"
            onClick={onSimulateToggleConnection}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>محاكاة فصل / عودة جهاز</span>
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح السجل</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            السجلات المحفوظة (الحد الأقصى 50)
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {stats.total} / {MAX_ACTIVITY_LOGS}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            يُحذف الأقدم تلقائياً عند تجاوز 50 سجل
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            عمليات الاتصال المسجلة
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {stats.connects}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            اتصال جديد أو تجديد DHCP
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            عمليات الفصل والحظر
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {stats.disconnects}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            انقطاع طبيعي أو فصل من لوحة الراوتر
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            أجهزة غريبة (غير معيّنة)
          </div>
          <div
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              stats.unknownCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {stats.unknownCount}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            أجهزة لم تُربط بمستخدم حتى الآن
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              السجل الزمني للأجهزة
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              ({filteredLogs.length})
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
                  { id: 'connect', label: 'اتصال' },
                  { id: 'disconnect', label: 'فصل وحظر' },
                  { id: 'unknown', label: 'أجهزة غريبة' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
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
                <th className="py-3 px-4">الوقت والتاريخ</th>
                <th className="py-3 px-4">الحدث</th>
                <th className="py-3 px-4">الجهاز والعنوان</th>
                <th className="py-3 px-4">المستخدم / التصنيف</th>
                <th className="py-3 px-4">التفاصيل</th>
                <th className="py-3 px-4">إجراء سريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 px-4 text-center text-slate-500 dark:text-slate-400 text-xs"
                  >
                    لا توجد سجلات نشاط مطابقة لخيارات البحث أو التصفية الحالية.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((entry) => {
                  const liveDev = deviceMap.get(entry.mac);
                  const effectiveUserId = liveDev ? liveDev.userId : entry.userId;
                  const userName = effectiveUserId
                    ? userMap.get(effectiveUserId)?.name
                    : null;
                  const isUnknownNow = !userName;

                  return (
                    <tr
                      key={entry.id}
                      className={
                        isUnknownNow
                          ? 'bg-amber-50/40 dark:bg-amber-950/15 hover:bg-amber-50/70 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3 px-4 align-top font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap" dir="ltr">
                        {formatLogTime(entry.timestampMs)}
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        {renderEventMeta(entry)}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {entry.hostname}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          <span>{entry.mac}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.ip}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{entry.connectionType}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top text-xs">
                        {userName ? (
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {userName}
                          </span>
                        ) : liveDev ? (
                          <select
                            aria-label={`تعيين المستخدم للجهاز ${entry.hostname}`}
                            value=""
                            onChange={(e) =>
                              onAssignUser(entry.mac, e.target.value || null)
                            }
                            className="text-xs border border-amber-300 dark:border-amber-800 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            <option value="">جهاز غريب — اختر مستخدماً</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            جهاز غريب (غادر الشبكة)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-xs text-slate-600 dark:text-slate-400">
                        {entry.note}
                      </td>

                      <td className="py-3 px-4 align-top">
                        {liveDev ? (
                          <div className="flex items-center gap-1.5">
                            {liveDev.blocked ? (
                              <button
                                type="button"
                                onClick={() => onDeviceOp(liveDev.mac, 'unblock')}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                              >
                                فك الحظر
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onDeviceOp(liveDev.mac, 'block')}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                              >
                                حظر دائم
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            غير متصل
                          </span>
                        )}
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
});
