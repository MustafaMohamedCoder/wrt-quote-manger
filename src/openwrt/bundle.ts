import type { GeneratedOpenWrtFile, OpenWrtBuildConfig } from '../types';

const UCI_CONFIG_TEMPLATE = `config global 'main'
\toption enabled '1'
\toption port '__PORT__'
\toption mode '__MODE__'
\toption bundle_gb '__BUNDLE_GB__'
\toption renew_day '__RENEW_DAY__'
\toption block_new_devices '__BLOCK_NEW__'
\toption enable_qos '__ENABLE_QOS__'
\toption gaming_priority '1'
\toption adblock '0'
\toption adultblock '0'
\toption gambleblock '0'
\toption dns_preset 'cloudflare_family'
\toption dns_primary '1.1.1.3'
\toption dns_secondary '1.0.0.3'
\toption force_dns '0'
\toption dns_cache '1500'
\toption lan_if 'br-lan'
\toption wan_if ''
\toption admin_hash '__ADMIN_HASH__'
`;

const INIT_SCRIPT_TEMPLATE = `#!/bin/sh /etc/rc.common

START=95
STOP=10
USE_PROCD=1

PROG=/usr/bin/ucode
SCRIPT=/usr/sbin/quotamgrd

prepare_dirs() {
\tmkdir -p /tmp/quotamgr /tmp/quotamgr/sessions /tmp/dnsmasq.d /etc/quotamgr
\tif [ ! -f /tmp/quotamgr/state.json ] && [ -f /etc/quotamgr/state.json ]; then
\t\tcp /etc/quotamgr/state.json /tmp/quotamgr/state.json
\tfi
}

start_service() {
\tprepare_dirs
\tprocd_open_instance
\tprocd_set_param command "$PROG" "$SCRIPT"
\tprocd_set_param respawn \${respawn_threshold:-3600} \${respawn_timeout:-5} \${respawn_retry:-5}
\tprocd_set_param stdout 1
\tprocd_set_param stderr 1
\tprocd_close_instance
}

stop_service() {
\tif [ -f /tmp/quotamgr/state.json ]; then
\t\tcp /tmp/quotamgr/state.json /etc/quotamgr/state.json
\tfi
\tnft delete table inet quota_mgr 2>/dev/null || true
\tnft delete table inet quota_dns 2>/dev/null || true
\tnft delete table inet quota_limit 2>/dev/null || true
\tnft delete table bridge quota_bridge 2>/dev/null || true
\tLAN_IF="$(uci -q get quotamgr.main.lan_if || echo br-lan)"
\ttc qdisc del dev "$LAN_IF" root 2>/dev/null || true
\ttc qdisc del dev "$LAN_IF" ingress 2>/dev/null || true
\ttc qdisc del dev ifb0 root 2>/dev/null || true
}

reload_service() {
\tstop
\tstart
}

service_triggers() {
\tprocd_add_reload_trigger "quotamgr" "firewall"
}
`;

const QUOTAMGRD_UCODE = `#!/usr/bin/ucode
'use strict';

import { readfile, writefile, popen, stat } from 'fs';
import { cursor } from 'uci';

const RAM_STATE = '/tmp/quotamgr/state.json';
const FLASH_STATE = '/etc/quotamgr/state.json';
const GB_BYTES = 1073741824;

function shquote(s) {
\treturn "'" + replace(s + '', "'", "'\\\\''") + "'";
}

function run(cmd) {
\treturn system(cmd);
}

function capture(cmd) {
\tlet p = popen(cmd, 'r');
\tif (!p) return '';
\tlet out = p.read('all') || '';
\tp.close();
\treturn out;
}

let last_cfg_mtime = -1;
let cached_cfg = null;
function load_config() {
\tlet st = stat('/etc/config/quotamgr');
\tlet mt = st ? st.mtime : 0;
\tif (cached_cfg && mt == last_cfg_mtime) return cached_cfg;
\tlast_cfg_mtime = mt;
\tlet c = cursor();
\tcached_cfg = {
\t\tenabled: (c.get('quotamgr', 'main', 'enabled') || '1') == '1',
\t\tmode: c.get('quotamgr', 'main', 'mode') || 'router',
\t\tbundle_gb: + (c.get('quotamgr', 'main', 'bundle_gb') || 140),
\t\trenew_day: + (c.get('quotamgr', 'main', 'renew_day') || 1),
\t\tblock_new: (c.get('quotamgr', 'main', 'block_new_devices') || '1') == '1',
\t\tenable_qos: (c.get('quotamgr', 'main', 'enable_qos') || '1') == '1',
\t\tgaming_priority: (c.get('quotamgr', 'main', 'gaming_priority') || '1') == '1',
\t\tlan_if: c.get('quotamgr', 'main', 'lan_if') || 'br-lan',
\t\tadblock: (c.get('quotamgr', 'main', 'adblock') || '0') == '1',
\t\tadultblock: (c.get('quotamgr', 'main', 'adultblock') || '0') == '1',
\t\tgambleblock: (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1',
\t\tforce_dns: (c.get('quotamgr', 'main', 'force_dns') || '0') == '1'
\t};
\treturn cached_cfg;
}

function default_state() {
\tlet now = localtime();
\tlet ymd = sprintf('%04d-%02d-%02d', now.year, now.mon, now.mday);
\tlet ym = sprintf('%04d-%02d', now.year, now.mon);
\treturn {
\t\tlast_day: ymd,
\t\tlast_month: ym,
\t\tusers: {},
\t\tdevices: {},
\t\tcustom_domains: [],
\t\tlogs: []
\t};
}

function load_state() {
\tlet raw = readfile(RAM_STATE) || readfile(FLASH_STATE);
\tif (!raw) return default_state();
\tlet parsed = null;
\ttry { parsed = json(raw); } catch (e) { parsed = null; }
\tif (!parsed || type(parsed) != 'object') return default_state();
\tparsed.users = parsed.users || {};
\tparsed.devices = parsed.devices || {};
\tparsed.custom_domains = parsed.custom_domains || [];
\tparsed.logs = parsed.logs || [];
\treturn parsed;
}

function push_log(st, ev, d, note) {
\tlet now = localtime();
\tlet ts = sprintf('%04d-%02d-%02d %02d:%02d:%02d', now.year, now.mon, now.mday, now.hour, now.min, now.sec);
\tst.logs = st.logs || [];
\tunshift(st.logs, {
\t\tts: ts,
\t\tev: ev,
\t\tmac: d.mac,
\t\tip: d.ip || '',
\t\thost: d.hostname || d.mac,
\t\tunknown: (!d.user_id),
\t\tnote: note || ''
\t});
\twhile (length(st.logs) > 50) pop(st.logs);
}

let last_ram_mtime = 0;
function save_ram_state(st) {
\twritefile(RAM_STATE, sprintf('%J', st));
\tlet info = stat(RAM_STATE);
\tif (info) last_ram_mtime = info.mtime;
}

function flush_flash_state(st) {
\twritefile(FLASH_STATE, sprintf('%J', st));
}

let nft_ready = false;
function nft_batch(lines) {
\tif (length(lines) == 0) return true;
\tlet p = popen('nft -f - 2>/dev/null', 'w');
\tif (!p) return false;
\tp.write(join('\\n', lines) + '\\n');
\treturn p.close() === 0;
}

function ensure_nft_base(mode) {
\tif (nft_ready) return;
\tlet check = run('nft list table inet quota_mgr >/dev/null 2>&1');
\tif (check !== 0) {
\t\tnft_batch([
\t\t\t'add table inet quota_mgr',
\t\t\t'add set inet quota_mgr blocked_ips { type ipv4_addr; }',
\t\t\t'add set inet quota_mgr blocked_macs { type ether_addr; }',
\t\t\t'add chain inet quota_mgr forward_hook { type filter hook forward priority -5; policy accept; }',
\t\t\t'add rule inet quota_mgr forward_hook ip saddr @blocked_ips drop',
\t\t\t'add rule inet quota_mgr forward_hook ip daddr @blocked_ips drop',
\t\t\t'add rule inet quota_mgr forward_hook ether saddr @blocked_macs drop'
\t\t]);
\t}
\tif (mode == 'ap') {
\t\tlet bcheck = run('nft list table bridge quota_bridge >/dev/null 2>&1');
\t\tif (bcheck !== 0) {
\t\t\tnft_batch([
\t\t\t\t'add table bridge quota_bridge',
\t\t\t\t'add set bridge quota_bridge blocked_macs { type ether_addr; }',
\t\t\t\t'add chain bridge quota_bridge forward_hook { type filter hook forward priority -5; policy accept; }',
\t\t\t\t'add rule bridge quota_bridge forward_hook ether saddr @blocked_macs drop',
\t\t\t\t'add rule bridge quota_bridge forward_hook ether daddr @blocked_macs drop'
\t\t\t]);
\t\t}
\t}
\tnft_ready = true;
}

function discover_devices(state, lan_if) {
\tlet now_ts = time();
\tlet seen = {};
\tlet leases = readfile('/tmp/dhcp.leases');
\tif (leases) {
\t\tfor (let line in split(leases, '\\n')) {
\t\t\tlet parts = split(trim(line), /\\s+/);
\t\t\tif (length(parts) >= 4) {
\t\t\t\tlet mac = lc(parts[1]);
\t\t\t\tlet ip = parts[2];
\t\t\t\tlet host = (parts[3] && parts[3] != '*') ? parts[3] : ('Device-' + substr(mac, 12));
\t\t\t\tseen[mac] = { ip: ip, hostname: host };
\t\t\t}
\t\t}
\t}
\tlet neigh = capture('ip -4 neigh show dev ' + shquote(lan_if) + ' 2>/dev/null');
\tfor (let line in split(neigh, '\\n')) {
\t\tlet m = match(line, /^([0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+)\\s+lladdr\\s+([0-9a-fA-F:]{17})\\s+(\\S+)/);
\t\tif (m) {
\t\t\tlet ip = m[1];
\t\t\tlet mac = lc(m[2]);
\t\t\tlet st = m[3];
\t\t\tif (st == 'FAILED') continue;
\t\t\tif (!seen[mac]) {
\t\t\t\tseen[mac] = { ip: ip, hostname: 'Device-' + substr(mac, 12) };
\t\t\t} else if (!seen[mac].ip) {
\t\t\t\tseen[mac].ip = ip;
\t\t\t}
\t\t}
\t}
\tfor (let mac, info in seen) {
\t\tif (!state.devices[mac]) {
\t\t\tstate.devices[mac] = {
\t\t\t\tmac: mac,
\t\t\t\tip: info.ip,
\t\t\t\thostname: info.hostname,
\t\t\t\tuser_id: null,
\t\t\t\tused_bytes: 0,
\t\t\t\tdaily_used_bytes: 0,
\t\t\t\tlast_up_bytes: 0,
\t\t\t\tlast_down_bytes: 0,
\t\t\t\tlive_down_bps: 0,
\t\t\t\tlive_up_bps: 0,
\t\t\t\tlimit_down_mbps: 0,
\t\t\t\tlimit_up_mbps: 0,
\t\t\t\tpaused: false,
\t\t\t\tblocked: false,
\t\t\t\tonline: true,
\t\t\t\tlast_seen: now_ts
\t\t\t};
\t\t\tpush_log(state, 'connect', state.devices[mac], 'اتصال جهاز جديد');
\t\t} else {
\t\t\tlet d = state.devices[mac];
\t\t\tlet was_offline = !d.online;
\t\t\td.ip = info.ip;
\t\t\tif (info.hostname && substr(d.hostname, 0, 7) == 'Device-') {
\t\t\t\td.hostname = info.hostname;
\t\t\t}
\t\t\td.online = true;
\t\t\td.last_seen = now_ts;
\t\t\tif (was_offline) push_log(state, 'connect', d, 'إعادة اتصال بالشبكة');
\t\t}
\t}
\tfor (let mac, d in state.devices) {
\t\tif (d.online && !seen[mac] && (now_ts - (d.last_seen || 0) > 120)) {
\t\t\td.online = false;
\t\t\td.live_down_bps = 0;
\t\t\td.live_up_bps = 0;
\t\t\tpush_log(state, 'disconnect', d, 'انقطاع الاتصال');
\t\t}
\t}
}

function read_nft_counters(mode) {
\tlet tbl = (mode == 'ap') ? 'bridge quota_bridge' : 'inet quota_mgr';
\tlet raw = capture('nft -j list chain ' + tbl + ' forward_hook 2>/dev/null');
\tlet counts = {};
\tif (!raw) return counts;
\tlet parsed = null;
\ttry { parsed = json(raw); } catch (e) { return counts; }
\tif (!parsed || !parsed.nftables) return counts;
\tfor (let item in parsed.nftables) {
\t\tlet r = item.rule;
\t\tif (!r || !r.comment || !r.expr) continue;
\t\tlet cbytes = null;
\t\tfor (let ex in r.expr) {
\t\t\tif (ex.counter && ex.counter.bytes != null) {
\t\t\t\tcbytes = +ex.counter.bytes;
\t\t\t}
\t\t}
\t\tif (cbytes != null) {
\t\t\tcounts[r.comment] = { bytes: cbytes, handle: r.handle };
\t\t}
\t}
\treturn counts;
}

function sync_device_rules(state, mode, counts) {
\tlet tbl = (mode == 'ap') ? 'bridge quota_bridge' : 'inet quota_mgr';
\tlet batch = [];
\tfor (let mac, d in state.devices) {
\t\tif (!d.ip && mode != 'ap') continue;
\t\tlet c_up = 'qm:' + mac + ':up';
\t\tlet c_dn = 'qm:' + mac + ':dn';
\t\tif (!counts[c_up]) {
\t\t\tlet expr = (mode == 'ap') ? ('ether saddr ' + mac) : ('ip saddr ' + d.ip);
\t\t\tpush(batch, 'add rule ' + tbl + ' forward_hook ' + expr + ' counter comment "' + c_up + '"');
\t\t}
\t\tif (!counts[c_dn]) {
\t\t\tlet expr = (mode == 'ap') ? ('ether daddr ' + mac) : ('ip daddr ' + d.ip);
\t\t\tpush(batch, 'add rule ' + tbl + ' forward_hook ' + expr + ' counter comment "' + c_dn + '"');
\t\t}
\t}
\tif (length(batch) > 0) nft_batch(batch);
}

let last_block_sig = '';
function sync_blocked_sets(cfg, blocked_ips, blocked_macs) {
\tlet sig = cfg.mode + '|' + join(',', blocked_ips) + '|' + join(',', blocked_macs);
\tif (sig == last_block_sig) return;
\tlast_block_sig = sig;
\tlet batch = [
\t\t'flush set inet quota_mgr blocked_ips',
\t\t'flush set inet quota_mgr blocked_macs'
\t];
\tif (length(blocked_ips) > 0) {
\t\tpush(batch, 'add element inet quota_mgr blocked_ips { ' + join(', ', blocked_ips) + ' }');
\t}
\tif (length(blocked_macs) > 0) {
\t\tpush(batch, 'add element inet quota_mgr blocked_macs { ' + join(', ', blocked_macs) + ' }');
\t}
\tif (cfg.mode == 'ap') {
\t\tpush(batch, 'flush set bridge quota_bridge blocked_macs');
\t\tif (length(blocked_macs) > 0) {
\t\t\tpush(batch, 'add element bridge quota_bridge blocked_macs { ' + join(', ', blocked_macs) + ' }');
\t\t}
\t}
\tnft_batch(batch);
}

function update_usage_and_quotas(state, cfg, counts, elapsed) {
\tlet now = localtime();
\tlet ymd = sprintf('%04d-%02d-%02d', now.year, now.mon, now.mday);
\tlet ym = sprintf('%04d-%02d', now.year, now.mon);

\tif (state.last_day != ymd) {
\t\tfor (let mac, d in state.devices) d.daily_used_bytes = 0;
\t\tstate.last_day = ymd;
\t}
\tif (now.mday == cfg.renew_day && state.last_month != ym) {
\t\tfor (let mac, d in state.devices) {
\t\t\td.used_bytes = 0;
\t\t\td.daily_used_bytes = 0;
\t\t}
\t\tstate.last_month = ym;
\t}

\tfor (let mac, d in state.devices) {
\t\tlet up_entry = counts['qm:' + mac + ':up'];
\t\tlet dn_entry = counts['qm:' + mac + ':dn'];
\t\tlet up_cur = up_entry ? up_entry.bytes : (d.last_up_bytes || 0);
\t\tlet dn_cur = dn_entry ? dn_entry.bytes : (d.last_down_bytes || 0);

\t\tlet dup = (up_cur >= (d.last_up_bytes || 0)) ? (up_cur - (d.last_up_bytes || 0)) : up_cur;
\t\tlet ddn = (dn_cur >= (d.last_down_bytes || 0)) ? (dn_cur - (d.last_down_bytes || 0)) : dn_cur;

\t\td.last_up_bytes = up_cur;
\t\td.last_down_bytes = dn_cur;
\t\td.used_bytes = (d.used_bytes || 0) + dup + ddn;
\t\td.daily_used_bytes = (d.daily_used_bytes || 0) + dup + ddn;
\t\td.live_up_bps = elapsed > 0 ? int((dup * 8) / elapsed) : 0;
\t\td.live_down_bps = elapsed > 0 ? int((ddn * 8) / elapsed) : 0;
\t}

\tlet user_used = {};
\tlet user_daily = {};
\tfor (let uid, u in state.users) {
\t\tuser_used[uid] = 0;
\t\tuser_daily[uid] = 0;
\t}
\tfor (let mac, d in state.devices) {
\t\tif (d.user_id && state.users[d.user_id]) {
\t\t\tuser_used[d.user_id] += (d.used_bytes || 0);
\t\t\tuser_daily[d.user_id] += (d.daily_used_bytes || 0);
\t\t}
\t}

\tlet total_bundle_bytes = cfg.bundle_gb * GB_BYTES;
\tlet fixed_alloc = 0;
\tlet equal_users = [];
\tfor (let uid, u in state.users) {
\t\tif (u.allocation_mode == 'fixed') {
\t\t\tfixed_alloc += ((u.fixed_gb || 0) * GB_BYTES);
\t\t} else {
\t\t\tpush(equal_users, uid);
\t\t}
\t}
\tlet remaining_pool = total_bundle_bytes - fixed_alloc;
\tif (remaining_pool < 0) remaining_pool = 0;
\tlet equal_share = length(equal_users) > 0 ? (remaining_pool / length(equal_users)) : 0;

\tlet blocked_ips = [];
\tlet blocked_macs = [];

\tfor (let mac, d in state.devices) {
\t\tlet should_block = false;
\t\tif (d.blocked || d.paused) {
\t\t\tshould_block = true;
\t\t} else if (!d.user_id || !state.users[d.user_id]) {
\t\t\tif (cfg.block_new) should_block = true;
\t\t} else {
\t\t\tlet u = state.users[d.user_id];
\t\t\tlet quota = (u.allocation_mode == 'fixed') ? ((u.fixed_gb || 0) * GB_BYTES) : equal_share;
\t\t\tif ((user_used[d.user_id] || 0) >= quota) should_block = true;
\t\t\tif ((u.daily_cap_gb || 0) > 0 && (user_daily[d.user_id] || 0) >= (u.daily_cap_gb * GB_BYTES)) should_block = true;
\t\t}
\t\tif (should_block) {
\t\t\tpush(blocked_macs, mac);
\t\t\tif (d.ip) push(blocked_ips, d.ip);
\t\t}
\t}

\tsync_blocked_sets(cfg, blocked_ips, blocked_macs);
}

function tc_batch(lines) {
\tif (length(lines) == 0) return true;
\tlet p = popen('tc -batch - 2>/dev/null', 'w');
\tif (!p) return false;
\tp.write(join('\\n', lines) + '\\n');
\treturn p.close() === 0;
}

const has_tc = (run('command -v tc >/dev/null 2>&1') === 0);
let last_tc_sig = '';
let last_nft_lim_sig = '';
function sync_nft_ratelimit(dn_rules, up_rules) {
\tlet sig = join(',', dn_rules) + '|' + join(',', up_rules);
\tif (sig == last_nft_lim_sig) return;
\tlast_nft_lim_sig = sig;
\trun('nft delete table inet quota_limit 2>/dev/null');
\tif (length(dn_rules) == 0 && length(up_rules) == 0) return;
\tlet cmds = [
\t\t'add table inet quota_limit',
\t\t'add chain inet quota_limit forward_lim { type filter hook forward priority -2; policy accept; }'
\t];
\tfor (let entry in dn_rules) {
\t\tlet p = split(entry, ':');
\t\tlet kbps = int((+p[1]) * 125);
\t\tif (kbps > 0) push(cmds, 'add rule inet quota_limit forward_lim ip daddr ' + p[0] + ' limit rate over ' + kbps + ' kbytes/second drop');
\t}
\tfor (let entry in up_rules) {
\t\tlet p = split(entry, ':');
\t\tlet kbps = int((+p[1]) * 125);
\t\tif (kbps > 0) push(cmds, 'add rule inet quota_limit forward_lim ip saddr ' + p[0] + ' limit rate over ' + kbps + ' kbytes/second drop');
\t}
\tnft_batch(cmds);
}

function sync_tc_shaping(state, cfg) {
\tlet lif = cfg.lan_if;
\tif (!cfg.enable_qos) {
\t\tif (has_tc && last_tc_sig != 'off') {
\t\t\trun('tc qdisc del dev ' + shquote(lif) + ' root 2>/dev/null');
\t\t\trun('tc qdisc del dev ' + shquote(lif) + ' ingress 2>/dev/null');
\t\t\trun('tc qdisc del dev ifb0 root 2>/dev/null');
\t\t\tlast_tc_sig = 'off';
\t\t}
\t\tsync_nft_ratelimit([], []);
\t\treturn;
\t}

\tlet dn_rules = [];
\tlet up_rules = [];
\tlet idx = 10;
\tfor (let mac, d in state.devices) {
\t\tif (!d.ip || d.blocked || d.paused) continue;
\t\tlet d_cap = d.limit_down_mbps || 0;
\t\tlet u_cap = d.limit_up_mbps || 0;
\t\tif (d_cap == 0 && d.user_id && state.users[d.user_id]) {
\t\t\td_cap = state.users[d.user_id].speed_down_mbps || 0;
\t\t}
\t\tif (u_cap == 0 && d.user_id && state.users[d.user_id]) {
\t\t\tu_cap = state.users[d.user_id].speed_up_mbps || 0;
\t\t}
\t\tif (d_cap > 0) push(dn_rules, d.ip + ':' + d_cap + ':' + idx);
\t\tif (u_cap > 0) push(up_rules, d.ip + ':' + u_cap + ':' + idx);
\t\tif (d_cap > 0 || u_cap > 0) idx++;
\t}

\tif (!has_tc) {
\t\tsync_nft_ratelimit(dn_rules, up_rules);
\t\treturn;
\t}

\tlet sig = lif + '|' + (cfg.gaming_priority ? '1' : '0') + '|' + join(',', dn_rules) + '|' + join(',', up_rules);
\tif (sig == last_tc_sig) return;
\tlast_tc_sig = sig;

\trun('tc qdisc del dev ' + shquote(lif) + ' root 2>/dev/null');
\trun('tc qdisc del dev ' + shquote(lif) + ' ingress 2>/dev/null');
\trun('tc qdisc del dev ifb0 root 2>/dev/null');

\tlet cmds = [];
\tif (length(dn_rules) > 0 || cfg.gaming_priority) {
\t\tpush(cmds, 'qdisc add dev ' + lif + ' root handle 1: htb default 999');
\t\tpush(cmds, 'class add dev ' + lif + ' parent 1: classid 1:1 htb rate 1000mbit');
\t\tpush(cmds, 'class add dev ' + lif + ' parent 1:1 classid 1:999 htb rate 950mbit ceil 1000mbit');
\t\tpush(cmds, 'qdisc add dev ' + lif + ' parent 1:999 fq_codel');
\t\tfor (let entry in dn_rules) {
\t\t\tlet p = split(entry, ':');
\t\t\tpush(cmds, 'class add dev ' + lif + ' parent 1:1 classid 1:' + p[2] + ' htb rate ' + p[1] + 'mbit ceil ' + p[1] + 'mbit');
\t\t\tpush(cmds, 'qdisc add dev ' + lif + ' parent 1:' + p[2] + ' fq_codel');
\t\t\tpush(cmds, 'filter add dev ' + lif + ' protocol ip parent 1:0 prio 1 u32 match ip dst ' + p[0] + '/32 flowid 1:' + p[2]);
\t\t}
\t}

\tif (length(up_rules) > 0 && run('ip link set ifb0 up 2>/dev/null') === 0) {
\t\tpush(cmds, 'qdisc add dev ' + lif + ' handle ffff: ingress');
\t\tpush(cmds, 'filter add dev ' + lif + ' parent ffff: protocol ip u32 match u32 0 0 action mirred egress redirect dev ifb0');
\t\tpush(cmds, 'qdisc add dev ifb0 root handle 2: htb default 999');
\t\tpush(cmds, 'class add dev ifb0 parent 2: classid 2:1 htb rate 1000mbit');
\t\tpush(cmds, 'class add dev ifb0 parent 2:1 classid 2:999 htb rate 950mbit ceil 1000mbit');
\t\tpush(cmds, 'qdisc add dev ifb0 parent 2:999 fq_codel');
\t\tfor (let entry in up_rules) {
\t\t\tlet p = split(entry, ':');
\t\t\tpush(cmds, 'class add dev ifb0 parent 2:1 classid 2:' + p[2] + ' htb rate ' + p[1] + 'mbit ceil ' + p[1] + 'mbit');
\t\t\tpush(cmds, 'qdisc add dev ifb0 parent 2:' + p[2] + ' fq_codel');
\t\t\tpush(cmds, 'filter add dev ifb0 parent 2:0 prio 1 u32 match ip src ' + p[0] + '/32 flowid 2:' + p[2]);
\t\t}
\t}
\ttc_batch(cmds);
}

let last_dns_sig = '';
function sync_force_dns(cfg) {
\tlet sig = (cfg.force_dns ? '1' : '0') + '|' + cfg.lan_if;
\tif (sig == last_dns_sig) return;
\tlast_dns_sig = sig;
\trun('nft delete table inet quota_dns 2>/dev/null');
\tif (!cfg.force_dns) return;
\tnft_batch([
\t\t'add table inet quota_dns',
\t\t'add chain inet quota_dns prerouting { type nat hook prerouting priority dstnat; policy accept; }',
\t\t'add rule inet quota_dns prerouting iifname "' + cfg.lan_if + '" udp dport 53 redirect to :53',
\t\t'add rule inet quota_dns prerouting iifname "' + cfg.lan_if + '" tcp dport 53 redirect to :53'
\t]);
}

let state = load_state();
let tick = 0;
let last_tick_ts = time();

while (true) {
\tlet st_info = stat(RAM_STATE);
\tif (st_info && st_info.mtime != last_ram_mtime) {
\t\tstate = load_state();
\t\tlast_ram_mtime = st_info.mtime;
\t}
\tlet cfg = load_config();
\tif (cfg.enabled) {
\t\tlet now_ts = time();
\t\tlet elapsed = now_ts - last_tick_ts;
\t\tif (elapsed <= 0) elapsed = 5;
\t\tlast_tick_ts = now_ts;

\t\tensure_nft_base(cfg.mode);
\t\tsync_force_dns(cfg);
\t\tdiscover_devices(state, cfg.lan_if);
\t\tlet counts = read_nft_counters(cfg.mode);
\t\tsync_device_rules(state, cfg.mode, counts);
\t\tupdate_usage_and_quotas(state, cfg, counts, elapsed);
\t\tsync_tc_shaping(state, cfg);
\t\tsave_ram_state(state);

\t\ttick++;
\t\tif (tick >= 60) {
\t\t\tflush_flash_state(state);
\t\t\ttick = 0;
\t\t}
\t}
\trun('sleep 5');
}
`;

const CGI_API_UCODE = `#!/usr/bin/ucode
'use strict';

import { readfile, writefile, popen, open, unlink, lsdir } from 'fs';
import { cursor } from 'uci';

const RAM_STATE = '/tmp/quotamgr/state.json';
const FLASH_STATE = '/etc/quotamgr/state.json';
const SESS_DIR = '/tmp/quotamgr/sessions/';
const DNS_CONF = '/tmp/dnsmasq.d/quotamgr-block.conf';
const GB_BYTES = 1073741824;

function shquote(s) {
\treturn "'" + replace(s + '', "'", "'\\\\''") + "'";
}

function capture(cmd) {
\tlet p = popen(cmd, 'r');
\tif (!p) return '';
\tlet out = p.read('all') || '';
\tp.close();
\treturn out;
}

function sha256(str) {
\treturn trim(capture('printf %s ' + shquote(str) + ' | sha256sum | cut -d" " -f1'));
}

function respond(code, obj, extra_headers) {
\tprint('Status: ' + code + '\\r\\n');
\tprint('Content-Type: application/json; charset=utf-8\\r\\n');
\tprint('Cache-Control: no-store\\r\\n');
\tif (extra_headers) {
\t\tfor (let h in extra_headers) print(h + '\\r\\n');
\t}
\tprint('\\r\\n');
\tprint(sprintf('%J', obj));
\texit(0);
}

function parse_query(qs) {
\tlet out = {};
\tif (!qs) return out;
\tfor (let pair in split(qs, '&')) {
\t\tlet kv = split(pair, '=');
\t\tif (length(kv) >= 1 && kv[0]) {
\t\t\tout[kv[0]] = kv[1] || '';
\t\t}
\t}
\treturn out;
}

function read_body() {
\tlet clen = +(getenv('CONTENT_LENGTH') || 0);
\tif (clen <= 0) return {};
\tlet f = open('/proc/self/fd/0', 'r');
\tif (!f) return {};
\tlet raw = f.read(clen);
\tf.close();
\tif (!raw) return {};
\ttry { return json(raw); } catch (e) { return {}; }
}

function get_cookie_token() {
\tlet ck = getenv('HTTP_COOKIE') || '';
\tlet m = match(ck, /qm_sess=([a-f0-9]+)/);
\treturn m ? m[1] : null;
}

function is_authed() {
\tlet tok = get_cookie_token();
\tif (!tok) return false;
\tlet s = readfile(SESS_DIR + tok);
\tif (!s) return false;
\tlet ts = +trim(s);
\tif (time() - ts > 86400) {
\t\tunlink(SESS_DIR + tok);
\t\treturn false;
\t}
\treturn true;
}

function load_state() {
\tlet raw = readfile(RAM_STATE) || readfile(FLASH_STATE);
\tif (!raw) return { users: {}, devices: {}, custom_domains: [], local_records: [], logs: [] };
\ttry {
\t\tlet d = json(raw);
\t\td.users = d.users || {};
\t\td.devices = d.devices || {};
\t\td.custom_domains = d.custom_domains || [];
\t\td.local_records = d.local_records || [];
\t\td.logs = d.logs || [];
\t\treturn d;
\t} catch (e) {
\t\treturn { users: {}, devices: {}, custom_domains: [], local_records: [], logs: [] };
\t}
}

function add_log(st, ev, d, note) {
\tlet now = localtime();
\tlet ts = sprintf('%04d-%02d-%02d %02d:%02d:%02d', now.year, now.mon, now.mday, now.hour, now.min, now.sec);
\tst.logs = st.logs || [];
\tunshift(st.logs, { ts: ts, ev: ev, mac: d.mac, ip: d.ip || '', host: d.hostname || d.mac, unknown: (!d.user_id), note: note || '' });
\twhile (length(st.logs) > 50) pop(st.logs);
}

function save_state(st) {
\tlet txt = sprintf('%J', st);
\twritefile(RAM_STATE, txt);
\twritefile(FLASH_STATE, txt);
}

function rebuild_dns(c, st) {
\tlet ad = (c.get('quotamgr', 'main', 'adblock') || '0') == '1';
\tlet adult = (c.get('quotamgr', 'main', 'adultblock') || '0') == '1';
\tlet gamble = (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1';
\tlet preset = c.get('quotamgr', 'main', 'dns_preset') || 'isp';
\tlet d1 = replace(trim(c.get('quotamgr', 'main', 'dns_primary') || ''), /[^0-9.]/g, '');
\tlet d2 = replace(trim(c.get('quotamgr', 'main', 'dns_secondary') || ''), /[^0-9.]/g, '');
\tlet cache = +(c.get('quotamgr', 'main', 'dns_cache') || 1500);
\tlet lines = ['# Managed by QuotaManager', 'cache-size=' + cache];
\tif (preset != 'isp' && d1) {
\t\tpush(lines, 'no-resolv');
\t\tpush(lines, 'server=' + d1);
\t\tif (d2) push(lines, 'server=' + d2);
\t}
\tfor (let rec in (st.local_records || [])) {
\t\tlet h = replace(trim(rec.host || ''), /[^a-zA-Z0-9.-]/g, '');
\t\tlet ip = replace(trim(rec.ip || ''), /[^0-9.]/g, '');
\t\tif (h && ip) push(lines, 'address=/' + h + '/' + ip);
\t}
\tif (ad) {
\t\tfor (let dom in ['doubleclick.net', 'googlesyndication.com', 'adservice.google.com', 'ads.facebook.com', 'taboola.com', 'outbrain.com', 'adnxs.com']) {
\t\t\tpush(lines, 'local=/' + dom + '/');
\t\t}
\t}
\tif (adult) {
\t\tfor (let dom in ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com']) {
\t\t\tpush(lines, 'local=/' + dom + '/');
\t\t}
\t}
\tif (gamble) {
\t\tfor (let dom in ['bet365.com', '1xbet.com', 'melbet.com', 'draftkings.com', 'pokerstars.com']) {
\t\t\tpush(lines, 'local=/' + dom + '/');
\t\t}
\t}
\tfor (let dom in (st.custom_domains || [])) {
\t\tlet clean = replace(trim(dom), /[^a-zA-Z0-9.-]/g, '');
\t\tif (clean) push(lines, 'local=/' + clean + '/');
\t}
\twritefile(DNS_CONF, join('\\n', lines) + '\\n');
\tsystem('/etc/init.d/dnsmasq reload >/dev/null 2>&1');
}

let q = parse_query(getenv('QUERY_STRING'));
let action = q.action || 'state';
let c = cursor();

if (action == 'login') {
\tlet body = read_body();
\tlet saved_hash = c.get('quotamgr', 'main', 'admin_hash') || sha256('admin');
\tif (sha256(body.password || '') != saved_hash) {
\t\trespond(401, { ok: false, error: 'كلمة المرور غير صحيحة' });
\t}
\tfor (let f in (lsdir(SESS_DIR) || [])) unlink(SESS_DIR + f);
\tlet tok = trim(capture('head -c 16 /dev/urandom | hexdump -ve "1/1 \\"%.2x\\""'));
\twritefile(SESS_DIR + tok, '' + time());
\trespond(200, { ok: true, default_pw: (saved_hash == sha256('admin')) }, [
\t\t'Set-Cookie: qm_sess=' + tok + '; Path=/; HttpOnly; SameSite=Lax'
\t]);
}

if (action == 'logout') {
\tlet tok = get_cookie_token();
\tif (tok) unlink(SESS_DIR + tok);
\trespond(200, { ok: true }, ['Set-Cookie: qm_sess=; Path=/; Max-Age=0']);
}

if (!is_authed()) {
\trespond(401, { ok: false, auth_required: true });
}

let st = load_state();

if (action == 'state') {
\tlet meminfo = readfile('/proc/meminfo') || '';
\tlet m_tot = match(meminfo, /MemTotal:\\s+(\\d+)/);
\tlet m_avail = match(meminfo, /MemAvailable:\\s+(\\d+)/);
\tlet df_out = trim(capture("df -k /overlay | tail -n 1 | awk '{print $4}'"));
\trespond(200, {
\t\tok: true,
\t\tsettings: {
\t\t\tbundle_gb: +(c.get('quotamgr', 'main', 'bundle_gb') || 140),
\t\t\trenew_day: +(c.get('quotamgr', 'main', 'renew_day') || 1),
\t\t\tblock_new_devices: (c.get('quotamgr', 'main', 'block_new_devices') || '1') == '1',
\t\t\tenable_qos: (c.get('quotamgr', 'main', 'enable_qos') || '1') == '1',
\t\t\tgaming_priority: (c.get('quotamgr', 'main', 'gaming_priority') || '1') == '1',
\t\t\tmode: c.get('quotamgr', 'main', 'mode') || 'router',
\t\t\tadblock: (c.get('quotamgr', 'main', 'adblock') || '0') == '1',
\t\t\tadultblock: (c.get('quotamgr', 'main', 'adultblock') || '0') == '1',
\t\t\tgambleblock: (c.get('quotamgr', 'main', 'gambleblock') || '0') == '1',
\t\t\tdns_preset: c.get('quotamgr', 'main', 'dns_preset') || 'cloudflare_family',
\t\t\tdns_primary: c.get('quotamgr', 'main', 'dns_primary') || '1.1.1.3',
\t\t\tdns_secondary: c.get('quotamgr', 'main', 'dns_secondary') || '1.0.0.3',
\t\t\tforce_dns: (c.get('quotamgr', 'main', 'force_dns') || '0') == '1',
\t\t\tdns_cache: +(c.get('quotamgr', 'main', 'dns_cache') || 1500)
\t\t},
\t\tsystem: {
\t\t\tmem_total_mb: m_tot ? int(+m_tot[1] / 1024) : 256,
\t\t\tmem_free_mb: m_avail ? int(+m_avail[1] / 1024) : 0,
\t\t\tflash_free_kb: +(df_out || 0)
\t\t},
\t\tstate: st
\t});
}

let body = read_body();

if (action == 'save_user') {
\tlet id = body.id || ('u_' + time());
\tst.users[id] = {
\t\tid: id,
\t\tname: body.name || 'مستخدم',
\t\tallocation_mode: body.allocation_mode == 'fixed' ? 'fixed' : 'equal',
\t\tfixed_gb: +(body.fixed_gb || 0),
\t\tdaily_cap_gb: +(body.daily_cap_gb || 0),
\t\tspeed_down_mbps: +(body.speed_down_mbps || 0),
\t\tspeed_up_mbps: +(body.speed_up_mbps || 0)
\t};
\tsave_state(st);
\trespond(200, { ok: true, id: id });
}

if (action == 'delete_user') {
\tlet id = body.id;
\tif (id && st.users[id]) {
\t\tdelete st.users[id];
\t\tfor (let mac, d in st.devices) {
\t\t\tif (d.user_id == id) d.user_id = null;
\t\t}
\t\tsave_state(st);
\t}
\trespond(200, { ok: true });
}

if (action == 'device_action') {
\tlet mac = lc(body.mac || '');
\tlet d = st.devices[mac];
\tif (!d) respond(404, { ok: false, error: 'الجهاز غير موجود' });
\tlet op = body.op;
\tif (op == 'assign') d.user_id = body.user_id || null;
\telse if (op == 'block') { d.blocked = true; add_log(st, 'disconnect', d, 'حظر يدوي'); }
\telse if (op == 'unblock') { d.blocked = false; d.paused = false; add_log(st, 'connect', d, 'فك الحظر'); }
\telse if (op == 'pause') d.paused = true;
\telse if (op == 'unpause') d.paused = false;
\telse if (op == 'set_limit') {
\t\td.limit_down_mbps = +(body.limit_down_mbps || 0);
\t\td.limit_up_mbps = +(body.limit_up_mbps || 0);
\t} else if (op == 'kick') {
\t\td.paused = true;
\t\tadd_log(st, 'disconnect', d, 'طرد فوري');
\t\tlet ifs = split(trim(capture("iw dev | awk '$1==\\"Interface\\"{print $2}'")), '\\n');
\t\tfor (let wif in ifs) {
\t\t\tif (wif) system('iw dev ' + shquote(wif) + ' station del ' + shquote(mac) + ' 2>/dev/null');
\t\t}
\t}
\tsave_state(st);
\trespond(200, { ok: true });
}

if (action == 'clear_logs') {
\tst.logs = [];
\tsave_state(st);
\trespond(200, { ok: true });
}

if (action == 'update_settings') {
\tif (body.bundle_gb != null) c.set('quotamgr', 'main', 'bundle_gb', '' + (+body.bundle_gb));
\tif (body.renew_day != null) c.set('quotamgr', 'main', 'renew_day', '' + (+body.renew_day));
\tif (body.block_new_devices != null) c.set('quotamgr', 'main', 'block_new_devices', body.block_new_devices ? '1' : '0');
\tif (body.enable_qos != null) c.set('quotamgr', 'main', 'enable_qos', body.enable_qos ? '1' : '0');
\tif (body.gaming_priority != null) c.set('quotamgr', 'main', 'gaming_priority', body.gaming_priority ? '1' : '0');
\tif (body.adblock != null) c.set('quotamgr', 'main', 'adblock', body.adblock ? '1' : '0');
\tif (body.adultblock != null) c.set('quotamgr', 'main', 'adultblock', body.adultblock ? '1' : '0');
\tif (body.gambleblock != null) c.set('quotamgr', 'main', 'gambleblock', body.gambleblock ? '1' : '0');
\tif (body.dns_preset != null) c.set('quotamgr', 'main', 'dns_preset', '' + body.dns_preset);
\tif (body.dns_primary != null) c.set('quotamgr', 'main', 'dns_primary', '' + body.dns_primary);
\tif (body.dns_secondary != null) c.set('quotamgr', 'main', 'dns_secondary', '' + body.dns_secondary);
\tif (body.force_dns != null) c.set('quotamgr', 'main', 'force_dns', body.force_dns ? '1' : '0');
\tif (body.dns_cache != null) c.set('quotamgr', 'main', 'dns_cache', '' + (+body.dns_cache));
\tif (body.new_password && length(body.new_password) >= 4) {
\t\tc.set('quotamgr', 'main', 'admin_hash', sha256(body.new_password));
\t}
\tc.save('quotamgr');
\tc.commit('quotamgr');
\tif (body.custom_domains != null) st.custom_domains = body.custom_domains;
\tif (body.local_records != null) st.local_records = body.local_records;
\tif (body.custom_domains != null || body.local_records != null) save_state(st);
\trebuild_dns(c, st);
\trespond(200, { ok: true });
}

if (action == 'reset_cycle') {
\tfor (let mac, d in st.devices) {
\t\td.used_bytes = 0;
\t\td.daily_used_bytes = 0;
\t}
\tsave_state(st);
\trespond(200, { ok: true });
}

respond(400, { ok: false, error: 'طلب غير معروف' });
`;

const ROUTER_HTML_UI = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QuotaManager — OpenWrt</title>
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
  <h2 style="margin-top:0">دخول مدير الشبكة</h2>
  <p class="muted">راوتر OpenWrt — كلمة المرور الافتراضية: admin</p>
  <input id="pw" type="password" placeholder="كلمة المرور" style="width:100%;margin:12px 0">
  <button class="pri" style="width:100%" onclick="doLogin()">دخول</button>
  <p id="lerr" style="color:#ef4444;font-size:12px"></p>
</div>
<div id="app" class="hide">
  <header>
    <div class="brand">QuotaManager · OpenWrt</div>
    <div class="tabs">
      <button class="act" onclick="tab('ov',this)">نظرة عامة</button>
      <button onclick="tab('us',this)">المستخدمون</button>
      <button onclick="tab('dn',this)">DNS</button>
      <button onclick="tab('lg',this)">سجلات النشاط</button>
      <button onclick="tab('st',this)">الإعدادات</button>
    </div>
    <div class="row">
      <button id="tbtn" onclick="toggleTheme()">الوضع الليلي</button>
      <button onclick="logout()">خروج</button>
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
          <select id="um"><option value="equal">تقسيم متساوي</option><option value="fixed">حصة ثابتة GB</option></select>
          <input id="ug" type="number" placeholder="GB" style="width:80px">
          <input id="ud" type="number" placeholder="سقف يومي GB" style="width:110px">
          <input id="uspd" type="number" placeholder="السرعة Mbps" style="width:110px">
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
        <strong>إعدادات خوادم DNS والحماية (dnsmasq)</strong>
        <div class="row" style="margin-top:12px">
          <select id="dp" onchange="pickDnsPreset()">
            <option value="cloudflare_family">Cloudflare Family (1.1.1.3)</option>
            <option value="cloudflare">Cloudflare (1.1.1.1)</option>
            <option value="adguard">AdGuard DNS (94.140.14.14)</option>
            <option value="quad9">Quad9 (9.9.9.9)</option>
            <option value="google">Google (8.8.8.8)</option>
            <option value="isp">DNS مزود الخدمة</option>
            <option value="custom">مخصص</option>
          </select>
          <input id="d1" dir="ltr" placeholder="Primary DNS" style="width:130px">
          <input id="d2" dir="ltr" placeholder="Secondary DNS" style="width:130px">
          <select id="dc"><option value="500">Cache 500</option><option value="1500">Cache 1500</option><option value="3000">Cache 3000</option></select>
          <label><input id="dfd" type="checkbox"> إجبار DNS (Port 53)</label>
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
          <label><input id="sqos" type="checkbox"> تفعيل QoS وتخفيض Ping</label>
        </div>
        <div class="row" style="margin-top:12px">
          <input id="spw" type="password" placeholder="تغيير كلمة المرور (اختياري)">
          <button class="pri" onclick="saveSettings()">حفظ الإعدادات</button>
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
async function doLogin(){const res=await api('login',{password:document.getElementById('pw').value});if(res.ok){load();}else{document.getElementById('lerr').textContent=res.error||'خطأ';}}
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
  let totUsed=0;Object.values(st.devices).forEach(d=>totUsed+=d.used_bytes||0);
  const rem=Math.max(0,cfg.bundle_gb*GB-totUsed),pct=Math.min(100,(totUsed/(cfg.bundle_gb*GB||1))*100);
  document.getElementById('kpis').innerHTML=\`
    <div class="card"><div class="muted">إجمالي الباقة</div><div class="num">\${cfg.bundle_gb} GB</div><div class="bar"><div style="width:\${pct}%"></div></div></div>
    <div class="card"><div class="muted">المستهلك</div><div class="num">\${fmtG(totUsed)}</div></div>
    <div class="card"><div class="muted">المتبقي</div><div class="num">\${fmtG(rem)}</div></div>
    <div class="card"><div class="muted">الأجهزة النشطة</div><div class="num">\${Object.values(st.devices).filter(d=>d.online).length} / \${Object.keys(st.devices).length}</div></div>\`;
  document.getElementById('sysinfo').textContent='RAM متاحة: '+sys.mem_free_mb+'/'+sys.mem_total_mb+' MB · Flash متاح: '+Math.round(sys.flash_free_kb/1024)+' MB';
  const uopts=['<option value="">غير معين</option>'].concat(Object.values(st.users).map(u=>\`<option value="\${u.id}">\${u.name}</option>\`)).join('');
  document.getElementById('devs').innerHTML=Object.values(st.devices).map(d=>{
    const status=d.blocked?'محظور':d.paused?'متوقف مؤقتاً':(!d.user_id&&cfg.block_new_devices)?'محظور (جهاز جديد)':'متصل';
    const usr=d.user_id?st.users[d.user_id]:null;
    const effD=d.limit_down_mbps>0?d.limit_down_mbps:(usr?usr.speed_down_mbps||0:0);
    const effU=d.limit_up_mbps>0?d.limit_up_mbps:(usr?usr.speed_up_mbps||0:0);
    const capTxt=(effD>0||effU>0)?('سقف: '+(effD||'مفتوح')+'/'+(effU||'مفتوح')+'M'):'سقف: مفتوح';
    const spdCell=EDIT_MAC===d.mac
      ?\`<div class="row"><input id="ed_d" type="number" min="0" value="\${d.limit_down_mbps||0}" style="width:58px" title="تحميل Mbps"><input id="ed_u" type="number" min="0" value="\${d.limit_up_mbps||0}" style="width:58px" title="رفع Mbps"><button class="pri" onclick="saveLim('\${d.mac}')">حفظ</button><button onclick="EDIT_MAC=null;render()">×</button></div><div class="row" style="margin-top:4px"><button onclick="setLim('\${d.mac}',2,1)">2M</button><button onclick="setLim('\${d.mac}',5,2)">5M</button><button onclick="setLim('\${d.mac}',10,3)">10M</button><button onclick="setLim('\${d.mac}',0,0)">مفتوح</button></div>\`
      :\`<div>↓\${fmtS(d.live_down_bps||0)}</div><div class="muted">\${capTxt}</div>\`;
    return \`<tr><td><b>\${d.hostname}</b><div class="muted">\${d.mac} · \${d.ip||'-'}</div></td>
    <td><select onchange="devOp('\${d.mac}','assign',{user_id:this.value})">\${uopts.replace('value="'+d.user_id+'"','value="'+d.user_id+'" selected')}</select></td>
    <td class="num" style="font-size:13px">\${fmtG(d.used_bytes||0)}</td>
    <td class="num" style="font-size:13px">\${spdCell}</td>
    <td>\${status}</td>
    <td class="row">
      <button onclick="devOp('\${d.mac}',d_act('\${d.blocked}','\${d.paused}'))">\${(d.blocked||d.paused)?'تشغيل':'إيقاف'}</button>
      <button onclick="EDIT_MAC='\${d.mac}';render()">السرعة</button>
      <button class="dng" onclick="devOp('\${d.mac}','kick',{})">طرد</button>
    </td></tr>\`;
  }).join('');
  let fixSum=0,eqCnt=0;Object.values(st.users).forEach(u=>{if(u.allocation_mode=='fixed')fixSum+=u.fixed_gb*GB;else eqCnt++;});
  const eqShare=eqCnt?Math.max(0,cfg.bundle_gb*GB-fixSum)/eqCnt:0;
  document.getElementById('users').innerHTML=Object.values(st.users).map(u=>{
    let uUsed=0;Object.values(st.devices).forEach(d=>{if(d.user_id==u.id)uUsed+=d.used_bytes||0;});
    const q=u.allocation_mode=='fixed'?u.fixed_gb*GB:eqShare;
    return \`<tr><td><b>\${u.name}</b></td><td>\${u.allocation_mode=='fixed'?'ثابت':'متساوي'}</td><td class="num" style="font-size:13px">\${fmtG(uUsed)} / \${fmtG(q)}</td><td>\${u.speed_down_mbps?u.speed_down_mbps+' Mbps':'مفتوح'}</td><td><button class="dng" onclick="delUser('\${u.id}')">حذف</button></td></tr>\`;
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
    return \`<tr><td class="num" style="font-size:12px" dir="ltr">\${l.ts}</td>
    <td>\${l.ev==='connect'?'اتصال':'فصل'}</td>
    <td><b>\${l.host}</b><div class="muted">\${l.mac} · \${l.ip||'-'}</div></td>
    <td>\${unk?'<span style="color:#d97706">جهاز غريب</span> · ':''}\${l.note||''}</td>
    <td>\${dv?(dv.blocked?\`<button onclick="devOp('\${l.mac}','unblock',{})">فك الحظر</button>\`:\`<button class="dng" onclick="devOp('\${l.mac}','block',{})">حظر</button>\`):'-'}</td></tr>\`;
  }).join(''):'<tr><td colspan="5" class="muted">لا توجد سجلات نشاط بعد</td></tr>';
  document.getElementById('dp').value=cfg.dns_preset||'cloudflare_family';
  document.getElementById('d1').value=cfg.dns_primary||'';document.getElementById('d2').value=cfg.dns_secondary||'';
  document.getElementById('dc').value=String(cfg.dns_cache||1500);document.getElementById('dfd').checked=!!cfg.force_dns;
  document.getElementById('sad').checked=cfg.adblock;document.getElementById('sadu').checked=cfg.adultblock;document.getElementById('sgam').checked=cfg.gambleblock;
  const doms=(st.custom_domains||[]).map(d=>\`\${d} <a href="#" onclick="delDom('\${d}');return false" style="color:#ef4444">×</a>\`).join(' · ');
  const recs=(st.local_records||[]).map(r=>\`\${r.host}→\${r.ip} <a href="#" onclick="delRec('\${r.host}');return false" style="color:#ef4444">×</a>\`).join(' · ');
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
async function saveSettings(){await api('update_settings',{bundle_gb:+document.getElementById('sb').value,renew_day:+document.getElementById('sr').value,block_new_devices:document.getElementById('sbn').checked,enable_qos:document.getElementById('sqos').checked,new_password:document.getElementById('spw').value});load();}
async function resetCycle(){if(confirm('تصفير استهلاك الدورة؟')){await api('reset_cycle',{});load();}}
load();setInterval(()=>{if(!document.hidden&&!document.getElementById('app').classList.contains('hide')&&!EDIT_MAC)load();},6000);
</script>
</body>
</html>
`;

function computeSimpleSha256Hint(pw: string): string {
  // In the OpenWrt installer script itself, sha256sum is computed natively at install time!
  // We keep a safe placeholder marker replaced by printf|sha256sum inside install_openwrt.sh
  return pw;
}

function compactBundleText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n') + '\n';
}

export function generateOpenWrtFiles(cfg: OpenWrtBuildConfig): GeneratedOpenWrtFile[] {
  const daemonCode = compactBundleText(QUOTAMGRD_UCODE);
  const cgiCode = compactBundleText(CGI_API_UCODE);
  const htmlCode = compactBundleText(ROUTER_HTML_UI);
  const uciConfig = UCI_CONFIG_TEMPLATE
    .replace('__PORT__', String(cfg.dashboardPort))
    .replace('__MODE__', cfg.operationMode)
    .replace('__BUNDLE_GB__', String(cfg.bundleGb))
    .replace('__RENEW_DAY__', String(cfg.renewDay))
    .replace('__BLOCK_NEW__', cfg.blockNewDevices ? '1' : '0')
    .replace('__ENABLE_QOS__', cfg.enableQos ? '1' : '0')
    .replace('__ADMIN_HASH__', `$(printf %s '${cfg.initialPassword.replace(/'/g, "'\\''")}' | sha256sum | cut -d' ' -f1)`);

  const pkgCmd = `# OpenWrt 25.12.6 uses apk
apk update
${cfg.enableQos ? 'apk add tc-tiny kmod-sched-core kmod-ifb 2>/dev/null || apk add tc-bpf kmod-sched-core 2>/dev/null || true' : '# QoS disabled'}
${cfg.operationMode === 'ap' ? 'apk add kmod-nft-bridge 2>/dev/null || true' : ''}`;

  const installerScript = `#!/bin/sh
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
if [ "\${DISTRIB_RELEASE:-}" != "25.12.6" ]; then
  echo "ERROR: Unsupported OpenWrt version (\${DISTRIB_RELEASE:-unknown}). Only OpenWrt 25.12.6 is supported."
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
echo "Free /overlay Flash: \${FREE_KB:-unknown} KB"

# 3. Install minimal optional packages using apk (OpenWrt 25.12.6)
echo "Installing optional packages via apk (OpenWrt 25.12.6)"
apk update || true
${cfg.enableQos ? 'apk add tc-tiny kmod-sched-core kmod-ifb 2>/dev/null || true' : 'echo "Skipping QoS packages"'}
${cfg.operationMode === 'ap' ? 'apk add kmod-nft-bridge 2>/dev/null || true' : ''}

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
ADMIN_HASH=$(printf %s '${cfg.initialPassword.replace(/'/g, "'\\''")}' | sha256sum | cut -d' ' -f1)
cat << EOF_CFG > /etc/config/quotamgr
config global 'main'
\toption enabled '1'
\toption port '${cfg.dashboardPort}'
\toption mode '${cfg.operationMode}'
\toption bundle_gb '${cfg.bundleGb}'
\toption renew_day '${cfg.renewDay}'
\toption block_new_devices '${cfg.blockNewDevices ? '1' : '0'}'
\toption enable_qos '${cfg.enableQos ? '1' : '0'}'
\toption gaming_priority '1'
\toption adblock '0'
\toption adultblock '0'
\toption gambleblock '0'
\toption dns_preset 'cloudflare_family'
\toption dns_primary '1.1.1.3'
\toption dns_secondary '1.0.0.3'
\toption force_dns '0'
\toption dns_cache '1500'
\toption lan_if 'br-lan'
\toption admin_hash '$ADMIN_HASH'
EOF_CFG

# 8. Write /usr/sbin/quotamgrd
cat << 'EOF_DAEMON' > /usr/sbin/quotamgrd
${daemonCode}EOF_DAEMON
chmod +x /usr/sbin/quotamgrd

# 9. Write /www-quota/cgi-bin/api
cat << 'EOF_API' > /www-quota/cgi-bin/api
${cgiCode}EOF_API
chmod +x /www-quota/cgi-bin/api

# 10. Write /www-quota/index.html
cat << 'EOF_HTML' > /www-quota/index.html
${htmlCode}EOF_HTML

# 11. Write /etc/init.d/quotamgr
cat << 'EOF_INIT' > /etc/init.d/quotamgr
${INIT_SCRIPT_TEMPLATE}
EOF_INIT
chmod +x /etc/init.d/quotamgr

# 12. Configure dedicated uhttpd instance on port ${cfg.dashboardPort} (keeps LuCI intact on port 80)
uci -q delete uhttpd.quotamgr || true
uci set uhttpd.quotamgr=uhttpd
uci add_list uhttpd.quotamgr.listen_http="0.0.0.0:${cfg.dashboardPort}"
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
echo " Dashboard URL : http://$LAN_IP:${cfg.dashboardPort}"
echo " Admin Password: ${computeSimpleSha256Hint(cfg.initialPassword)}"
echo "================================================="
`;

  const files: GeneratedOpenWrtFile[] = [
    {
      path: 'install_openwrt.sh',
      description: 'سكربت التثبيت الشامل لإصدار OpenWrt 25.12.6 فقط (يهيئ uhttpd و fw4 و apk تلقائياً)',
      sizeBytes: new TextEncoder().encode(installerScript).length,
      content: installerScript,
    },
    {
      path: '/usr/sbin/quotamgrd',
      description: 'محرك المراقبة والقطع اللحظي وتقسيم السرعة (ucode + nftables + tc-batch)',
      sizeBytes: new TextEncoder().encode(daemonCode).length,
      content: daemonCode,
    },
    {
      path: '/www-quota/cgi-bin/api',
      description: 'واجهة البرمجة الخلفية CGI لخادم uhttpd بدون Python أو FastAPI',
      sizeBytes: new TextEncoder().encode(cgiCode).length,
      content: cgiCode,
    },
    {
      path: '/www-quota/index.html',
      description: 'لوحة تحكم الويب المدمجة باللغة العربية (ملف واحد مضغوط بدون اعتماد على الإنترنت)',
      sizeBytes: new TextEncoder().encode(htmlCode).length,
      content: htmlCode,
    },
    {
      path: '/etc/init.d/quotamgr',
      description: 'ملف خدمة procd للتشغيل التلقائي وحفظ البيانات في الـ Flash عند الإطفاء فقط',
      sizeBytes: new TextEncoder().encode(INIT_SCRIPT_TEMPLATE).length,
      content: INIT_SCRIPT_TEMPLATE,
    },
    {
      path: '/etc/config/quotamgr',
      description: 'ملف الإعدادات القياسي بنظام UCI + حزم apk لإصدار OpenWrt 25.12.6',
      sizeBytes: new TextEncoder().encode(uciConfig).length,
      content: uciConfig + '\n# Package commands (OpenWrt 25.12.6):\n' + pkgCmd,
    },
  ];

  return files;
}
