import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Download, Moon, Sun } from 'lucide-react';
import {
  INITIAL_ACTIVITY_LOGS,
  INITIAL_DEVICES,
  INITIAL_DNS_FILTER,
  INITIAL_SETTINGS,
  INITIAL_USERS,
  MAX_ACTIVITY_LOGS,
} from './data/initialSimulation';
import { RouterDashboardView } from './components/RouterDashboardView';
import { computeUserQuotasAndAlerts } from './utils/quotaAlerts';
import type {
  ActivityLogEntry,
  ActivityLogEventType,
  BundleSettings,
  DnsFilterConfig,
  NetworkDevice,
  OpenWrtBuildConfig,
  TrafficSample,
  UserProfile,
} from './types';

const UsersAndFiltersView = lazy(() =>
  import('./components/UsersAndFiltersView').then((m) => ({
    default: m.UsersAndFiltersView,
  }))
);
const DnsSectionView = lazy(() =>
  import('./components/DnsSectionView').then((m) => ({
    default: m.DnsSectionView,
  }))
);
const ActivityLogsView = lazy(() =>
  import('./components/ActivityLogsView').then((m) => ({
    default: m.ActivityLogsView,
  }))
);
const OpenWrtBuilderView = lazy(() =>
  import('./components/OpenWrtBuilderView').then((m) => ({
    default: m.OpenWrtBuilderView,
  }))
);
const InstallGuideView = lazy(() =>
  import('./components/InstallGuideView').then((m) => ({
    default: m.InstallGuideView,
  }))
);

type ActiveTab = 'dashboard' | 'users' | 'dns' | 'logs' | 'builder' | 'guide';

const MAX_TRAFFIC_SAMPLES = 30;

function formatTrafficClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function computeAggregateTraffic(
  bundleGb: number,
  blockNewDevices: boolean,
  users: UserProfile[],
  devices: NetworkDevice[]
): { downMbps: number; upMbps: number; activeDevices: number } {
  const { quotaMap } = computeUserQuotasAndAlerts(bundleGb, users, devices);
  let down = 0;
  let up = 0;
  let activeDevices = 0;
  for (const d of devices) {
    if (!d.online || d.blocked || d.paused) continue;
    if (!d.userId || !quotaMap.has(d.userId)) {
      if (blockNewDevices) continue;
    } else if (quotaMap.get(d.userId)!.isExhausted) {
      continue;
    }
    down += d.liveDownMbps;
    up += d.liveUpMbps;
    activeDevices += 1;
  }
  return {
    downMbps: Number(down.toFixed(2)),
    upMbps: Number(up.toFixed(2)),
    activeDevices,
  };
}

function createInitialTrafficHistory(): TrafficSample[] {
  const base = computeAggregateTraffic(
    INITIAL_SETTINGS.bundleGb,
    INITIAL_SETTINGS.blockNewDevices,
    INITIAL_USERS,
    INITIAL_DEVICES
  );
  const now = Date.now();
  const multipliers = [
    0.72, 0.85, 0.78, 0.94, 1.08, 0.92, 0.88, 1.05, 1.15, 0.96, 0.84, 0.91,
    1.03, 0.95, 1.0,
  ];
  return multipliers.map((m, idx) => ({
    timeLabel: formatTrafficClock(now - (multipliers.length - 1 - idx) * 1000),
    downMbps: Number((base.downMbps * m).toFixed(2)),
    upMbps: Number((base.upMbps * m).toFixed(2)),
    activeDevices: base.activeDevices,
  }));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [settings, setSettings] = useState<BundleSettings>(INITIAL_SETTINGS);
  const [dnsFilter, setDnsFilter] = useState<DnsFilterConfig>(INITIAL_DNS_FILTER);
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [devices, setDevices] = useState<NetworkDevice[]>(INITIAL_DEVICES);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>(
    INITIAL_ACTIVITY_LOGS
  );
  const [trafficHistory, setTrafficHistory] = useState<TrafficSample[]>(
    createInitialTrafficHistory
  );
  const isFirstTrafficEffect = useRef(true);
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('qm_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('qm_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [darkMode]);

  const [buildConfig, setBuildConfig] = useState<OpenWrtBuildConfig>({
    openwrtRelease: '25.12.6',
    operationMode: INITIAL_SETTINGS.operationMode,
    dashboardPort: INITIAL_SETTINGS.dashboardPort,
    bundleGb: INITIAL_SETTINGS.bundleGb,
    renewDay: INITIAL_SETTINGS.renewDay,
    initialPassword: INITIAL_SETTINGS.adminPassword,
    enableQos: INITIAL_SETTINGS.enableQos,
    enableDnsFilter: true,
    blockNewDevices: INITIAL_SETTINGS.blockNewDevices,
  });

  // Live traffic simulation loop so the user can test auto-cutoff & equal split
  useEffect(() => {
    if (!simRunning) return;
    const timer = window.setInterval(() => {
      setDevices((prevDevices) => {
        // Compute current user quotas
        const fixedSum = users
          .filter((u) => u.allocationMode === 'fixed')
          .reduce((acc, u) => acc + u.fixedGb, 0);
        const eqUsers = users.filter((u) => u.allocationMode === 'equal');
        const eqShare =
          eqUsers.length > 0
            ? Math.max(0, settings.bundleGb - fixedSum) / eqUsers.length
            : 0;

        const userTotals = new Map<string, { used: number; daily: number }>();
        for (const u of users) userTotals.set(u.id, { used: 0, daily: 0 });
        for (const d of prevDevices) {
          if (d.userId && userTotals.has(d.userId)) {
            const cur = userTotals.get(d.userId)!;
            cur.used += d.usedGb;
            cur.daily += d.dailyUsedGb;
          }
        }

        return prevDevices.map((d) => {
          if (!d.online || d.blocked || d.paused) {
            return { ...d, liveDownMbps: 0, liveUpMbps: 0 };
          }
          const u = d.userId ? users.find((usr) => usr.id === d.userId) : undefined;
          if (!u) {
            if (settings.blockNewDevices) {
              return { ...d, liveDownMbps: 0, liveUpMbps: 0 };
            }
          } else {
            const tot = userTotals.get(u.id)!;
            const quota = u.allocationMode === 'fixed' ? u.fixedGb : eqShare;
            const overMonthly = tot.used >= quota;
            const overDaily = u.dailyCapGb > 0 && tot.daily >= u.dailyCapGb;
            if (overMonthly || overDaily) {
              return { ...d, liveDownMbps: 0, liveUpMbps: 0 };
            }
          }

          const capDown =
            d.limitDownMbps > 0 ? d.limitDownMbps : u?.speedDownMbps || 25;
          const capUp =
            d.limitUpMbps > 0 ? d.limitUpMbps : u?.speedUpMbps || 0;
          const down = Math.min(capDown, Math.max(0.5, Number((Math.random() * capDown * 0.65).toFixed(2))));
          const rawUp = Number((down * 0.22).toFixed(2));
          const up = capUp > 0 ? Math.min(capUp, rawUp) : rawUp;
          // Accelerated simulation step (~0.08 GB per tick) for visible testing
          const addedGb = Number(((down / 100) * 0.35).toFixed(3));
          return {
            ...d,
            liveDownMbps: down,
            liveUpMbps: up,
            usedGb: Number((d.usedGb + addedGb).toFixed(3)),
            dailyUsedGb: Number((d.dailyUsedGb + addedGb).toFixed(3)),
          };
        });
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [simRunning, users, settings.bundleGb, settings.blockNewDevices]);

  // Append aggregate traffic point whenever devices/quota state changes
  useEffect(() => {
    if (isFirstTrafficEffect.current) {
      isFirstTrafficEffect.current = false;
      return;
    }
    const { downMbps, upMbps, activeDevices } = computeAggregateTraffic(
      settings.bundleGb,
      settings.blockNewDevices,
      users,
      devices
    );
    setTrafficHistory((prev) =>
      [
        ...prev,
        {
          timeLabel: formatTrafficClock(Date.now()),
          downMbps,
          upMbps,
          activeDevices,
        },
      ].slice(-MAX_TRAFFIC_SAMPLES)
    );
  }, [devices, users, settings.bundleGb, settings.blockNewDevices]);

  const appendActivityLog = useCallback(
    (
      event: ActivityLogEventType,
      dev: Pick<
        NetworkDevice,
        'mac' | 'ip' | 'hostname' | 'vendor' | 'connectionType' | 'userId'
      >,
      note: string
    ) => {
      const entry: ActivityLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestampMs: Date.now(),
        event,
        mac: dev.mac,
        ip: dev.ip,
        hostname: dev.hostname,
        vendor: dev.vendor,
        connectionType: dev.connectionType,
        userId: dev.userId,
        isUnknown: !dev.userId,
        note,
      };
      setActivityLogs((prev) => [entry, ...prev].slice(0, MAX_ACTIVITY_LOGS));
    },
    []
  );

  const handleAssignUser = useCallback(
    (mac: string, userId: string | null) => {
      setDevices((prev) => {
        const target = prev.find((d) => d.mac === mac);
        if (target && target.userId !== userId && userId) {
          const usr = users.find((u) => u.id === userId);
          appendActivityLog(
            'connect',
            { ...target, userId },
            `تم ربط الجهاز بالمستخدم ${usr?.name || ''}`
          );
        }
        return prev.map((d) => (d.mac === mac ? { ...d, userId } : d));
      });
    },
    [users, appendActivityLog]
  );

  const handleDeviceOp = useCallback(
    (mac: string, op: 'pause' | 'unpause' | 'block' | 'unblock' | 'kick') => {
      setDevices((prev) => {
        const target = prev.find((d) => d.mac === mac);
        if (target) {
          if (op === 'kick') {
            appendActivityLog('disconnect', target, 'طرد وفصل فوري عبر Wi-Fi / LAN');
          } else if (op === 'block') {
            appendActivityLog('blocked', target, 'حظر دائم من لوحة التحكم');
          } else if (op === 'pause') {
            appendActivityLog('disconnect', target, 'إيقاف مؤقت للاتصال');
          } else if (op === 'unblock' || op === 'unpause') {
            appendActivityLog('unblocked', target, 'إعادة السماح بالاتصال');
          }
        }
        return prev.map((d) => {
          if (d.mac !== mac) return d;
          if (op === 'pause') return { ...d, paused: true, liveDownMbps: 0, liveUpMbps: 0 };
          if (op === 'unpause') return { ...d, paused: false };
          if (op === 'block') return { ...d, blocked: true, liveDownMbps: 0, liveUpMbps: 0 };
          if (op === 'unblock') return { ...d, blocked: false, paused: false };
          if (op === 'kick') return { ...d, paused: true, liveDownMbps: 0, liveUpMbps: 0 };
          return d;
        });
      });
    },
    [appendActivityLog]
  );

  const handleSetDeviceLimit = useCallback(
    (mac: string, downMbps: number, upMbps: number) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.mac !== mac) return d;
          const nextDown = downMbps > 0 ? Math.min(d.liveDownMbps, downMbps) : d.liveDownMbps;
          const nextUp = upMbps > 0 ? Math.min(d.liveUpMbps, upMbps) : d.liveUpMbps;
          return {
            ...d,
            limitDownMbps: downMbps,
            limitUpMbps: upMbps,
            liveDownMbps: nextDown,
            liveUpMbps: nextUp,
          };
        })
      );
    },
    []
  );

  const handleAddTestDevice = useCallback(() => {
    const rnd = Math.floor(10 + Math.random() * 89);
    const hex = rnd.toString(16).padStart(2, '0');
    const newMac = `e4:5f:01:2a:${hex}:9b`;
    const newDev: NetworkDevice = {
      mac: newMac,
      ip: `192.168.1.${160 + (rnd % 80)}`,
      hostname: `New-Phone-${rnd}`,
      vendor: 'Unknown',
      connectionType: 'Wi-Fi 5G',
      userId: null,
      usedGb: 0,
      dailyUsedGb: 0,
      liveDownMbps: settings.blockNewDevices ? 0 : 1.5,
      liveUpMbps: settings.blockNewDevices ? 0 : 0.3,
      limitDownMbps: 0,
      limitUpMbps: 0,
      paused: false,
      blocked: false,
      online: true,
      lastSeen: 'الآن',
    };
    setDevices((prev) => [newDev, ...prev]);
    appendActivityLog(
      'new_device',
      newDev,
      settings.blockNewDevices
        ? 'جهاز غريب متصل (محظور تلقائياً 0 GB حتى التعيين)'
        : 'اتصال جهاز جديد بالشبكة'
    );
  }, [settings.blockNewDevices, appendActivityLog]);

  const handleSimulateToggleConnection = useCallback(() => {
    setDevices((prev) => {
      if (prev.length === 0) return prev;
      const offlineDev = prev.find((d) => !d.online);
      const target =
        offlineDev ||
        prev.find((d) => d.userId !== null && d.online) ||
        prev[0];
      const nextOnline = !target.online;
      appendActivityLog(
        nextOnline ? 'connect' : 'disconnect',
        target,
        nextOnline
          ? `عودة الاتصال عبر ${target.connectionType}`
          : 'فصل من نقطة الوصول (انتهاء مهلة النشاط)'
      );
      return prev.map((d) =>
        d.mac === target.mac
          ? {
              ...d,
              online: nextOnline,
              liveDownMbps: nextOnline ? d.liveDownMbps : 0,
              liveUpMbps: nextOnline ? d.liveUpMbps : 0,
              lastSeen: nextOnline ? 'الآن' : 'منذ لحظات',
            }
          : d
      );
    });
  }, [appendActivityLog]);

  const handleClearLogs = useCallback(() => {
    setActivityLogs([]);
  }, []);

  const handleResetCycle = () => {
    setDevices((prev) =>
      prev.map((d) => ({ ...d, usedGb: 0, dailyUsedGb: 0 }))
    );
    setUsers((prev) =>
      prev.map((u) => ({
        ...u,
        usedGb: 0,
        dailyUsedGb: 0,
        dailyHistoryGb: [0, 0, 0, 0, 0, 0],
      }))
    );
  };

  const handleSaveUser = (draft: Omit<UserProfile, 'usedGb' | 'dailyUsedGb'>) => {
    setUsers((prev) => [
      ...prev,
      { ...draft, usedGb: 0, dailyUsedGb: 0 },
    ]);
  };

  const handleDeleteUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setDevices((prev) =>
      prev.map((d) => (d.userId === id ? { ...d, userId: null } : d))
    );
  };

  const handleUpdateSettings = (next: Partial<BundleSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      setBuildConfig((b) => ({
        ...b,
        bundleGb: merged.bundleGb,
        renewDay: merged.renewDay,
        blockNewDevices: merged.blockNewDevices,
        enableQos: merged.enableQos,
        operationMode: merged.operationMode,
        dashboardPort: merged.dashboardPort,
        initialPassword: merged.adminPassword,
      }));
      return merged;
    });
  };

  const handleUpdateBuildConfig = (next: Partial<OpenWrtBuildConfig>) => {
    setBuildConfig((prev) => {
      const merged = { ...prev, ...next };
      setSettings((s) => ({
        ...s,
        bundleGb: merged.bundleGb,
        renewDay: merged.renewDay,
        blockNewDevices: merged.blockNewDevices,
        enableQos: merged.enableQos,
        operationMode: merged.operationMode,
        dashboardPort: merged.dashboardPort,
        adminPassword: merged.initialPassword,
      }));
      return merged;
    });
  };

  const handleDownloadInstaller = useCallback(async () => {
    const { generateOpenWrtFiles } = await import('./openwrt/bundle');
    const files = generateOpenWrtFiles(buildConfig);
    const installer = files.find((f) => f.path === 'install_openwrt.sh');
    if (!installer) return;
    const blob = new Blob([installer.content], {
      type: 'text/x-shellscript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'install_openwrt.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [buildConfig]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            QuotaManager · OpenWrt
          </a>

          <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
            {(
              [
                { id: 'dashboard', label: 'لوحة الراوتر' },
                { id: 'users', label: 'المستخدمون' },
                { id: 'dns', label: 'قسم DNS' },
                { id: 'logs', label: 'سجلات النشاط' },
                { id: 'builder', label: 'توليد الحزمة' },
                { id: 'guide', label: 'دليل التركيب' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === tab.id
                    ? 'border-sky-600 dark:border-sky-400 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={handleDownloadInstaller}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تنزيل سكربت التثبيت</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Workspace Toolbar: Quick Dark/Light Theme Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span>نظام OpenWrt 25.12.6 فقط</span>
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span>دعم حصري لإصدار 25.12.6 (apk + ucode + fw4/nftables)</span>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-pressed={darkMode}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>الوضع النهاري</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" />
                <span>الوضع الليلي</span>
              </>
            )}
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <RouterDashboardView
            settings={settings}
            users={users}
            devices={devices}
            trafficHistory={trafficHistory}
            simRunning={simRunning}
            darkMode={darkMode}
            onToggleSim={() => setSimRunning((v) => !v)}
            onAssignUser={handleAssignUser}
            onDeviceOp={handleDeviceOp}
            onSetDeviceLimit={handleSetDeviceLimit}
            onAddTestDevice={handleAddTestDevice}
            onResetCycle={handleResetCycle}
          />
        )}

        <Suspense
          fallback={
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-xs text-slate-500 dark:text-slate-400">
              جاري التحميل...
            </div>
          }
        >
          {activeTab === 'users' && (
            <UsersAndFiltersView
              settings={settings}
              users={users}
              devices={devices}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          {activeTab === 'dns' && (
            <DnsSectionView
              dnsFilter={dnsFilter}
              onUpdateDns={(next) =>
                setDnsFilter((prev) => ({ ...prev, ...next }))
              }
            />
          )}

          {activeTab === 'logs' && (
            <ActivityLogsView
              logs={activityLogs}
              users={users}
              devices={devices}
              onClearLogs={handleClearLogs}
              onSimulateNewDevice={handleAddTestDevice}
              onSimulateToggleConnection={handleSimulateToggleConnection}
              onDeviceOp={handleDeviceOp}
              onAssignUser={handleAssignUser}
            />
          )}

          {activeTab === 'builder' && (
            <OpenWrtBuilderView
              buildConfig={buildConfig}
              onChangeConfig={handleUpdateBuildConfig}
              onDownloadInstaller={handleDownloadInstaller}
            />
          )}

          {activeTab === 'guide' && (
            <InstallGuideView
              buildConfig={buildConfig}
              onDownloadInstaller={handleDownloadInstaller}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
