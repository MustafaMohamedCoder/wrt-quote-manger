#!/bin/sh
# QuotaManager Native OpenWrt 25.12.6 Installer (apk + ucode + fw4/nftables)
# Zero Python · Zero FastAPI · Zero SQLite · < 100 KB Footprint
set -e

echo "================================================="
echo " Installing Native QuotaManager for OpenWrt 25.12.6"
echo "================================================="

# 1. Verify OpenWrt 25.12.6 exclusively (apk + ucode + fw4/nftables)
if [ ! -f /etc/openwrt_release ]; then
  echo "ERROR: This project supports OpenWrt 25.12.6 only (/etc/openwrt_release not found)."
  exit 1
fi
. /etc/openwrt_release
if [ "${DISTRIB_RELEASE:-}" != "25.12.6" ]; then
  echo "ERROR: Unsupported OpenWrt version (${DISTRIB_RELEASE:-unknown}). Only OpenWrt 25.12.6 is supported."
  exit 1
fi
if ! command -v apk >/dev/null 2>&1; then
  echo "ERROR: apk package manager not found. OpenWrt 25.12.6 is required."
  exit 1
fi
if ! command -v ucode >/dev/null 2>&1; then
  echo "ERROR: ucode not found on OpenWrt 25.12.6."
  exit 1
fi
if ! command -v nft >/dev/null 2>&1; then
  echo "ERROR: nftables (fw4) not found on OpenWrt 25.12.6."
  exit 1
fi

# 2. Check Flash Space (/overlay)
FREE_KB=$(df -k /overlay 2>/dev/null | tail -n 1 | awk '{print $4}')
echo "Free /overlay Flash: ${FREE_KB:-unknown} KB"

# 3. Install minimal optional packages using apk (OpenWrt 25.12.6)
echo "Installing optional packages via apk (OpenWrt 25.12.6)"
apk update || true
echo "Skipping QoS packages"


# 4. Disable fw4 Flow Offloading so nftables counters & tc limits see every packet
if uci -q get firewall.@defaults[0].flow_offloading >/dev/null 2>&1; then
  uci set firewall.@defaults[0].flow_offloading='0'
  uci set firewall.@defaults[0].flow_offloading_hw='0'
  uci commit firewall
  /etc/init.d/firewall reload >/dev/null 2>&1 || true
  echo "Disabled fw4 flow_offloading for accurate quota counting."
fi

# 5. Create directories
mkdir -p /etc/quotamgr /tmp/quotamgr /tmp/quotamgr/sessions /tmp/dnsmasq.d /www-quota/cgi-bin

# 6. Enable dnsmasq confdir in RAM (/tmp/dnsmasq.d)
uci set dhcp.@dnsmasq[0].confdir='/tmp/dnsmasq.d' 2>/dev/null || true
uci commit dhcp 2>/dev/null || true

# 7. Write UCI config (/etc/config/quotamgr)
ADMIN_USER='مصطفي'
ADMIN_HASH=$(printf %s '0' | sha256sum | cut -d' ' -f1)
cat << EOF_CFG > /etc/config/quotamgr
config global 'main'
	option enabled '1'
	option port 'undefined'
	option mode 'undefined'
	option bundle_gb 'undefined'
	option renew_day 'undefined'
	option block_new_devices '0'
	option enable_qos '0'
	option gaming_priority '1'
	option adblock '0'
	option adultblock '0'
	option gambleblock '0'
	option dns_preset 'cloudflare_family'
	option dns_primary '1.1.1.3'
	option dns_secondary '1.0.0.3'
	option force_dns '0'
	option dns_cache '1500'
	option lan_if 'br-lan'
	option admin_user '$ADMIN_USER'
	option admin_hash '$ADMIN_HASH'
EOF_CFG

# 8. Write /usr/sbin/quotamgrd
cat << 'EOF_DAEMON' > /usr/sbin/quotamgrd
#!/usr/bin/ucode
'use strict';
import { readfile, writefile, popen, stat } from 'fs';
import { cursor } from 'uci';
const RAM_STATE = '/tmp/quotamgr/state.json';
const FLASH_STATE = '/etc/quotamgr/state.json';
const GB_BYTES = 1073741824;
function shquote(s) {
return "'" + replace(s + '', "'", "'\\''") + "'";
}
function run(cmd) {
return system(cmd);
}
function capture(cmd) {
let p = popen(cmd, 'r');
if (!p) return '';
let out = p.read('all') || '';
p.close();
return out;
}
let last_cfg_mtime = -1;
let cached_cfg = null;
function load_config() {
let st = stat('/etc/config/quotamgr');
let mt = st ? st.mtime : 0;
if (cached_cfg && mt == last_cfg_mtime) return cached_cfg;
last_cfg_mtime = mt;
let c = cursor();
cached_cfg = {
enabled: (c.get('quotamgr', 'main', 'enabled') || '1') == '1',
mode: c.get('quotamgr', 'main', 'mode') || 'router',
bundle_gb: + (c.get('quotamgr', 'main', 'bundle_gb') || 140),
renew_day: + (c.get('quotamgr', 'main', 'renew_day') || 1),
block_new: (c.get('quotamgr', 'main', 'block_new_devices') || '1') == '1',
enable_qos: (c.get('quotamgr', 'main', 'enable_qos') || '1') == '1',
gaming_priority: (c.get('quotamgr', 'main', 'gaming_priority') || '1') == '1',
lan_if: c.get('quotamgr', 'main', 'lan_if') || 'br-lan',
adblock: (c.get('quotamgr', 'main', 'adblock') || '0') == '1',
adultblock: (c.get('quotamgr', 'main', 'adultblock') || '0') == '1',
gambleblock: (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1',
force_dns: (c.get('quotamgr', 'main', 'force_dns') || '0') == '1'
};
return cached_cfg;
}
function default_state() {
let now = localtime();
let ymd = sprintf('%04d-%02d-%02d', now.year, now.mon, now.mday);
let ym = sprintf('%04d-%02d', now.year, now.mon);
return {
last_day: ymd,
last_month: ym,
users: {},
devices: {},
custom_domains: [],
logs: []
};
}
function load_state() {
let raw = readfile(RAM_STATE) || readfile(FLASH_STATE);
if (!raw) return default_state();
let parsed = null;
try { parsed = json(raw); } catch (e) { parsed = null; }
if (!parsed || type(parsed) != 'object') return default_state();
parsed.users = parsed.users || {};
parsed.devices = parsed.devices || {};
parsed.custom_domains = parsed.custom_domains || [];
parsed.logs = parsed.logs || [];
return parsed;
}
function push_log(st, ev, d, note) {
let now = localtime();
let ts = sprintf('%04d-%02d-%02d %02d:%02d:%02d', now.year, now.mon, now.mday, now.hour, now.min, now.sec);
st.logs = st.logs || [];
unshift(st.logs, {
ts: ts,
ev: ev,
mac: d.mac,
ip: d.ip || '',
host: d.hostname || d.mac,
unknown: (!d.user_id),
note: note || ''
});
while (length(st.logs) > 50) pop(st.logs);
}
let last_ram_mtime = 0;
function save_ram_state(st) {
writefile(RAM_STATE, sprintf('%J', st));
let info = stat(RAM_STATE);
if (info) last_ram_mtime = info.mtime;
}
function flush_flash_state(st) {
writefile(FLASH_STATE, sprintf('%J', st));
}
let nft_ready = false;
function nft_batch(lines) {
if (length(lines) == 0) return true;
let p = popen('nft -f - 2>/dev/null', 'w');
if (!p) return false;
p.write(join('\n', lines) + '\n');
return p.close() === 0;
}
function ensure_nft_base(mode) {
if (nft_ready) return;
let check = run('nft list table inet quota_mgr >/dev/null 2>&1');
if (check !== 0) {
nft_batch([
'add table inet quota_mgr',
'add set inet quota_mgr blocked_ips { type ipv4_addr; }',
'add set inet quota_mgr blocked_macs { type ether_addr; }',
'add chain inet quota_mgr forward_hook { type filter hook forward priority -5; policy accept; }',
'add rule inet quota_mgr forward_hook ip saddr @blocked_ips drop',
'add rule inet quota_mgr forward_hook ip daddr @blocked_ips drop',
'add rule inet quota_mgr forward_hook ether saddr @blocked_macs drop'
]);
}
if (mode == 'ap') {
let bcheck = run('nft list table bridge quota_bridge >/dev/null 2>&1');
if (bcheck !== 0) {
nft_batch([
'add table bridge quota_bridge',
'add set bridge quota_bridge blocked_macs { type ether_addr; }',
'add chain bridge quota_bridge forward_hook { type filter hook forward priority -5; policy accept; }',
'add rule bridge quota_bridge forward_hook ether saddr @blocked_macs drop',
'add rule bridge quota_bridge forward_hook ether daddr @blocked_macs drop'
]);
}
}
nft_ready = true;
}
function discover_devices(state, lan_if) {
let now_ts = time();
let seen = {};
let leases = readfile('/tmp/dhcp.leases');
if (leases) {
for (let line in split(leases, '\n')) {
let parts = split(trim(line), /\s+/);
if (length(parts) >= 4) {
let mac = lc(parts[1]);
let ip = parts[2];
let host = (parts[3] && parts[3] != '*') ? parts[3] : ('Device-' + substr(mac, 12));
seen[mac] = { ip: ip, hostname: host };
}
}
}
let neigh = capture('ip -4 neigh show dev ' + shquote(lan_if) + ' 2>/dev/null');
for (let line in split(neigh, '\n')) {
let m = match(line, /^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+lladdr\s+([0-9a-fA-F:]{17})\s+(\S+)/);
if (m) {
let ip = m[1];
let mac = lc(m[2]);
let st = m[3];
if (st == 'FAILED') continue;
if (!seen[mac]) {
seen[mac] = { ip: ip, hostname: 'Device-' + substr(mac, 12) };
} else if (!seen[mac].ip) {
seen[mac].ip = ip;
}
}
}
for (let mac, info in seen) {
if (!state.devices[mac]) {
state.devices[mac] = {
mac: mac,
ip: info.ip,
hostname: info.hostname,
user_id: null,
used_bytes: 0,
daily_used_bytes: 0,
last_up_bytes: 0,
last_down_bytes: 0,
live_down_bps: 0,
live_up_bps: 0,
limit_down_mbps: 0,
limit_up_mbps: 0,
paused: false,
blocked: false,
online: true,
last_seen: now_ts
};
push_log(state, 'connect', state.devices[mac], 'اتصال جهاز جديد');
} else {
let d = state.devices[mac];
let was_offline = !d.online;
d.ip = info.ip;
if (info.hostname && substr(d.hostname, 0, 7) == 'Device-') {
d.hostname = info.hostname;
}
d.online = true;
d.last_seen = now_ts;
if (was_offline) push_log(state, 'connect', d, 'إعادة اتصال بالشبكة');
}
}
for (let mac, d in state.devices) {
if (d.online && !seen[mac] && (now_ts - (d.last_seen || 0) > 120)) {
d.online = false;
d.live_down_bps = 0;
d.live_up_bps = 0;
push_log(state, 'disconnect', d, 'انقطاع الاتصال');
}
}
}
function read_nft_counters(mode) {
let tbl = (mode == 'ap') ? 'bridge quota_bridge' : 'inet quota_mgr';
let raw = capture('nft -j list chain ' + tbl + ' forward_hook 2>/dev/null');
let counts = {};
if (!raw) return counts;
let parsed = null;
try { parsed = json(raw); } catch (e) { return counts; }
if (!parsed || !parsed.nftables) return counts;
for (let item in parsed.nftables) {
let r = item.rule;
if (!r || !r.comment || !r.expr) continue;
let cbytes = null;
for (let ex in r.expr) {
if (ex.counter && ex.counter.bytes != null) {
cbytes = +ex.counter.bytes;
}
}
if (cbytes != null) {
counts[r.comment] = { bytes: cbytes, handle: r.handle };
}
}
return counts;
}
function sync_device_rules(state, mode, counts) {
let tbl = (mode == 'ap') ? 'bridge quota_bridge' : 'inet quota_mgr';
let batch = [];
for (let mac, d in state.devices) {
if (!d.ip && mode != 'ap') continue;
let c_up = 'qm:' + mac + ':up';
let c_dn = 'qm:' + mac + ':dn';
if (!counts[c_up]) {
let expr = (mode == 'ap') ? ('ether saddr ' + mac) : ('ip saddr ' + d.ip);
push(batch, 'add rule ' + tbl + ' forward_hook ' + expr + ' counter comment "' + c_up + '"');
}
if (!counts[c_dn]) {
let expr = (mode == 'ap') ? ('ether daddr ' + mac) : ('ip daddr ' + d.ip);
push(batch, 'add rule ' + tbl + ' forward_hook ' + expr + ' counter comment "' + c_dn + '"');
}
}
if (length(batch) > 0) nft_batch(batch);
}
let last_block_sig = '';
function sync_blocked_sets(cfg, blocked_ips, blocked_macs) {
let sig = cfg.mode + '|' + join(',', blocked_ips) + '|' + join(',', blocked_macs);
if (sig == last_block_sig) return;
last_block_sig = sig;
let batch = [
'flush set inet quota_mgr blocked_ips',
'flush set inet quota_mgr blocked_macs'
];
if (length(blocked_ips) > 0) {
push(batch, 'add element inet quota_mgr blocked_ips { ' + join(', ', blocked_ips) + ' }');
}
if (length(blocked_macs) > 0) {
push(batch, 'add element inet quota_mgr blocked_macs { ' + join(', ', blocked_macs) + ' }');
}
if (cfg.mode == 'ap') {
push(batch, 'flush set bridge quota_bridge blocked_macs');
if (length(blocked_macs) > 0) {
push(batch, 'add element bridge quota_bridge blocked_macs { ' + join(', ', blocked_macs) + ' }');
}
}
nft_batch(batch);
}
function update_usage_and_quotas(state, cfg, counts, elapsed) {
let now = localtime();
let ymd = sprintf('%04d-%02d-%02d', now.year, now.mon, now.mday);
let ym = sprintf('%04d-%02d', now.year, now.mon);
if (state.last_day != ymd) {
for (let mac, d in state.devices) d.daily_used_bytes = 0;
state.last_day = ymd;
}
if (now.mday == cfg.renew_day && state.last_month != ym) {
for (let mac, d in state.devices) {
d.used_bytes = 0;
d.daily_used_bytes = 0;
}
state.last_month = ym;
}
for (let mac, d in state.devices) {
let up_entry = counts['qm:' + mac + ':up'];
let dn_entry = counts['qm:' + mac + ':dn'];
let up_cur = up_entry ? up_entry.bytes : (d.last_up_bytes || 0);
let dn_cur = dn_entry ? dn_entry.bytes : (d.last_down_bytes || 0);
let dup = (up_cur >= (d.last_up_bytes || 0)) ? (up_cur - (d.last_up_bytes || 0)) : up_cur;
let ddn = (dn_cur >= (d.last_down_bytes || 0)) ? (dn_cur - (d.last_down_bytes || 0)) : dn_cur;
d.last_up_bytes = up_cur;
d.last_down_bytes = dn_cur;
d.used_bytes = (d.used_bytes || 0) + dup + ddn;
d.daily_used_bytes = (d.daily_used_bytes || 0) + dup + ddn;
d.live_up_bps = elapsed > 0 ? int((dup * 8) / elapsed) : 0;
d.live_down_bps = elapsed > 0 ? int((ddn * 8) / elapsed) : 0;
}
let user_used = {};
let user_daily = {};
for (let uid, u in state.users) {
user_used[uid] = 0;
user_daily[uid] = 0;
}
for (let mac, d in state.devices) {
if (d.user_id && state.users[d.user_id]) {
user_used[d.user_id] += (d.used_bytes || 0);
user_daily[d.user_id] += (d.daily_used_bytes || 0);
}
}
let total_bundle_bytes = cfg.bundle_gb * GB_BYTES;
let fixed_alloc = 0;
let equal_users = [];
for (let uid, u in state.users) {
if (u.allocation_mode == 'fixed') {
fixed_alloc += ((u.fixed_gb || 0) * GB_BYTES);
} else {
push(equal_users, uid);
}
}
let remaining_pool = total_bundle_bytes - fixed_alloc;
if (remaining_pool < 0) remaining_pool = 0;
let equal_share = length(equal_users) > 0 ? (remaining_pool / length(equal_users)) : 0;
let blocked_ips = [];
let blocked_macs = [];
for (let mac, d in state.devices) {
let should_block = false;
if (d.blocked || d.paused) {
should_block = true;
} else if (!d.user_id || !state.users[d.user_id]) {
if (cfg.block_new) should_block = true;
} else {
let u = state.users[d.user_id];
let quota = (u.allocation_mode == 'fixed') ? ((u.fixed_gb || 0) * GB_BYTES) : equal_share;
if ((user_used[d.user_id] || 0) >= quota) should_block = true;
if ((u.daily_cap_gb || 0) > 0 && (user_daily[d.user_id] || 0) >= (u.daily_cap_gb * GB_BYTES)) should_block = true;
}
if (should_block) {
push(blocked_macs, mac);
if (d.ip) push(blocked_ips, d.ip);
}
}
sync_blocked_sets(cfg, blocked_ips, blocked_macs);
}
function tc_batch(lines) {
if (length(lines) == 0) return true;
let p = popen('tc -batch - 2>/dev/null', 'w');
if (!p) return false;
p.write(join('\n', lines) + '\n');
return p.close() === 0;
}
const has_tc = (run('command -v tc >/dev/null 2>&1') === 0);
let last_tc_sig = '';
let last_nft_lim_sig = '';
function sync_nft_ratelimit(dn_rules, up_rules) {
let sig = join(',', dn_rules) + '|' + join(',', up_rules);
if (sig == last_nft_lim_sig) return;
last_nft_lim_sig = sig;
run('nft delete table inet quota_limit 2>/dev/null');
if (length(dn_rules) == 0 && length(up_rules) == 0) return;
let cmds = [
'add table inet quota_limit',
'add chain inet quota_limit forward_lim { type filter hook forward priority -2; policy accept; }'
];
for (let entry in dn_rules) {
let p = split(entry, ':');
let kbps = int((+p[1]) * 125);
if (kbps > 0) push(cmds, 'add rule inet quota_limit forward_lim ip daddr ' + p[0] + ' limit rate over ' + kbps + ' kbytes/second drop');
}
for (let entry in up_rules) {
let p = split(entry, ':');
let kbps = int((+p[1]) * 125);
if (kbps > 0) push(cmds, 'add rule inet quota_limit forward_lim ip saddr ' + p[0] + ' limit rate over ' + kbps + ' kbytes/second drop');
}
nft_batch(cmds);
}
function sync_tc_shaping(state, cfg) {
let lif = cfg.lan_if;
if (!cfg.enable_qos) {
if (has_tc && last_tc_sig != 'off') {
run('tc qdisc del dev ' + shquote(lif) + ' root 2>/dev/null');
run('tc qdisc del dev ' + shquote(lif) + ' ingress 2>/dev/null');
run('tc qdisc del dev ifb0 root 2>/dev/null');
last_tc_sig = 'off';
}
sync_nft_ratelimit([], []);
return;
}
let dn_rules = [];
let up_rules = [];
let idx = 10;
for (let mac, d in state.devices) {
if (!d.ip || d.blocked || d.paused) continue;
let d_cap = d.limit_down_mbps || 0;
let u_cap = d.limit_up_mbps || 0;
if (d_cap == 0 && d.user_id && state.users[d.user_id]) {
d_cap = state.users[d.user_id].speed_down_mbps || 0;
}
if (u_cap == 0 && d.user_id && state.users[d.user_id]) {
u_cap = state.users[d.user_id].speed_up_mbps || 0;
}
if (d_cap > 0) push(dn_rules, d.ip + ':' + d_cap + ':' + idx);
if (u_cap > 0) push(up_rules, d.ip + ':' + u_cap + ':' + idx);
if (d_cap > 0 || u_cap > 0) idx++;
}
if (!has_tc) {
sync_nft_ratelimit(dn_rules, up_rules);
return;
}
let sig = lif + '|' + (cfg.gaming_priority ? '1' : '0') + '|' + join(',', dn_rules) + '|' + join(',', up_rules);
if (sig == last_tc_sig) return;
last_tc_sig = sig;
run('tc qdisc del dev ' + shquote(lif) + ' root 2>/dev/null');
run('tc qdisc del dev ' + shquote(lif) + ' ingress 2>/dev/null');
run('tc qdisc del dev ifb0 root 2>/dev/null');
let cmds = [];
if (length(dn_rules) > 0 || cfg.gaming_priority) {
push(cmds, 'qdisc add dev ' + lif + ' root handle 1: htb default 999');
push(cmds, 'class add dev ' + lif + ' parent 1: classid 1:1 htb rate 1000mbit');
push(cmds, 'class add dev ' + lif + ' parent 1:1 classid 1:999 htb rate 950mbit ceil 1000mbit');
push(cmds, 'qdisc add dev ' + lif + ' parent 1:999 fq_codel');
for (let entry in dn_rules) {
let p = split(entry, ':');
push(cmds, 'class add dev ' + lif + ' parent 1:1 classid 1:' + p[2] + ' htb rate ' + p[1] + 'mbit ceil ' + p[1] + 'mbit');
push(cmds, 'qdisc add dev ' + lif + ' parent 1:' + p[2] + ' fq_codel');
push(cmds, 'filter add dev ' + lif + ' protocol ip parent 1:0 prio 1 u32 match ip dst ' + p[0] + '/32 flowid 1:' + p[2]);
}
}
if (length(up_rules) > 0 && run('ip link set ifb0 up 2>/dev/null') === 0) {
push(cmds, 'qdisc add dev ' + lif + ' handle ffff: ingress');
push(cmds, 'filter add dev ' + lif + ' parent ffff: protocol ip u32 match u32 0 0 action mirred egress redirect dev ifb0');
push(cmds, 'qdisc add dev ifb0 root handle 2: htb default 999');
push(cmds, 'class add dev ifb0 parent 2: classid 2:1 htb rate 1000mbit');
push(cmds, 'class add dev ifb0 parent 2:1 classid 2:999 htb rate 950mbit ceil 1000mbit');
push(cmds, 'qdisc add dev ifb0 parent 2:999 fq_codel');
for (let entry in up_rules) {
let p = split(entry, ':');
push(cmds, 'class add dev ifb0 parent 2:1 classid 2:' + p[2] + ' htb rate ' + p[1] + 'mbit ceil ' + p[1] + 'mbit');
push(cmds, 'qdisc add dev ifb0 parent 2:' + p[2] + ' fq_codel');
push(cmds, 'filter add dev ifb0 parent 2:0 prio 1 u32 match ip src ' + p[0] + '/32 flowid 2:' + p[2]);
}
}
tc_batch(cmds);
}
let last_dns_sig = '';
function sync_force_dns(cfg) {
let sig = (cfg.force_dns ? '1' : '0') + '|' + cfg.lan_if;
if (sig == last_dns_sig) return;
last_dns_sig = sig;
run('nft delete table inet quota_dns 2>/dev/null');
if (!cfg.force_dns) return;
nft_batch([
'add table inet quota_dns',
'add chain inet quota_dns prerouting { type nat hook prerouting priority dstnat; policy accept; }',
'add rule inet quota_dns prerouting iifname "' + cfg.lan_if + '" udp dport 53 redirect to :53',
'add rule inet quota_dns prerouting iifname "' + cfg.lan_if + '" tcp dport 53 redirect to :53'
]);
}
let state = load_state();
let tick = 0;
let last_tick_ts = time();
while (true) {
let st_info = stat(RAM_STATE);
if (st_info && st_info.mtime != last_ram_mtime) {
state = load_state();
last_ram_mtime = st_info.mtime;
}
let cfg = load_config();
if (cfg.enabled) {
let now_ts = time();
let elapsed = now_ts - last_tick_ts;
if (elapsed <= 0) elapsed = 5;
last_tick_ts = now_ts;
ensure_nft_base(cfg.mode);
sync_force_dns(cfg);
discover_devices(state, cfg.lan_if);
let counts = read_nft_counters(cfg.mode);
sync_device_rules(state, cfg.mode, counts);
update_usage_and_quotas(state, cfg, counts, elapsed);
sync_tc_shaping(state, cfg);
save_ram_state(state);
tick++;
if (tick >= 60) {
flush_flash_state(state);
tick = 0;
}
}
run('sleep 5');
}
EOF_DAEMON
chmod +x /usr/sbin/quotamgrd

# 9. Write /www-quota/cgi-bin/api
cat << 'EOF_API' > /www-quota/cgi-bin/api
#!/usr/bin/ucode
'use strict';
import { readfile, writefile, popen, open, unlink, lsdir } from 'fs';
import { cursor } from 'uci';
const RAM_STATE = '/tmp/quotamgr/state.json';
const FLASH_STATE = '/etc/quotamgr/state.json';
const SESS_DIR = '/tmp/quotamgr/sessions/';
const DNS_CONF = '/tmp/dnsmasq.d/quotamgr-block.conf';
const GB_BYTES = 1073741824;
function shquote(s) {
return "'" + replace(s + '', "'", "'\\''") + "'";
}
function capture(cmd) {
let p = popen(cmd, 'r');
if (!p) return '';
let out = p.read('all') || '';
p.close();
return out;
}
function sha256(str) {
return trim(capture('printf %s ' + shquote(str) + ' | sha256sum | cut -d" " -f1'));
}
function respond(code, obj, extra_headers) {
print('Status: ' + code + '\r\n');
print('Content-Type: application/json; charset=utf-8\r\n');
print('Cache-Control: no-store\r\n');
if (extra_headers) {
for (let h in extra_headers) print(h + '\r\n');
}
print('\r\n');
print(sprintf('%J', obj));
exit(0);
}
function parse_query(qs) {
let out = {};
if (!qs) return out;
for (let pair in split(qs, '&')) {
let kv = split(pair, '=');
if (length(kv) >= 1 && kv[0]) {
out[kv[0]] = kv[1] || '';
}
}
return out;
}
function read_body() {
let clen = +(getenv('CONTENT_LENGTH') || 0);
if (clen <= 0) return {};
let f = open('/proc/self/fd/0', 'r');
if (!f) return {};
let raw = f.read(clen);
f.close();
if (!raw) return {};
try { return json(raw); } catch (e) { return {}; }
}
function get_cookie_token() {
let ck = getenv('HTTP_COOKIE') || '';
let m = match(ck, /qm_sess=([a-f0-9]+)/);
return m ? m[1] : null;
}
function is_authed(c) {
let saved_hash = trim(c.get('quotamgr', 'main', 'admin_hash') || '');
if (saved_hash == '') return true;
let tok = get_cookie_token();
if (!tok) return false;
let s = readfile(SESS_DIR + tok);
if (!s) return false;
let ts = +trim(s);
if (time() - ts > 86400) {
unlink(SESS_DIR + tok);
return false;
}
return true;
}
function load_state() {
let raw = readfile(RAM_STATE) || readfile(FLASH_STATE);
if (!raw) return { users: {}, devices: {}, custom_domains: [], local_records: [], logs: [] };
try {
let d = json(raw);
d.users = d.users || {};
d.devices = d.devices || {};
d.custom_domains = d.custom_domains || [];
d.local_records = d.local_records || [];
d.logs = d.logs || [];
return d;
} catch (e) {
return { users: {}, devices: {}, custom_domains: [], local_records: [], logs: [] };
}
}
function add_log(st, ev, d, note) {
let now = localtime();
let ts = sprintf('%04d-%02d-%02d %02d:%02d:%02d', now.year, now.mon, now.mday, now.hour, now.min, now.sec);
st.logs = st.logs || [];
unshift(st.logs, { ts: ts, ev: ev, mac: d.mac, ip: d.ip || '', host: d.hostname || d.mac, unknown: (!d.user_id), note: note || '' });
while (length(st.logs) > 50) pop(st.logs);
}
function save_state(st) {
let txt = sprintf('%J', st);
writefile(RAM_STATE, txt);
writefile(FLASH_STATE, txt);
}
function rebuild_dns(c, st) {
let ad = (c.get('quotamgr', 'main', 'adblock') || '0') == '1';
let adult = (c.get('quotamgr', 'main', 'adultblock') || '0') == '1';
let gamble = (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1';
let preset = c.get('quotamgr', 'main', 'dns_preset') || 'isp';
let d1 = replace(trim(c.get('quotamgr', 'main', 'dns_primary') || ''), /[^0-9.]/g, '');
let d2 = replace(trim(c.get('quotamgr', 'main', 'dns_secondary') || ''), /[^0-9.]/g, '');
let cache = +(c.get('quotamgr', 'main', 'dns_cache') || 1500);
let lines = ['# Managed by QuotaManager', 'cache-size=' + cache];
if (preset != 'isp' && d1) {
push(lines, 'no-resolv');
push(lines, 'server=' + d1);
if (d2) push(lines, 'server=' + d2);
}
for (let rec in (st.local_records || [])) {
let h = replace(trim(rec.host || ''), /[^a-zA-Z0-9.-]/g, '');
let ip = replace(trim(rec.ip || ''), /[^0-9.]/g, '');
if (h && ip) push(lines, 'address=/' + h + '/' + ip);
}
if (ad) {
for (let dom in ['doubleclick.net', 'googlesyndication.com', 'adservice.google.com', 'ads.facebook.com', 'taboola.com', 'outbrain.com', 'adnxs.com']) {
push(lines, 'local=/' + dom + '/');
}
}
if (adult) {
for (let dom in ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com']) {
push(lines, 'local=/' + dom + '/');
}
}
if (gamble) {
for (let dom in ['bet365.com', '1xbet.com', 'melbet.com', 'draftkings.com', 'pokerstars.com']) {
push(lines, 'local=/' + dom + '/');
}
}
for (let dom in (st.custom_domains || [])) {
let clean = replace(trim(dom), /[^a-zA-Z0-9.-]/g, '');
if (clean) push(lines, 'local=/' + clean + '/');
}
writefile(DNS_CONF, join('\n', lines) + '\n');
system('/etc/init.d/dnsmasq reload >/dev/null 2>&1');
}
let q = parse_query(getenv('QUERY_STRING'));
let action = q.action || 'state';
let c = cursor();
if (action == 'login') {
let body = read_body();
let saved_user = trim(c.get('quotamgr', 'main', 'admin_user') || 'مصطفي');
let saved_hash = trim(c.get('quotamgr', 'main', 'admin_hash') || '');
if (saved_hash == '') {
respond(200, { ok: true, auth_enabled: false });
}
let req_user = trim(body.username != null ? ('' + body.username) : '');
let req_pw = body.password != null ? ('' + body.password) : '';
if (req_user != saved_user || sha256(req_pw) != saved_hash) {
respond(401, { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
}
for (let f in (lsdir(SESS_DIR) || [])) unlink(SESS_DIR + f);
let tok = trim(capture('head -c 16 /dev/urandom | hexdump -ve "1/1 \"%.2x\""'));
writefile(SESS_DIR + tok, '' + time());
respond(200, { ok: true, auth_enabled: true }, [
'Set-Cookie: qm_sess=' + tok + '; Path=/; HttpOnly; SameSite=Lax'
]);
}
if (action == 'logout') {
let tok = get_cookie_token();
if (tok) unlink(SESS_DIR + tok);
respond(200, { ok: true }, ['Set-Cookie: qm_sess=; Path=/; Max-Age=0']);
}
if (!is_authed(c)) {
respond(401, { ok: false, auth_required: true });
}
let st = load_state();
if (action == 'state') {
let meminfo = readfile('/proc/meminfo') || '';
let m_tot = match(meminfo, /MemTotal:\s+(\d+)/);
let m_avail = match(meminfo, /MemAvailable:\s+(\d+)/);
let df_out = trim(capture("df -k /overlay | tail -n 1 | awk '{print $4}'"));
respond(200, {
ok: true,
auth_enabled: (trim(c.get('quotamgr', 'main', 'admin_hash') || '') != ''),
admin_user: trim(c.get('quotamgr', 'main', 'admin_user') || 'مصطفي'),
settings: {
bundle_gb: +(c.get('quotamgr', 'main', 'bundle_gb') || 140),
renew_day: +(c.get('quotamgr', 'main', 'renew_day') || 1),
block_new_devices: (c.get('quotamgr', 'main', 'block_new_devices') || '1') == '1',
enable_qos: (c.get('quotamgr', 'main', 'enable_qos') || '1') == '1',
gaming_priority: (c.get('quotamgr', 'main', 'gaming_priority') || '1') == '1',
mode: c.get('quotamgr', 'main', 'mode') || 'router',
adblock: (c.get('quotamgr', 'main', 'adblock') || '0') == '1',
adultblock: (c.get('quotamgr', 'main', 'adultblock') || '0') == '1',
gambleblock: (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1',
dns_preset: c.get('quotamgr', 'main', 'dns_preset') || 'cloudflare_family',
dns_primary: c.get('quotamgr', 'main', 'dns_primary') || '1.1.1.3',
dns_secondary: c.get('quotamgr', 'main', 'dns_secondary') || '1.0.0.3',
force_dns: (c.get('quotamgr', 'main', 'force_dns') || '0') == '1',
dns_cache: +(c.get('quotamgr', 'main', 'dns_cache') || 1500)
},
system: {
mem_total_mb: m_tot ? int(+m_tot[1] / 1024) : 256,
mem_free_mb: m_avail ? int(+m_avail[1] / 1024) : 0,
flash_free_kb: +(df_out || 0)
},
state: st
});
}
let body = read_body();
if (action == 'save_user') {
let id = body.id || ('u_' + time());
st.users[id] = {
id: id,
name: body.name || 'مستخدم',
allocation_mode: body.allocation_mode == 'fixed' ? 'fixed' : 'equal',
fixed_gb: +(body.fixed_gb || 0),
daily_cap_gb: +(body.daily_cap_gb || 0),
speed_down_mbps: +(body.speed_down_mbps || 0),
speed_up_mbps: +(body.speed_up_mbps || 0)
};
save_state(st);
respond(200, { ok: true, id: id });
}
if (action == 'delete_user') {
let id = body.id;
if (id && st.users[id]) {
delete st.users[id];
for (let mac, d in st.devices) {
if (d.user_id == id) d.user_id = null;
}
save_state(st);
}
respond(200, { ok: true });
}
if (action == 'device_action') {
let mac = lc(body.mac || '');
let d = st.devices[mac];
if (!d) respond(404, { ok: false, error: 'الجهاز غير موجود' });
let op = body.op;
if (op == 'assign') d.user_id = body.user_id || null;
else if (op == 'block') { d.blocked = true; add_log(st, 'disconnect', d, 'حظر يدوي'); }
else if (op == 'unblock') { d.blocked = false; d.paused = false; add_log(st, 'connect', d, 'فك الحظر'); }
else if (op == 'pause') d.paused = true;
else if (op == 'unpause') d.paused = false;
else if (op == 'set_limit') {
d.limit_down_mbps = +(body.limit_down_mbps || 0);
d.limit_up_mbps = +(body.limit_up_mbps || 0);
} else if (op == 'kick') {
d.paused = true;
add_log(st, 'disconnect', d, 'طرد فوري');
let ifs = split(trim(capture("iw dev | awk '$1==\"Interface\"{print $2}'")), '\n');
for (let wif in ifs) {
if (wif) system('iw dev ' + shquote(wif) + ' station del ' + shquote(mac) + ' 2>/dev/null');
}
}
save_state(st);
respond(200, { ok: true });
}
if (action == 'clear_logs') {
st.logs = [];
save_state(st);
respond(200, { ok: true });
}
if (action == 'update_settings') {
if (body.bundle_gb != null) c.set('quotamgr', 'main', 'bundle_gb', '' + (+body.bundle_gb));
if (body.renew_day != null) c.set('quotamgr', 'main', 'renew_day', '' + (+body.renew_day));
if (body.block_new_devices != null) c.set('quotamgr', 'main', 'block_new_devices', body.block_new_devices ? '1' : '0');
if (body.enable_qos != null) c.set('quotamgr', 'main', 'enable_qos', body.enable_qos ? '1' : '0');
if (body.gaming_priority != null) c.set('quotamgr', 'main', 'gaming_priority', body.gaming_priority ? '1' : '0');
if (body.adblock != null) c.set('quotamgr', 'main', 'adblock', body.adblock ? '1' : '0');
if (body.adultblock != null) c.set('quotamgr', 'main', 'adultblock', body.adultblock ? '1' : '0');
if (body.gambleblock != null) c.set('quotamgr', 'main', 'gambleblock', body.gambleblock ? '1' : '0');
if (body.dns_preset != null) c.set('quotamgr', 'main', 'dns_preset', '' + body.dns_preset);
if (body.dns_primary != null) c.set('quotamgr', 'main', 'dns_primary', '' + body.dns_primary);
if (body.dns_secondary != null) c.set('quotamgr', 'main', 'dns_secondary', '' + body.dns_secondary);
if (body.force_dns != null) c.set('quotamgr', 'main', 'force_dns', body.force_dns ? '1' : '0');
if (body.dns_cache != null) c.set('quotamgr', 'main', 'dns_cache', '' + (+body.dns_cache));
if (body.admin_user != null && length(trim('' + body.admin_user)) > 0) {
c.set('quotamgr', 'main', 'admin_user', trim('' + body.admin_user));
}
if (body.clear_password) {
c.set('quotamgr', 'main', 'admin_hash', '');
} else if (body.new_password != null && length('' + body.new_password) >= 1) {
c.set('quotamgr', 'main', 'admin_hash', sha256('' + body.new_password));
}
c.save('quotamgr');
c.commit('quotamgr');
if (body.custom_domains != null) st.custom_domains = body.custom_domains;
if (body.local_records != null) st.local_records = body.local_records;
if (body.custom_domains != null || body.local_records != null) save_state(st);
rebuild_dns(c, st);
respond(200, { ok: true });
}
if (action == 'reset_cycle') {
for (let mac, d in st.devices) {
d.used_bytes = 0;
d.daily_used_bytes = 0;
}
save_state(st);
respond(200, { ok: true });
}
respond(400, { ok: false, error: 'طلب غير معروف' });
EOF_API
chmod +x /www-quota/cgi-bin/api

# 10. Write /www-quota/index.html
cat << 'EOF_HTML' > /www-quota/index.html
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>إدارة الحصص — OpenWrt</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--bd:#e2e8f0;--row:#f1f5f9;--txt:#0f172a;--mut:#64748b;--inp:#cbd5e1;--th:#f8fafc;--th-t:#475569;--act:#0f172a}
body.dark{--bg:#020617;--card:#0f172a;--bd:#1e293b;--row:#1e293b;--txt:#f1f5f9;--mut:#94a3b8;--inp:#334155;--th:#1e293b;--th-t:#cbd5e1;--act:#0284c7}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--txt);font-size:14px}
header{background:var(--card);border-bottom:1px solid var(--bd);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{font-weight:700;font-size:16px}
.wrap{max-width:1160px;margin:0 auto;padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:16px}
.muted{color:var(--mut);font-size:12px}
.num{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;font-size:20px}
.bar{height:8px;background:var(--bd);border-radius:4px;overflow:hidden;margin-top:8px}
.bar>div{height:100%;background:#0284c7}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:8px;overflow:hidden}
th,td{padding:10px 12px;border-bottom:1px solid var(--row);text-align:right;font-size:13px}
th{background:var(--th);color:var(--th-t);font-weight:600}
button,select,input{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--inp);border-radius:6px;background:var(--card);color:var(--txt)}
button{cursor:pointer;font-weight:500}
button.pri{background:#0284c7;color:#fff;border-color:#0284c7}
button.dng{color:#ef4444;border-color:#7f1d1d}
.tabs{display:flex;gap:8px}
.tabs button.act{background:var(--act);color:#fff;border-color:var(--act)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#login{max-width:360px;margin:80px auto;background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:24px}
.hide{display:none}
</style>
</head>
<body>
<div id="login" class="hide">
<h2 style="margin-top:0">دخول لوحة الشبكة</h2>
<p class="muted">راوتر OpenWrt 25.12.6 — سجّل الدخول بحساب الأدمن</p>
<input id="lun" type="text" placeholder="اسم المستخدم" style="width:100%;margin:12px 0 8px" onkeydown="if(event.key==='Enter')doLogin()">
<input id="pw" type="password" placeholder="كلمة المرور" style="width:100%;margin:0 0 12px" onkeydown="if(event.key==='Enter')doLogin()">
<button class="pri" style="width:100%" onclick="doLogin()">دخول</button>
<p id="lerr" style="color:#ef4444;font-size:12px"></p>
</div>
<div id="app" class="hide">
<header>
<div class="brand">إدارة الحصص · OpenWrt</div>
<div class="tabs">
<button class="act" onclick="tab('ov',this)">نظرة عامة</button>
<button onclick="tab('us',this)">المستخدمون</button>
<button onclick="tab('dn',this)">DNS والحظر</button>
<button onclick="tab('lg',this)">سجلات النشاط</button>
<button onclick="tab('st',this)">الإعدادات</button>
</div>
<div class="row">
<button id="tbtn" onclick="toggleTheme()">الوضع الليلي</button>
<button id="lout" class="hide" onclick="logout()">خروج</button>
</div>
</header>
<div class="wrap">
<div class="grid" id="kpis"></div>
<div id="p_ov">
<div class="card">
<div class="row" style="justify-content:space-between;margin-bottom:12px">
<strong>الأجهزة المتصلة</strong>
<span class="muted" id="sysinfo"></span>
</div>
<div style="overflow:auto"><table><thead><tr><th>الجهاز</th><th>المستخدم</th><th>الاستهلاك</th><th>السرعة</th><th>الحالة</th><th>تحكم</th></tr></thead><tbody id="devs"></tbody></table></div>
</div>
</div>
<div id="p_us" class="hide">
<div class="card" style="margin-bottom:16px">
<strong>إضافة / تعديل مستخدم</strong>
<div class="row" style="margin-top:10px">
<input id="un" placeholder="الاسم">
<select id="um"><option value="equal">تقسيم متساوي</option><option value="fixed">حصة ثابتة (GB)</option></select>
<input id="ug" type="number" placeholder="GB" style="width:90px">
<input id="ud" type="number" placeholder="سقف يومي GB" style="width:120px">
<input id="uspd" type="number" placeholder="السرعة Mbps" style="width:130px">
<button class="pri" onclick="saveUser()">حفظ</button>
</div>
</div>
<div class="card"><table><thead><tr><th>الاسم</th><th>النظام</th><th>المستهلك / الحصة</th><th>الحد</th><th>حذف</th></tr></thead><tbody id="users"></tbody></table></div>
</div>
<div id="p_lg" class="hide">
<div class="card">
<div class="row" style="justify-content:space-between;margin-bottom:12px">
<strong>سجلات النشاط (آخر 50 اتصال/فصل)</strong>
<div class="row">
<select id="lgf" onchange="render()">
<option value="all">كل السجلات</option>
<option value="unknown">أجهزة غريبة فقط</option>
<option value="connect">عمليات الاتصال</option>
<option value="disconnect">عمليات الفصل</option>
</select>
<button class="dng" onclick="clearLogs()">مسح السجل</button>
</div>
</div>
<div style="overflow:auto"><table><thead><tr><th>الوقت</th><th>الحدث</th><th>الجهاز</th><th>التفاصيل</th><th>إجراء</th></tr></thead><tbody id="logs"></tbody></table></div>
</div>
</div>
<div id="p_dn" class="hide">
<div class="card" style="margin-bottom:16px">
<strong>إعدادات DNS والحماية</strong>
<div class="row" style="margin-top:12px">
<select id="dp" onchange="pickDnsPreset()">
<option value="cloudflare_family">Cloudflare Family (1.1.1.3)</option>
<option value="cloudflare">Cloudflare (1.1.1.1)</option>
<option value="adguard">AdGuard DNS (94.140.14.14)</option>
<option value="quad9">Quad9 (9.9.9.9)</option>
<option value="google">Google DNS (8.8.8.8)</option>
<option value="isp">ISP DNS</option>
<option value="custom">Custom</option>
</select>
<input id="d1" dir="ltr" placeholder="Primary DNS" style="width:130px">
<input id="d2" dir="ltr" placeholder="Secondary DNS" style="width:130px">
<select id="dc"><option value="500">Cache 500</option><option value="1500">Cache 1500</option><option value="3000">Cache 3000</option></select>
<label><input id="dfd" type="checkbox"> إجبار التوجيه (Port 53)</label>
</div>
<div class="row" style="margin-top:12px">
<label><input id="sad" type="checkbox"> حظر الإعلانات</label>
<label><input id="sadu" type="checkbox"> حظر المواقع الإباحية</label>
<label><input id="sgam" type="checkbox"> حظر القمار</label>
<button class="pri" onclick="saveDns()">تطبيق إعدادات DNS</button>
</div>
</div>
<div class="card">
<strong>نطاقات محجوبة مخصصة وسجلات محلية</strong>
<div class="row" style="margin-top:10px">
<input id="cdom" dir="ltr" placeholder="example.com" style="width:180px">
<button onclick="addDom()">حظر نطاق</button>
<input id="lhost" dir="ltr" placeholder="quota.lan" style="width:140px">
<input id="lip" dir="ltr" placeholder="192.168.1.1" style="width:130px">
<button onclick="addRec()">إضافة سجل محلي</button>
</div>
<div class="muted" id="dlist" style="margin-top:10px"></div>
</div>
</div>
<div id="p_st" class="hide">
<div class="card">
<strong>إعدادات الباقة والأمان</strong>
<div class="row" style="margin-top:12px">
<label>سعة الباقة (GB) <input id="sb" type="number" style="width:90px"></label>
<label>يوم التجديد <input id="sr" type="number" min="1" max="28" style="width:70px"></label>
<label><input id="sbn" type="checkbox"> حظر الأجهزة الجديدة تلقائياً</label>
<label><input id="sqos" type="checkbox"> تفعيل QoS والألعاب</label>
</div>
<div class="row" style="margin-top:12px">
<input id="sun" type="text" placeholder="اسم مستخدم الأدمن" style="width:150px">
<input id="spw" type="password" placeholder="كلمة المرور الجديدة (الافتراضية: 0)">
<button class="pri" onclick="saveSettings()">حفظ الإعدادات</button>
<button id="clrp" class="hide" onclick="clearPw()">إلغاء كلمة المرور</button>
<button class="dng" onclick="resetCycle()">تصفير استهلاك الدورة</button>
</div>
</div>
</div>
</div>
</div>
<script>
const GB=1073741824;let DATA=null,EDIT_MAC=null;
function applyTheme(d){document.body.classList.toggle('dark',d);const b=document.getElementById('tbtn');if(b)b.textContent=d?'الوضع النهاري':'الوضع الليلي';}
function toggleTheme(){const d=!document.body.classList.contains('dark');localStorage.setItem('qm_theme',d?'dark':'light');applyTheme(d);}
applyTheme(localStorage.getItem('qm_theme')==='dark');
async function api(a,b){const r=await fetch('/cgi-bin/api?action='+a,{method:b?'POST':'GET',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return r.json();}
function tab(id,btn){['ov','us','dn','lg','st'].forEach(x=>document.getElementById('p_'+x).classList.toggle('hide',x!==id));document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('act'));btn.classList.add('act');}
async function doLogin(){const res=await api('login',{username:document.getElementById('lun').value,password:document.getElementById('pw').value});if(res.ok){document.getElementById('lerr').textContent='';load();}else{document.getElementById('lerr').textContent=res.error||'خطأ';}}
async function logout(){await api('logout',{});location.reload();}
function fmtG(b){return (b/GB).toFixed(2)+' GB';}
function fmtS(bps){return bps>1048576?(bps/1048576).toFixed(1)+' Mbps':Math.round(bps/1024)+' Kbps';}
const DNS_P={cloudflare_family:['1.1.1.3','1.0.0.3'],cloudflare:['1.1.1.1','1.0.0.1'],adguard:['94.140.14.14','94.140.15.15'],quad9:['9.9.9.9','149.112.112.112'],google:['8.8.8.8','8.8.4.4'],isp:['','']};
function pickDnsPreset(){const v=document.getElementById('dp').value;if(DNS_P[v]){document.getElementById('d1').value=DNS_P[v][0];document.getElementById('d2').value=DNS_P[v][1];}}
async function load(){
const res=await api('state');
if(!res.ok){document.getElementById('login').classList.remove('hide');document.getElementById('app').classList.add('hide');return;}
document.getElementById('login').classList.add('hide');document.getElementById('app').classList.remove('hide');
DATA=res;render();
}
function render(){
const st=DATA.state,cfg=DATA.settings,sys=DATA.system;
const lb=document.getElementById('lout');if(lb)lb.classList.toggle('hide',!DATA.auth_enabled);
const cp=document.getElementById('clrp');if(cp)cp.classList.toggle('hide',!DATA.auth_enabled);
const su=document.getElementById('sun');if(su)su.value=DATA.admin_user||'مصطفي';
let totUsed=0;Object.values(st.devices).forEach(d=>totUsed+=d.used_bytes||0);
const rem=Math.max(0,cfg.bundle_gb*GB-totUsed),pct=Math.min(100,(totUsed/(cfg.bundle_gb*GB||1))*100);
document.getElementById('kpis').innerHTML=`
<div class="card"><div class="muted">إجمالي الباقة</div><div class="num">${cfg.bundle_gb} GB</div><div class="bar"><div style="width:${pct}%"></div></div></div>
<div class="card"><div class="muted">المستهلك</div><div class="num">${fmtG(totUsed)}</div></div>
<div class="card"><div class="muted">المتبقي</div><div class="num">${fmtG(rem)}</div></div>
<div class="card"><div class="muted">الأجهزة النشطة</div><div class="num">${Object.values(st.devices).filter(d=>d.online).length} / ${Object.keys(st.devices).length}</div></div>`;
document.getElementById('sysinfo').textContent='RAM: '+sys.mem_free_mb+'/'+sys.mem_total_mb+' MB · Flash: '+Math.round(sys.flash_free_kb/1024)+' MB';
const uopts=['<option value="">غير معين</option>'].concat(Object.values(st.users).map(u=>`<option value="${u.id}">${u.name}</option>`)).join('');
document.getElementById('devs').innerHTML=Object.values(st.devices).map(d=>{
const status=d.blocked?'محظور':d.paused?'متوقف مؤقتاً':(!d.user_id&&cfg.block_new_devices)?'محظور (جهاز جديد)':'متصل';
const usr=d.user_id?st.users[d.user_id]:null;
const effD=d.limit_down_mbps>0?d.limit_down_mbps:(usr?usr.speed_down_mbps||0:0);
const effU=d.limit_up_mbps>0?d.limit_up_mbps:(usr?usr.speed_up_mbps||0:0);
const capTxt=(effD>0||effU>0)?('سقف: '+(effD||'مفتوح')+'/'+(effU||'مفتوح')+' Mbps'):'سقف: مفتوح';
const spdCell=EDIT_MAC===d.mac
?`<div class="row"><input id="ed_d" type="number" min="0" value="${d.limit_down_mbps||0}" style="width:58px" title="التحميل بـ Mbps"><input id="ed_u" type="number" min="0" value="${d.limit_up_mbps||0}" style="width:58px" title="الرفع بـ Mbps"><button class="pri" onclick="saveLim('${d.mac}')">حفظ</button><button onclick="EDIT_MAC=null;render()">×</button></div><div class="row" style="margin-top:4px"><button onclick="setLim('${d.mac}',2,1)">2 Mbps</button><button onclick="setLim('${d.mac}',5,2)">5 Mbps</button><button onclick="setLim('${d.mac}',10,3)">10 Mbps</button><button onclick="setLim('${d.mac}',0,0)">مفتوح</button></div>`
:`<div>↓${fmtS(d.live_down_bps||0)}</div><div class="muted">${capTxt}</div>`;
return `<tr><td><b>${d.hostname}</b><div class="muted">${d.mac} · ${d.ip||'-'}</div></td>
<td><select onchange="devOp('${d.mac}','assign',{user_id:this.value})">${uopts.replace('value="'+d.user_id+'"','value="'+d.user_id+'" selected')}</select></td>
<td class="num" style="font-size:13px">${fmtG(d.used_bytes||0)}</td>
<td class="num" style="font-size:13px">${spdCell}</td>
<td>${status}</td>
<td class="row">
<button onclick="devOp('${d.mac}',d_act('${d.blocked}','${d.paused}'))">${(d.blocked||d.paused)?'تشغيل':'إيقاف'}</button>
<button onclick="EDIT_MAC='${d.mac}';render()">السرعة</button>
<button class="dng" onclick="devOp('${d.mac}','kick',{})">طرد</button>
</td></tr>`;
}).join('');
let fixSum=0,eqCnt=0;Object.values(st.users).forEach(u=>{if(u.allocation_mode=='fixed')fixSum+=u.fixed_gb*GB;else eqCnt++;});
const eqShare=eqCnt?Math.max(0,cfg.bundle_gb*GB-fixSum)/eqCnt:0;
document.getElementById('users').innerHTML=Object.values(st.users).map(u=>{
let uUsed=0;Object.values(st.devices).forEach(d=>{if(d.user_id==u.id)uUsed+=d.used_bytes||0;});
const q=u.allocation_mode=='fixed'?u.fixed_gb*GB:eqShare;
return `<tr><td><b>${u.name}</b></td><td>${u.allocation_mode=='fixed'?'ثابت':'متساوي'}</td><td class="num" style="font-size:13px">${fmtG(uUsed)} / ${fmtG(q)}</td><td>${u.speed_down_mbps?u.speed_down_mbps+' Mbps':'مفتوح'}</td><td><button class="dng" onclick="delUser('${u.id}')">حذف</button></td></tr>`;
}).join('');
const lgf=document.getElementById('lgf').value;
const lgRows=(st.logs||[]).filter(l=>{
if(lgf==='unknown')return l.unknown||!(st.devices[l.mac]&&st.devices[l.mac].user_id);
if(lgf==='connect')return l.ev==='connect';
if(lgf==='disconnect')return l.ev==='disconnect';
return true;
});
document.getElementById('logs').innerHTML=lgRows.length?lgRows.map(l=>{
const dv=st.devices[l.mac];const unk=!(dv&&dv.user_id);
return `<tr><td class="num" style="font-size:12px" dir="ltr">${l.ts}</td>
<td>${l.ev==='connect'?'اتصال':'فصل'}</td>
<td><b>${l.host}</b><div class="muted">${l.mac} · ${l.ip||'-'}</div></td>
<td>${unk?'<span style="color:#d97706">جهاز غريب</span> · ':''}${l.note||''}</td>
<td>${dv?(dv.blocked?`<button onclick="devOp('${l.mac}','unblock',{})">فك الحظر</button>`:`<button class="dng" onclick="devOp('${l.mac}','block',{})">حظر</button>`):'-'}</td></tr>`;
}).join(''):'<tr><td colspan="5" class="muted">لا توجد سجلات نشاط بعد</td></tr>';
document.getElementById('dp').value=cfg.dns_preset||'cloudflare_family';
document.getElementById('d1').value=cfg.dns_primary||'';document.getElementById('d2').value=cfg.dns_secondary||'';
document.getElementById('dc').value=String(cfg.dns_cache||1500);document.getElementById('dfd').checked=!!cfg.force_dns;
document.getElementById('sad').checked=cfg.adblock;document.getElementById('sadu').checked=cfg.adultblock;document.getElementById('sgam').checked=cfg.gambleblock;
const doms=(st.custom_domains||[]).map(d=>`${d} <a href="#" onclick="delDom('${d}');return false" style="color:#ef4444">×</a>`).join(' · ');
const recs=(st.local_records||[]).map(r=>`${r.host}→${r.ip} <a href="#" onclick="delRec('${r.host}');return false" style="color:#ef4444">×</a>`).join(' · ');
document.getElementById('dlist').innerHTML='محجوب: '+(doms||'لا يوجد')+'<br>سجلات محلية: '+(recs||'لا يوجد');
document.getElementById('sb').value=cfg.bundle_gb;document.getElementById('sr').value=cfg.renew_day;
document.getElementById('sbn').checked=cfg.block_new_devices;document.getElementById('sqos').checked=cfg.enable_qos;
}
function d_act(b,p){return (b==='true'||p==='true')?'unblock':'pause';}
async function setLim(mac,dn,up){EDIT_MAC=null;await devOp(mac,'set_limit',{limit_down_mbps:dn,limit_up_mbps:up});}
async function saveLim(mac){await setLim(mac,+document.getElementById('ed_d').value||0,+document.getElementById('ed_u').value||0);}
async function devOp(mac,op,extra){await api('device_action',Object.assign({mac,op},extra));load();}
async function saveUser(){await api('save_user',{name:document.getElementById('un').value,allocation_mode:document.getElementById('um').value,fixed_gb:+document.getElementById('ug').value,daily_cap_gb:+document.getElementById('ud').value,speed_down_mbps:+document.getElementById('uspd').value});load();}
async function delUser(id){await api('delete_user',{id});load();}
async function clearLogs(){await api('clear_logs',{});load();}
async function saveDns(){await api('update_settings',{dns_preset:document.getElementById('dp').value,dns_primary:document.getElementById('d1').value,dns_secondary:document.getElementById('d2').value,dns_cache:+document.getElementById('dc').value,force_dns:document.getElementById('dfd').checked,adblock:document.getElementById('sad').checked,adultblock:document.getElementById('sadu').checked,gambleblock:document.getElementById('sgam').checked});load();}
async function addDom(){const v=document.getElementById('cdom').value.trim();if(!v)return;const arr=(DATA.state.custom_domains||[]).concat([v]);document.getElementById('cdom').value='';await api('update_settings',{custom_domains:arr});load();}
async function delDom(v){const arr=(DATA.state.custom_domains||[]).filter(x=>x!==v);await api('update_settings',{custom_domains:arr});load();}
async function addRec(){const h=document.getElementById('lhost').value.trim(),ip=document.getElementById('lip').value.trim();if(!h||!ip)return;const arr=(DATA.state.local_records||[]).concat([{host:h,ip:ip}]);document.getElementById('lhost').value='';await api('update_settings',{local_records:arr});load();}
async function delRec(h){const arr=(DATA.state.local_records||[]).filter(x=>x.host!==h);await api('update_settings',{local_records:arr});load();}
async function saveSettings(){await api('update_settings',{bundle_gb:+document.getElementById('sb').value,renew_day:+document.getElementById('sr').value,block_new_devices:document.getElementById('sbn').checked,enable_qos:document.getElementById('sqos').checked,admin_user:document.getElementById('sun').value,new_password:document.getElementById('spw').value});document.getElementById('spw').value='';load();}
async function clearPw(){await api('update_settings',{clear_password:true});load();}
async function resetCycle(){if(confirm('تصفير استهلاك الدورة؟')){await api('reset_cycle',{});load();}}
load();setInterval(()=>{if(!document.hidden&&!document.getElementById('app').classList.contains('hide')&&!EDIT_MAC)load();},6000);
</script>
</body>
</html>
EOF_HTML

# 11. Write /etc/init.d/quotamgr
cat << 'EOF_INIT' > /etc/init.d/quotamgr
#!/bin/sh /etc/rc.common

START=95
STOP=10
USE_PROCD=1

PROG=/usr/bin/ucode
SCRIPT=/usr/sbin/quotamgrd

prepare_dirs() {
	mkdir -p /tmp/quotamgr /tmp/quotamgr/sessions /tmp/dnsmasq.d /etc/quotamgr
	if [ ! -f /tmp/quotamgr/state.json ] && [ -f /etc/quotamgr/state.json ]; then
		cp /etc/quotamgr/state.json /tmp/quotamgr/state.json
	fi
}

start_service() {
	prepare_dirs
	procd_open_instance
	procd_set_param command "$PROG" "$SCRIPT"
	procd_set_param respawn ${respawn_threshold:-3600} ${respawn_timeout:-5} ${respawn_retry:-5}
	procd_set_param stdout 1
	procd_set_param stderr 1
	procd_close_instance
}

stop_service() {
	if [ -f /tmp/quotamgr/state.json ]; then
		cp /tmp/quotamgr/state.json /etc/quotamgr/state.json
	fi
	nft delete table inet quota_mgr 2>/dev/null || true
	nft delete table inet quota_dns 2>/dev/null || true
	nft delete table inet quota_limit 2>/dev/null || true
	nft delete table bridge quota_bridge 2>/dev/null || true
	LAN_IF="$(uci -q get quotamgr.main.lan_if || echo br-lan)"
	tc qdisc del dev "$LAN_IF" root 2>/dev/null || true
	tc qdisc del dev "$LAN_IF" ingress 2>/dev/null || true
	tc qdisc del dev ifb0 root 2>/dev/null || true
}

reload_service() {
	stop
	start
}

service_triggers() {
	procd_add_reload_trigger "quotamgr" "firewall"
}

EOF_INIT
chmod +x /etc/init.d/quotamgr

# 12. Configure dedicated uhttpd instance on port undefined (keeps LuCI intact on port 80)
uci -q delete uhttpd.quotamgr || true
uci set uhttpd.quotamgr=uhttpd
uci add_list uhttpd.quotamgr.listen_http="0.0.0.0:undefined"
uci set uhttpd.quotamgr.home='/www-quota'
uci set uhttpd.quotamgr.cgi_prefix='/cgi-bin'
uci set uhttpd.quotamgr.index_page='index.html'
uci set uhttpd.quotamgr.script_timeout='30'
uci commit uhttpd

# 13. Open firewall port on LAN if needed & restart services
/etc/init.d/uhttpd restart
/etc/init.d/dnsmasq reload 2>/dev/null || true
/etc/init.d/quotamgr enable
/etc/init.d/quotamgr restart

LAN_IP=$(uci -q get network.lan.ipaddr || echo "192.168.1.1")
echo ""
echo "================================================="
echo " Installation Complete!"
echo " Dashboard URL : http://$LAN_IP:undefined"
echo " Auth Mode     : Admin account (مصطفي)"
echo "================================================="
