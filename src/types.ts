export type QuotaAllocationMode = 'fixed' | 'equal';

export type RouterOperationMode = 'router' | 'ap';

export type OpenWrtRelease = '25.12' | '24.10';

export interface UserProfile {
  id: string;
  name: string;
  allocationMode: QuotaAllocationMode;
  fixedGb: number;
  dailyCapGb: number;
  usedGb: number;
  dailyUsedGb: number;
  dailyHistoryGb?: number[];
  speedDownMbps: number;
  speedUpMbps: number;
}

export interface NetworkDevice {
  mac: string;
  ip: string;
  hostname: string;
  vendor: string;
  connectionType: 'Wi-Fi 5G' | 'Wi-Fi 2.4G' | 'LAN';
  userId: string | null;
  usedGb: number;
  dailyUsedGb: number;
  liveDownMbps: number;
  liveUpMbps: number;
  limitDownMbps: number;
  limitUpMbps: number;
  paused: boolean;
  blocked: boolean;
  online: boolean;
  lastSeen: string;
}

export type DnsPresetId =
  | 'isp'
  | 'cloudflare'
  | 'cloudflare_family'
  | 'adguard'
  | 'google'
  | 'quad9'
  | 'custom';

export interface DnsLocalRecord {
  host: string;
  ip: string;
}

export interface DnsFilterConfig {
  preset: DnsPresetId;
  primaryDns: string;
  secondaryDns: string;
  forceDnsRedirect: boolean;
  cacheSize: number;
  adblock: boolean;
  adultblock: boolean;
  gambleblock: boolean;
  customDomains: string[];
  localRecords: DnsLocalRecord[];
}

export interface BundleSettings {
  bundleGb: number;
  renewDay: number;
  blockNewDevices: boolean;
  enableQos: boolean;
  gamingPriority: boolean;
  operationMode: RouterOperationMode;
  dashboardPort: number;
  adminPassword: string;
}

export interface OpenWrtBuildConfig {
  openwrtRelease: OpenWrtRelease;
  operationMode: RouterOperationMode;
  dashboardPort: number;
  bundleGb: number;
  renewDay: number;
  initialPassword: string;
  enableQos: boolean;
  enableDnsFilter: boolean;
  blockNewDevices: boolean;
}

export interface GeneratedOpenWrtFile {
  path: string;
  description: string;
  sizeBytes: number;
  content: string;
}

export type ActivityLogEventType =
  | 'connect'
  | 'disconnect'
  | 'new_device'
  | 'blocked'
  | 'unblocked';

export interface ActivityLogEntry {
  id: string;
  timestampMs: number;
  event: ActivityLogEventType;
  mac: string;
  ip: string;
  hostname: string;
  vendor: string;
  connectionType: 'Wi-Fi 5G' | 'Wi-Fi 2.4G' | 'LAN';
  userId: string | null;
  isUnknown: boolean;
  note: string;
}

export interface TrafficSample {
  timeLabel: string;
  downMbps: number;
  upMbps: number;
}


