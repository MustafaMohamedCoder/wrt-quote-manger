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

  const scpCmd = `scp -O install_openwrt.sh root@192.168.1.1:/tmp/`;
  const runCmd = `ssh root@192.168.1.1 "chmod +x /tmp/install_openwrt.sh && sh /tmp/install_openwrt.sh"`;
  const checkCmd = `logread -e quotamgr && free -m && df -h /overlay`;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              دليل التثبيت والتوصيل على نظام OpenWrt 25.12.6
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              اتبع الخطوات التالية بالترتيب لتثبيت النظام على راوتر يعمل بإصدار OpenWrt 25.12.6 فقط.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadInstaller}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل سكربت التثبيت</span>
          </button>
        </div>

        {/* Step 1: OpenWrt Topology */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            01. تجهيز راوتر OpenWrt وتوصيل الشبكة
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            لأفضل دقة في حساب GB وتحديد السرعة، يُنصح بتشغيل راوتر OpenWrt في وضع Router / Gateway القياسي:
          </p>
          <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-300 space-y-1.5 pr-2">
            <li>
              وصّل كابل الإنترنت الرئيسي إلى منفذ WAN في الراوتر.
            </li>
            <li>
              اجعل جميع أجهزة المنزل تتصل بشبكة Wi-Fi أو منافذ LAN للراوتر حتى يمر كامل الاتصال عبر fw4 (nftables).
            </li>
            <li>
              إذا كان الراوتر مضبوطاً في وضع Bridge AP فقط، اختر Bridge AP من تبويب «توليد الحزمة» قبل التنزيل ليتم تثبيت kmod-nft-bridge تلقائياً.
            </li>
          </ul>
        </div>

        {/* Step 2: Clean old heavy Python version */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            02. إزالة بقايا النسخة الثقيلة السابقة (إذا كنت قد ثبتّها)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            قبل تثبيت النسخة الخفيفة، تأكد من إيقاف الخدمة القديمة وتحرير مساحة Flash:
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
            انقل ملف التثبيت إلى مجلد /tmp على راوتر OpenWrt ثم شغّله:
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
            بعد انتهاء السكربت خلال ثوانٍ، ستبقى واجهة LuCI الأساسية على Port 80 كما هي، وتعمل لوحة إدارة الحصص المستقلة على الرابط:
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100" dir="ltr">
            http://192.168.1.1:{buildConfig.dashboardPort}
          </div>
          {buildConfig.initialPassword.trim() ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              بيانات الدخول الافتراضية: اسم المستخدم{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {buildConfig.initialUsername.trim() || 'مصطفي'}
              </span>{' '}
              وكلمة المرور{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {buildConfig.initialPassword.trim()}
              </span>
              .
            </p>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              الدخول المباشر مفعل بدون كلمة مرور من شبكة LAN المحلية.
            </p>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
            للتحقق من استهلاك RAM ومساحة Flash وسجل الخدمة في أي وقت:
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
