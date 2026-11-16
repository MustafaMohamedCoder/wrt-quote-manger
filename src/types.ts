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

export interface DnsFilterConfig {
  adblock: boolean;
  adultblock: boolean;
  gambleblock: boolean;
  customDomains: string[];
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

