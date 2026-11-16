import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type {
  BundleSettings,
  DnsFilterConfig,
  NetworkDevice,
  QuotaAllocationMode,
  UserProfile,
} from '../types';

interface UsersAndFiltersViewProps {
  settings: BundleSettings;
  dnsFilter: DnsFilterConfig;
  users: UserProfile[];
  devices: NetworkDevice[];
  onSaveUser: (user: Omit<UserProfile, 'usedGb' | 'dailyUsedGb'>) => void;
  onDeleteUser: (id: string) => void;
  onUpdateSettings: (next: Partial<BundleSettings>) => void;
  onUpdateDns: (next: Partial<DnsFilterConfig>) => void;
}

export const UsersAndFiltersView: React.FC<UsersAndFiltersViewProps> = ({
  settings,
  dnsFilter,
  users,
  devices,
  onSaveUser,
  onDeleteUser,
  onUpdateSettings,
  onUpdateDns,
}) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<QuotaAllocationMode>('equal');
  const [fixedGb, setFixedGb] = useState<number>(25);
  const [dailyCapGb, setDailyCapGb] = useState<number>(0);
  const [speedDown, setSpeedDown] = useState<number>(15);
  const [speedUp, setSpeedUp] = useState<number>(5);
  const [newDomain, setNewDomain] = useState('');
  const [pwDraft, setPwDraft] = useState('');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const { equalShareGb, fixedTotalGb, equalCount } = useMemo(() => {
    const fixedSum = users
      .filter((u) => u.allocationMode === 'fixed')
      .reduce((acc, u) => acc + u.fixedGb, 0);
    const eqCnt = users.filter((u) => u.allocationMode === 'equal').length;
    const pool = Math.max(0, settings.bundleGb - fixedSum);
    return {
      equalShareGb: eqCnt > 0 ? pool / eqCnt : 0,
      fixedTotalGb: fixedSum,
      equalCount: eqCnt,
    };
  }, [users, settings.bundleGb]);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveUser({
      id: `u_${Date.now()}`,
      name: name.trim(),
      allocationMode: mode,
      fixedGb: mode === 'fixed' ? Math.max(0, fixedGb) : 0,
      dailyCapGb: Math.max(0, dailyCapGb),
      speedDownMbps: Math.max(0, speedDown),
      speedUpMbps: Math.max(0, speedUp),
    });
    setName('');
    setSavedMsg('تمت إضافة المستخدم وتحديث قواعد nftables.');
    setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!cleaned || dnsFilter.customDomains.includes(cleaned)) return;
    onUpdateDns({ customDomains: [...dnsFilter.customDomains, cleaned] });
    setNewDomain('');
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwDraft.trim().length < 4) return;
    onUpdateSettings({ adminPassword: pwDraft.trim() });
    setPwDraft('');
    setSavedMsg('تم تحديث كلمة مرور لوحة الراوتر.');
    setTimeout(() => setSavedMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {savedMsg && (
        <div className="border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 rounded-lg px-4 py-2.5 text-xs font-medium">
          {savedMsg}
        </div>
      )}

      {/* Add User Profile */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              إدارة المستخدمين وتقسيم الحصص
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              عند انتهاء حصة أي مستخدم، تُفصل جميع أجهزته المرتبطة به في نفس اللحظة تلقائياً.
            </p>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            الحصص الثابتة: {fixedTotalGb.toFixed(1)} GB · التقسيم المتساوي ({equalCount} مستخدمين):{' '}
            {equalShareGb.toFixed(1)} GB لكل فرد
          </div>
        </div>

        <form
          onSubmit={handleAddUser}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pb-5 border-b border-slate-100 dark:border-slate-800"
        >
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              اسم المستخدم
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: محمد"
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              نظام الحصة
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as QuotaAllocationMode)}
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="equal">تقسيم متساوي للمتبقي</option>
              <option value="fixed">حصة ثابتة (GB)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              {mode === 'fixed' ? 'الحصة الشهرية (GB)' : 'الحصة المتوقعة (GB)'}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              disabled={mode === 'equal'}
              value={mode === 'fixed' ? fixedGb : Number(equalShareGb.toFixed(1))}
              onChange={(e) => setFixedGb(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              سقف يومي GB (0 = بلا حد)
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={dailyCapGb}
              onChange={(e) => setDailyCapGb(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              السرعة تحميل/رفع (Mbps)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={speedDown}
                onChange={(e) => setSpeedDown(Number(e.target.value))}
                className="w-full px-2 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                title="تحميل Mbps"
              />
              <input
                type="number"
                min={0}
                value={speedUp}
                onChange={(e) => setSpeedUp(Number(e.target.value))}
                className="w-full px-2 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                title="رفع Mbps"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>إضافة مستخدم</span>
            </button>
          </div>
        </form>

        {/* Users Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-2.5 px-3">المستخدم</th>
                <th className="py-2.5 px-3">الأجهزة المرتبطة</th>
                <th className="py-2.5 px-3">النوع</th>
                <th className="py-2.5 px-3">الاستهلاك / الحصة</th>
                <th className="py-2.5 px-3">السقف اليومي</th>
                <th className="py-2.5 px-3">السرعة القصوى</th>
                <th className="py-2.5 px-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {users.map((u) => {
                const linkedDevices = devices.filter((d) => d.userId === u.id);
                const usedGb = linkedDevices.reduce((sum, d) => sum + d.usedGb, 0);
                const dailyUsedGb = linkedDevices.reduce(
                  (sum, d) => sum + d.dailyUsedGb,
                  0
                );
                const quota = u.allocationMode === 'fixed' ? u.fixedGb : equalShareGb;
                const pct = quota > 0 ? Math.min(100, (usedGb / quota) * 100) : 100;
                const exhausted = usedGb >= quota;

                return (
                  <tr
                    key={u.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {u.name}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-400">
                      {linkedDevices.length > 0
                        ? linkedDevices.map((d) => d.hostname).join(' · ')
                        : 'لا توجد أجهزة مرتبطة'}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-400">
                      {u.allocationMode === 'fixed' ? 'حصة ثابتة' : 'تقسيم متساوي'}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-xs">
                      <div
                        className={
                          exhausted
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : 'text-slate-900 dark:text-slate-100'
                        }
                      >
                        {usedGb.toFixed(2)} / {quota.toFixed(2)} GB
                      </div>
                      <div className="mt-1 h-1.5 w-32 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={
                            exhausted ? 'h-full bg-red-600' : 'h-full bg-sky-600'
                          }
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                      {u.dailyCapGb > 0
                        ? `${dailyUsedGb.toFixed(2)} / ${u.dailyCapGb} GB`
                        : 'بلا سقف'}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                      {u.speedDownMbps > 0
                        ? `↓${u.speedDownMbps} · ↑${u.speedUpMbps || 'مفتوح'} Mbps`
                        : 'مفتوح'}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => onDeleteUser(u.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-Column Split: DNS Filtering + Bundle & Router Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* DNS Network Filtering */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                الحجب على مستوى الشبكة (dnsmasq في RAM)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                يُحفظ ملف الحظر في <span className="font-mono">/tmp/dnsmasq.d</span> داخل الرام لتفادي استهلاك مساحة الـ Flash.
              </p>
            </div>

            <div className="space-y-2.5 text-sm">
              <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                    حظر الإعلانات والمتتبعات (AdBlock)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    تقليل استهلاك الباقة المخفي من إعلانات الفيديو والتطبيقات
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dnsFilter.adblock}
                  onChange={(e) => onUpdateDns({ adblock: e.target.checked })}
                  className="w-4 h-4 accent-sky-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                    حظر المواقع الإباحية (Adult Filter)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    منع الوصول عبر DNS لجميع الأجهزة المتصلة بالمنزل
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dnsFilter.adultblock}
                  onChange={(e) => onUpdateDns({ adultblock: e.target.checked })}
                  className="w-4 h-4 accent-sky-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                    حظر مواقع المراهنات والقمار (Gambling Filter)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    حجب نطاقات المراهنات الشائعة على مستوى الشبكة
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dnsFilter.gambleblock}
                  onChange={(e) => onUpdateDns({ gambleblock: e.target.checked })}
                  className="w-4 h-4 accent-sky-600"
                />
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <form onSubmit={handleAddDomain} className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="أضف نطاقاً لحظره مثال: example.com"
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>حظر</span>
              </button>
            </form>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono">
              {dnsFilter.customDomains.map((dom) => (
                <span key={dom} className="inline-flex items-center gap-1.5">
                  <span>{dom}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDns({
                        customDomains: dnsFilter.customDomains.filter((d) => d !== dom),
                      })
                    }
                    className="text-red-600 dark:text-red-400 hover:underline font-sans"
                  >
                    حذف
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bundle & QoS & Security Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              إعدادات الباقة والأمان وجودة الألعاب (QoS)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ضبط سعة الباقة الشهرية وتفعيل أولوية الـ Ping للألعاب عبر FQ-CoDel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                إجمالي الباقة (GB)
              </label>
              <input
                type="number"
                min={10}
                value={settings.bundleGb}
                onChange={(e) =>
                  onUpdateSettings({ bundleGb: Math.max(1, Number(e.target.value)) })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                يوم التجديد الشهري
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={settings.renewDay}
                onChange={(e) =>
                  onUpdateSettings({
                    renewDay: Math.min(28, Math.max(1, Number(e.target.value))),
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                  حظر الأجهزة الجديدة تلقائياً (0 GB Safety)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  أي جهاز غريب يتصل بالواي فاي يبدأ محظوراً حتى تعيّنه لمستخدم
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.blockNewDevices}
                onChange={(e) =>
                  onUpdateSettings({ blockNewDevices: e.target.checked })
                }
                className="w-4 h-4 accent-sky-600"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                  تفعيل تحديد السرعة وتثبيت Ping الألعاب (tc + fq_codel)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  يمنع التحميلات الثقيلة من رفع زمن الاستجابة (Ping) أثناء اللعب
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableQos}
                onChange={(e) =>
                  onUpdateSettings({ enableQos: e.target.checked })
                }
                className="w-4 h-4 accent-sky-600"
              />
            </label>
          </div>

          <form
            onSubmit={handlePasswordChange}
            className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2"
          >
            <input
              type="password"
              value={pwDraft}
              onChange={(e) => setPwDraft(e.target.value)}
              placeholder="كلمة مرور جديدة للوحة (4 أحرف على الأقل)"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap"
            >
              تحديث كلمة المرور
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
