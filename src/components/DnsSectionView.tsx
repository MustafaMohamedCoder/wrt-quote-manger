import React, { useMemo, useState } from 'react';
import { Check, Copy, Globe, Plus, Shield, Trash2 } from 'lucide-react';
import type { DnsFilterConfig, DnsPresetId } from '../types';

interface DnsSectionViewProps {
  dnsFilter: DnsFilterConfig;
  onUpdateDns: (next: Partial<DnsFilterConfig>) => void;
}

interface DnsPresetOption {
  id: DnsPresetId;
  name: string;
  subtitle: string;
  primary: string;
  secondary: string;
}

const DNS_PRESETS: DnsPresetOption[] = [
  {
    id: 'cloudflare_family',
    name: 'Cloudflare Family',
    subtitle: 'سريع + حظر البرمجيات الخبيثة والمحتوى الإباحي',
    primary: '1.1.1.3',
    secondary: '1.0.0.3',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    subtitle: 'الأسرع استجابة للتصفح والألعاب',
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
  },
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    subtitle: 'حظر الإعلانات والمتتبعات تلقائياً من المصدر',
    primary: '94.140.14.14',
    secondary: '94.140.15.15',
  },
  {
    id: 'quad9',
    name: 'Quad9 Security',
    subtitle: 'حماية من مواقع التصيد والروابط الضارة',
    primary: '9.9.9.9',
    secondary: '149.112.112.112',
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    subtitle: 'استقرار عالٍ وتغطية عالمية',
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
  },
  {
    id: 'isp',
    name: 'DNS مزود الخدمة (ISP)',
    subtitle: 'استخدام خوادم الشركة المزودة تلقائياً',
    primary: '',
    secondary: '',
  },
  {
    id: 'custom',
    name: 'خادم مخصص (Custom)',
    subtitle: 'إدخال عناوين IPv4 يدوياً',
    primary: '',
    secondary: '',
  },
];

export const DnsSectionView: React.FC<DnsSectionViewProps> = React.memo(({
  dnsFilter,
  onUpdateDns,
}) => {
  const [newDomain, setNewDomain] = useState('');
  const [localHost, setLocalHost] = useState('');
  const [localIp, setLocalIp] = useState('192.168.1.');
  const [copiedConf, setCopiedConf] = useState(false);

  const activePreset = useMemo(
    () => DNS_PRESETS.find((p) => p.id === dnsFilter.preset) || DNS_PRESETS[0],
    [dnsFilter.preset]
  );

  const blockedCategoriesCount = useMemo(() => {
    let count = dnsFilter.customDomains.length;
    if (dnsFilter.adblock) count += 7;
    if (dnsFilter.adultblock) count += 5;
    if (dnsFilter.gambleblock) count += 5;
    return count;
  }, [dnsFilter]);

  const dnsmasqPreview = useMemo(() => {
    const lines: string[] = [
      '# /tmp/dnsmasq.d/quotamgr-block.conf (RAM only)',
      `cache-size=${dnsFilter.cacheSize}`,
    ];
    if (dnsFilter.preset !== 'isp' && dnsFilter.primaryDns.trim()) {
      lines.push('no-resolv');
      lines.push(`server=${dnsFilter.primaryDns.trim()}`);
      if (dnsFilter.secondaryDns.trim()) {
        lines.push(`server=${dnsFilter.secondaryDns.trim()}`);
      }
    }
    for (const rec of dnsFilter.localRecords) {
      lines.push(`address=/${rec.host}/${rec.ip}`);
    }
    if (dnsFilter.adblock) {
      lines.push('local=/doubleclick.net/');
      lines.push('local=/googlesyndication.com/');
      lines.push('local=/adservice.google.com/');
    }
    if (dnsFilter.adultblock) {
      lines.push('local=/pornhub.com/');
      lines.push('local=/xvideos.com/');
    }
    if (dnsFilter.gambleblock) {
      lines.push('local=/1xbet.com/');
      lines.push('local=/bet365.com/');
    }
    for (const dom of dnsFilter.customDomains) {
      lines.push(`local=/${dom}/`);
    }
    return lines.join('\n');
  }, [dnsFilter]);

  const handleSelectPreset = (preset: DnsPresetOption) => {
    if (preset.id === 'custom') {
      onUpdateDns({ preset: 'custom' });
      return;
    }
    onUpdateDns({
      preset: preset.id,
      primaryDns: preset.primary,
      secondaryDns: preset.secondary,
    });
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!cleaned || dnsFilter.customDomains.includes(cleaned)) return;
    onUpdateDns({ customDomains: [...dnsFilter.customDomains, cleaned] });
    setNewDomain('');
  };

  const handleAddLocalRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const h = localHost.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const ip = localIp.trim();
    const ipOk = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    if (!h || !ipOk) return;
    if (dnsFilter.localRecords.some((r) => r.host === h)) return;
    onUpdateDns({
      localRecords: [...dnsFilter.localRecords, { host: h, ip }],
    });
    setLocalHost('');
  };

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(dnsmasqPreview);
      setCopiedConf(true);
      setTimeout(() => setCopiedConf(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              إدارة خوادم وحماية DNS (dnsmasq + fw4)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              توجيه جميع طلبات النطاقات عبر dnsmasq في الرام لتحسين الاستجابة وحظر الإعلانات والمواقع غير المرغوبة دون كتابة متكررة على الـ Flash.
            </p>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            <span>
              {dnsFilter.preset === 'isp'
                ? 'ISP Auto'
                : dnsFilter.primaryDns || 'لم يحدد'}
            </span>
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span>Cache {dnsFilter.cacheSize}</span>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            مزود DNS النشط
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
            {activePreset.name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {dnsFilter.preset === 'isp'
              ? 'تلقائي من WAN'
              : `${dnsFilter.primaryDns || '-'} · ${dnsFilter.secondaryDns || '-'}`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            إجبار DNS عبر منفذ 53
          </div>
          <div
            className={`mt-1 text-base font-semibold ${
              dnsFilter.forceDnsRedirect
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {dnsFilter.forceDnsRedirect ? 'مفعّل (Force Redirect)' : 'معطّل'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            يمنع الأجهزة من تجاوز حظر الراوتر بـ 8.8.8.8
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ذاكرة التخزين المؤقت (RAM Cache)
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {dnsFilter.cacheSize} سجل
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            تسريع فتح المواقع المتكررة في MT7621
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            النطاقات والقوائم المحجوبة
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {blockedCategoriesCount} نطاق
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {dnsFilter.localRecords.length} سجل محلي على الشبكة
          </div>
        </div>
      </div>

      {/* Upstream DNS Selection + Enforcement */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              اختيار خادم DNS الرئيسي (Upstream DNS)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {DNS_PRESETS.map((preset) => {
              const selected = dnsFilter.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`text-right p-3 rounded-lg border ${
                    selected
                      ? 'border-sky-600 dark:border-sky-500 bg-sky-50/70 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {preset.name}
                    </span>
                    {preset.primary && (
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {preset.primary}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {preset.subtitle}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Primary / Secondary IPv4 inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                DNS الأساسي (Primary)
              </label>
              <input
                type="text"
                dir="ltr"
                disabled={dnsFilter.preset === 'isp'}
                value={dnsFilter.primaryDns}
                onChange={(e) =>
                  onUpdateDns({ preset: 'custom', primaryDns: e.target.value })
                }
                placeholder="1.1.1.1"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                DNS البديل (Secondary)
              </label>
              <input
                type="text"
                dir="ltr"
                disabled={dnsFilter.preset === 'isp'}
                value={dnsFilter.secondaryDns}
                onChange={(e) =>
                  onUpdateDns({ preset: 'custom', secondaryDns: e.target.value })
                }
                placeholder="1.0.0.1"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                حجم الكاش (dnsmasq)
              </label>
              <select
                value={dnsFilter.cacheSize}
                onChange={(e) =>
                  onUpdateDns({ cacheSize: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value={500}>500 (خفيف)</option>
                <option value={1500}>1500 (متوازن)</option>
                <option value={3000}>3000 (أعلى سرعة)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                إجبار جميع الأجهزة على استخدام DNS الراوتر (Force DNS Port 53)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                يعيد توجيه أي استعلام DNS خارجي عبر قاعدة nftables dstnat لضمان عدم تجاوز الفلتر من الهواتف أو التطبيقات
              </div>
            </div>
            <input
              type="checkbox"
              checked={dnsFilter.forceDnsRedirect}
              onChange={(e) =>
                onUpdateDns({ forceDnsRedirect: e.target.checked })
              }
              className="w-4 h-4 accent-sky-600 shrink-0"
            />
          </label>
        </div>

        {/* Content Filtering & Custom Domains */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              فلترة المحتوى وحظر النطاقات
            </h2>
          </div>

          <div className="space-y-2.5">
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

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <form onSubmit={handleAddDomain} className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>حظر نطاق</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono">
              {dnsFilter.customDomains.length === 0 ? (
                <span className="font-sans text-slate-400">
                  لا توجد نطاقات مخصصة مضافة.
                </span>
              ) : (
                dnsFilter.customDomains.map((dom) => (
                  <span key={dom} className="inline-flex items-center gap-1.5">
                    <span>{dom}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDns({
                          customDomains: dnsFilter.customDomains.filter(
                            (d) => d !== dom
                          ),
                        })
                      }
                      className="text-red-600 dark:text-red-400 hover:underline font-sans"
                    >
                      حذف
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Local DNS Records + Live dnsmasq.conf Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              أسماء النطاقات المحلية (Local DNS Records)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              اربط أي اسم نطاق محلي مثل <span className="font-mono">quota.lan</span> بعنوان IP داخلي للوصول السريع بدون حفظ الأرقام.
            </p>
          </div>

          <form onSubmit={handleAddLocalRecord} className="flex flex-wrap gap-2">
            <input
              type="text"
              dir="ltr"
              value={localHost}
              onChange={(e) => setLocalHost(e.target.value)}
              placeholder="nas.lan"
              className="flex-1 min-w-[140px] px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              dir="ltr"
              value={localIp}
              onChange={(e) => setLocalIp(e.target.value)}
              placeholder="192.168.1.50"
              className="w-36 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة سجل</span>
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  <th className="py-2 px-3">اسم النطاق المحلي</th>
                  <th className="py-2 px-3">عنوان IP</th>
                  <th className="py-2 px-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                {dnsFilter.localRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-6 text-center font-sans text-slate-500 dark:text-slate-400"
                    >
                      لا توجد سجلات محلية مضافة.
                    </td>
                  </tr>
                ) : (
                  dnsFilter.localRecords.map((rec) => (
                    <tr key={rec.host}>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                        {rec.host}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {rec.ip}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateDns({
                              localRecords: dnsFilter.localRecords.filter(
                                (r) => r.host !== rec.host
                              ),
                            })
                          }
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                معاينة ملف dnsmasq الفعلي
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                الإعدادات المولّدة تلقائياً لنظام OpenWrt في الذاكرة
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {copiedConf ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ</span>
                </>
              )}
            </button>
          </div>

          <pre
            dir="ltr"
            className="flex-1 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed"
          >
            {dnsmasqPreview}
          </pre>
        </div>
      </div>
    </div>
  );
});
