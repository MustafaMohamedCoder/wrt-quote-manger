import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { OpenWrtBuildConfig } from '../types';

interface InstallGuideViewProps {
  buildConfig: OpenWrtBuildConfig;
  onDownloadInstaller: () => void;
}

export const InstallGuideView: React.FC<InstallGuideViewProps> = ({
  buildConfig,
  onDownloadInstaller,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCmd(key);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const scpCmd = `scp install_halo_g920.sh root@192.168.1.1:/tmp/`;
  const runCmd = `ssh root@192.168.1.1 "chmod +x /tmp/install_halo_g920.sh && sh /tmp/install_halo_g920.sh"`;
  const checkCmd = `logread -e quotamgr && free -m && df -h /overlay`;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              دليل التثبيت والتوصيل الصحيح على Halo G920
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              اتبع الخطوات التالية بالترتيب لضمان أعلى أداء بدون امتلاء الذاكرة أو تقطيع الشبكة.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadInstaller}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل install_halo_g920.sh</span>
          </button>
        </div>

        {/* Step 1: Hardware Wiring */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            01. توصيل الكابلات وتجهيز راوتر الإنترنت الأساسي
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            لأفضل دقة في حساب الجيجابايت وتحديد السرعة على معالج{' '}
            <span className="font-mono">MT7621AT</span>، يُنصح بتشغيل{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Halo G920
            </span>{' '}
            في وضع الراوتر القياسي:
          </p>
          <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-300 space-y-1.5 pr-2">
            <li>
              وصّل كابل الشبكة القادم من راوتر شركة الإنترنت (LAN) إلى منفذ{' '}
              <span className="font-semibold">WAN الأزرق</span> في جهاز Halo G920.
            </li>
            <li>
              اترك شبكة الواي فاي على Halo G920 مفعلة لتتصل بها جميع أجهزة المنزل (أو أغلق الواي فاي في راوتر الشركة الأصلي حتى تمر كل الأجهزة عبر Halo G920).
            </li>
            <li>
              إذا كنت مضطراً لاستخدامه كـ <span className="font-semibold">Access Point (Bridge)</span> فقط، اختر وضع Bridge AP من تبويب «توليد الحزمة» قبل التنزيل ليتم تفعيل{' '}
              <span className="font-mono">kmod-nft-bridge</span>.
            </li>
          </ul>
        </div>

        {/* Step 2: Clean old heavy Python version */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            02. إزالة بقايا النسخة الثقيلة السابقة (إذا كنت قد ثبتّها)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            قبل تثبيت النسخة الخفيفة، تأكد من إيقاف خدمة بايثون القديمة وتحرير مساحة الـ Flash:
          </p>
          <div className="flex items-center justify-between gap-2 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg px-4 py-2.5 font-mono text-xs" dir="ltr">
            <span className="overflow-x-auto">
              /etc/init.d/quota-gateway stop 2&gt;/dev/null; /etc/init.d/quota-gateway disable 2&gt;/dev/null; rm -rf /opt/quota*
            </span>
            <button
              type="button"
              onClick={() =>
                copyText(
                  'clean',
                  '/etc/init.d/quota-gateway stop 2>/dev/null; /etc/init.d/quota-gateway disable 2>/dev/null; rm -rf /opt/quota*'
                )
              }
              className="text-slate-300 hover:text-white shrink-0"
              title="نسخ الأمر"
            >
              {copiedCmd === 'clean' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Step 3: Upload & Run */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            03. رفع ملف التثبيت وتشغيله عبر SSH
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            انقل ملف <span className="font-mono">install_halo_g920.sh</span> إلى مجلد{' '}
            <span className="font-mono">/tmp/</span> على الراوتر ثم شغّله:
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg px-4 py-2.5 font-mono text-xs" dir="ltr">
              <span>{scpCmd}</span>
              <button
                type="button"
                onClick={() => copyText('scp', scpCmd)}
                className="text-slate-300 hover:text-white shrink-0"
              >
                {copiedCmd === 'scp' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg px-4 py-2.5 font-mono text-xs" dir="ltr">
              <span>{runCmd}</span>
              <button
                type="button"
                onClick={() => copyText('run', runCmd)}
                className="text-slate-300 hover:text-white shrink-0"
              >
                {copiedCmd === 'run' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Step 4: Access Dashboard & Verify */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            04. فتح لوحة التحكم والتحقق من الأداء
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            بعد انتهاء السكربت خلال ثوانٍ، ستبقى واجهة OpenWrt الأساسية (LuCI) على منفذ{' '}
            <span className="font-mono">80</span> كما هي، وتعمل لوحة QuotaManager المستقلة على الرابط:
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100" dir="ltr">
            http://192.168.1.1:{buildConfig.dashboardPort}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
            للتحقق من استهلاك الرام والمساحة وسجل الخدمة في أي وقت:
          </p>
          <div className="flex items-center justify-between gap-2 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg px-4 py-2.5 font-mono text-xs" dir="ltr">
            <span>{checkCmd}</span>
            <button
              type="button"
              onClick={() => copyText('chk', checkCmd)}
              className="text-slate-300 hover:text-white shrink-0"
            >
              {copiedCmd === 'chk' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
