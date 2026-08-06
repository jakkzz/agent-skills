---
name: local-network-scan
description: Rescan a local subnet, identify active LAN devices, camera/NVR ports, duplicate MAC aliases, and stale DHCP/ARP entries. Use when asked to scan a local network, find a missing device or camera, investigate DHCP conflicts, or update a local device inventory.
allowed-tools:
  - bash
  - read
  - write
---

# Local Network Scan

You are a careful LAN inventory operator. Prefer read-only discovery. Do not change router, Frigate, camera, NAS, or Home Assistant configuration from this skill.

## Boundaries

**MAY:** scan the local RFC1918 subnet, probe common TCP ports, read ARP/DNS hints, write timestamped scan reports.

**MAY NOT:** brute-force credentials, log into devices, restart services, change DHCP reservations, alter firewall/router settings, or print passwords embedded in camera URLs.

## Phase 0: Scope

**Entry:** User asks to rescan devices, find a local IP/device, or check for DHCP conflicts.

1. Default subnet: use `LOCAL_NETWORK_SUBNET` when set, otherwise infer it from the default interface. If neither works, ask the user for a CIDR.
2. If the user names a specific IP/MAC/device, include a focused note for it.
3. If the user asks to update Obsidian, write/copy the report into their vault only after the scan completes.

**Exit:** Subnet and any focus target are known.

## Phase 1: Scan

**Entry:** Scope known.

Resolve paths relative to this skill directory, then run:

```bash
python3 scripts/scan-local-subnet.py --subnet <cidr>
```

Options:

```bash
--focus <IP-MAC-or-substring>
--out-dir <report-directory>
--obsidian <optional-note-path>
```

The helper performs TCP connection probes only and reads local ARP/DNS data. It does not authenticate to devices.

**Exit:** Markdown and JSON report paths are printed.

## Phase 2: Interpret

**Entry:** Report exists.

Summarize:

- active/ARP-visible device count
- duplicate MACs / likely aliases
- camera/NVR candidates: ports `554`, `8000`, `8554`, `37777`, `37778`, `1984`, `5000`, `8971`
- focused target status, if any
- stale/conflicting entries: MAC seen but no open ports, duplicate MACs, or router/mesh aliases

**Exit:** User receives a concise scan summary plus report paths.

## Output Format

Respond with:

```markdown
Scan complete: <N> entries

Highlights:
- ...

Focus target:
- ...

Reports:
- Markdown: `<path>`
- JSON: `<path>`
```

## Safety Notes

- ARP can contain stale entries; treat MAC-only hosts with no open ports as "seen recently / not confirmed online".
- Some cameras block ping; an RTSP/HTTP port is stronger evidence than ICMP.
- Duplicate MACs often indicate aliases, bridges, mesh APs, or the same NVR answering on two IPs.
