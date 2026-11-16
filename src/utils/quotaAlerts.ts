import type { NetworkDevice, UserProfile } from '../types';

export type AlertSeverity = 'exhausted' | 'critical';

export interface QuotaAlert {
  userId: string;
  userName: string;
  severity: AlertSeverity;
  trigger: 'monthly' | 'daily' | 'both';
  monthlyPct: number;
  dailyPct: number;
  usedGb: number;
  quotaGb: number;
  dailyUsedGb: number;
  dailyCapGb: number;
  message: string;
}

export interface ComputedUserQuota {
  userId: string;
  quotaGb: number;
  usedGb: number;
  dailyUsedGb: number;
  monthlyPct: number;
  dailyPct: number;
  isMonthlyCritical: boolean;
  isDailyCritical: boolean;
  isExhausted: boolean;
  isCriticalOrExhausted: boolean;
}

export function computeUserQuotasAndAlerts(
  bundleGb: number,
  users: UserProfile[],
  devices: NetworkDevice[]
): {
  quotaMap: Map<string, ComputedUserQuota>;
  alerts: QuotaAlert[];
} {
  const fixedAlloc = users
    .filter((u) => u.allocationMode === 'fixed')
    .reduce((acc, u) => acc + u.fixedGb, 0);
  const equalUsers = users.filter((u) => u.allocationMode === 'equal');
  const remainingPool = Math.max(0, bundleGb - fixedAlloc);
  const equalShare =
    equalUsers.length > 0 ? remainingPool / equalUsers.length : 0;

  const quotaMap = new Map<string, ComputedUserQuota>();
  const alerts: QuotaAlert[] = [];

  for (const u of users) {
    const userDevices = devices.filter((d) => d.userId === u.id);
    const usedGb = userDevices.reduce((sum, d) => sum + d.usedGb, 0);
    const dailyUsedGb = userDevices.reduce((sum, d) => sum + d.dailyUsedGb, 0);
    const quotaGb = u.allocationMode === 'fixed' ? u.fixedGb : equalShare;

    const monthlyPct =
      quotaGb > 0 ? Math.min(100, (usedGb / quotaGb) * 100) : 100;
    const dailyPct =
      u.dailyCapGb > 0 ? Math.min(100, (dailyUsedGb / u.dailyCapGb) * 100) : 0;

    const monthlyExhausted = quotaGb <= 0 || usedGb >= quotaGb;
    const dailyExhausted = u.dailyCapGb > 0 && dailyUsedGb >= u.dailyCapGb;
    const isExhausted = monthlyExhausted || dailyExhausted;

    const isMonthlyCritical = monthlyPct >= 90;
    const isDailyCritical = u.dailyCapGb > 0 && dailyPct >= 90;
    const isCriticalOrExhausted =
      isExhausted || isMonthlyCritical || isDailyCritical;

    quotaMap.set(u.id, {
      userId: u.id,
      quotaGb,
      usedGb,
      dailyUsedGb,
      monthlyPct,
      dailyPct,
      isMonthlyCritical,
      isDailyCritical,
      isExhausted,
      isCriticalOrExhausted,
    });

    if (isCriticalOrExhausted) {
      const trigger: 'monthly' | 'daily' | 'both' =
        isMonthlyCritical && isDailyCritical
          ? 'both'
          : isDailyCritical
          ? 'daily'
          : 'monthly';

      let message = '';
      if (monthlyExhausted) {
        message = `استنفد كامل حصته الشهرية (${usedGb.toFixed(2)} / ${quotaGb.toFixed(1)} GB) وتم فصل أجهزته`;
      } else if (dailyExhausted) {
        message = `تجاوز السقف اليومي (${dailyUsedGb.toFixed(2)} / ${u.dailyCapGb.toFixed(1)} GB) وتم إيقاف أجهزته مؤقتاً`;
      } else if (trigger === 'both') {
        message = `اقترب من الحد الأقصى للحصة الشهرية (${monthlyPct.toFixed(0)}%) واليومية (${dailyPct.toFixed(0)}%)`;
      } else if (trigger === 'daily') {
        message = `وصل إلى ${dailyPct.toFixed(0)}% من السقف اليومي (${dailyUsedGb.toFixed(2)} / ${u.dailyCapGb.toFixed(1)} GB)`;
      } else {
        message = `وصل إلى ${monthlyPct.toFixed(0)}% من الحصة الشهرية (${usedGb.toFixed(2)} / ${quotaGb.toFixed(1)} GB)`;
      }

      alerts.push({
        userId: u.id,
        userName: u.name,
        severity: isExhausted ? 'exhausted' : 'critical',
        trigger,
        monthlyPct,
        dailyPct,
        usedGb,
        quotaGb,
        dailyUsedGb,
        dailyCapGb: u.dailyCapGb,
        message,
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'exhausted' ? -1 : 1;
    return Math.max(b.monthlyPct, b.dailyPct) - Math.max(a.monthlyPct, a.dailyPct);
  });

  return { quotaMap, alerts };
}
