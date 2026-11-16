import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { generateOpenWrtFiles } from '../openwrt/bundle';
import type { OpenWrtBuildConfig, OpenWrtRelease, RouterOperationMode } from '../types';

interface OpenWrtBuilderViewProps {
  buildConfig: OpenWrtBuildConfig;
  onChangeConfig: (next: Partial<OpenWrtBuildConfig>) => void;
  onDownloadInstaller: () => void;
}

export const OpenWrtBuilderView: React.FC<OpenWrtBuilderViewProps> = ({
  buildConfig,
  onChangeConfig,
  onDownloadInstaller,
}) => {
  const files = useMemo(() => generateOpenWrtFiles(buildConfig), [buildConfig]);
  const [selectedPath, setSelectedPath] = useState<string>(files[0].path);
  const [copied, setCopied] = useState(false);

  const activeFile =
    files.find((f) => f.path === selectedPath) || files[0];

  const totalCoreBytes = files
    .filter((f) => f.path !== 'install_openwrt.sh')
    .reduce((acc, f) => acc + f.sizeBytes, 0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture & Footprint Comparison */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              هندسة الحزمة الأصلية لإصدار OpenWrt 25.12.6 فقط
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              مبني ليعمل حصرياً على إصدار <span className="font-mono">OpenWrt 25.12.6</span> عبر{' '}
              <span className="font-mono">apk</span> و <span className="font-mono">ucode</span> و{' '}
              <span className="font-mono">fw4/nftables</span> ببصمة خفيفة للغاية بدون Python أو SQLite.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadInstaller}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل install_openwrt.sh</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              حجم الملفات على الـ Flash
            </div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              {(totalCoreBytes / 1024).toFixed(1)} KB
            </div>
            <div className="mt-0.5 text-slate-500 dark:text-slate-400">
              بدلاً من ~45 MB في نسخة Python + FastAPI
            </div>
          </div>

          <div>
            <div className="text-slate-500 dark:text-slate-400">
              استهلاك الرام المتوقع
            </div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100">
              &lt; 4 MB RAM
            </div>
            <div className="mt-0.5 text-slate-500 dark:text-slate-400">
              يعمل بـ ucode المدمج أصلاً في OpenWrt و uhttpd
            </div>
          </div>

          <div>
            <div className="text-slate-500 dark:text-slate-400">
              دعم مدير الحزم والجدار الناري
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
              apk + fw4 (nftables)
            </div>
            <div className="mt-0.5 text-slate-500 dark:text-slate-400">
              يعطّل flow_offloading تلقائياً لضمان دقة العدادات
            </div>
          </div>
        </div>
      </div>

      {/* Build Configuration Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          تخصيص حزمة التثبيت قبل التنزيل
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              إصدار OpenWrt المدعوم
            </label>
            <select
              value={buildConfig.openwrtRelease}
              onChange={(e) =>
                onChangeConfig({ openwrtRelease: e.target.value as OpenWrtRelease })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="25.12.6">OpenWrt 25.12.6 فقط (مدير الحزم apk)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              وضع تشغيل OpenWrt
            </label>
            <select
              value={buildConfig.operationMode}
              onChange={(e) =>
                onChangeConfig({
                  operationMode: e.target.value as RouterOperationMode,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="router">وضع الراوتر / البوابة (Router/NAT — الأفضل)</option>
              <option value="ap">وضع الجسر على OpenWrt (Bridge AP — kmod-nft-bridge)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              منفذ لوحة التحكم (Port)
            </label>
            <input
              type="number"
              min={80}
              max={65535}
              value={buildConfig.dashboardPort}
              onChange={(e) =>
                onChangeConfig({ dashboardPort: Number(e.target.value) || 8088 })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              حجم الباقة الافتراضي (GB)
            </label>
            <input
              type="number"
              min={1}
              value={buildConfig.bundleGb}
              onChange={(e) =>
                onChangeConfig({ bundleGb: Number(e.target.value) || 140 })
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
              value={buildConfig.renewDay}
              onChange={(e) =>
                onChangeConfig({
                  renewDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
              كلمة مرور الحماية (اختياري)
            </label>
            <input
              type="password"
              value={buildConfig.initialPassword}
              onChange={(e) =>
                onChangeConfig({ initialPassword: e.target.value })
              }
              placeholder="اتركه فارغاً للدخول المباشر بدون حساب افتراضي"
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2 text-xs text-slate-700 dark:text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={buildConfig.enableQos}
              onChange={(e) => onChangeConfig({ enableQos: e.target.checked })}
              className="w-4 h-4 accent-sky-600"
            />
            <span>تثبيت حزم تحديد السرعة وتثبيت Ping الألعاب (tc-tiny + fq_codel)</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={buildConfig.blockNewDevices}
              onChange={(e) =>
                onChangeConfig({ blockNewDevices: e.target.checked })
              }
              className="w-4 h-4 accent-sky-600"
            />
            <span>حظر الأجهزة الغريبة الجديدة تلقائياً حتى تعيينها</span>
          </label>
        </div>
      </div>

      {/* File Inspector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeFile.path === f.path
                    ? 'bg-slate-900 dark:bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {f.path}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>
        </div>

        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>{activeFile.description}</span>
          <span className="font-mono tabular-nums">
            {(activeFile.sizeBytes / 1024).toFixed(1)} KB
          </span>
        </div>

        <pre
          dir="ltr"
          className="p-4 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto max-h-[460px] leading-relaxed text-left"
        >
          <code>{activeFile.content}</code>
        </pre>
      </div>
    </div>
  );
};
