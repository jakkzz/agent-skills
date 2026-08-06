#!/usr/bin/env python3
"""Read-only local subnet inventory for Pi.

Outputs timestamped Markdown + JSON reports. Uses TCP connect probes and local ARP/DNS;
does not authenticate to devices or change network state.
"""
import argparse, concurrent.futures, ipaddress, json, os, re, socket, ssl, subprocess, sys, urllib.request
from datetime import datetime
from pathlib import Path

COMMON_PORTS = [22, 53, 80, 443, 554, 1883, 1984, 5000, 5353, 8000, 8080, 8081, 8554, 8899, 8971, 37777, 37778]
CAMERA_PORTS = {554, 8000, 8554, 37777, 37778, 1984, 5000, 8971}


def infer_subnet():
    try:
        route = subprocess.run(["route", "-n", "get", "default"], capture_output=True, text=True, timeout=2).stdout
        iface = re.search(r"interface: (\S+)", route)
        if iface:
            out = subprocess.run(["ipconfig", "getifaddr", iface.group(1)], capture_output=True, text=True, timeout=2).stdout.strip()
            ip = ipaddress.ip_address(out)
            if ip.version == 4:
                return str(ipaddress.ip_network(f"{ip}/24", strict=False))
    except Exception:
        pass
    return None


def tcp_check(ip, port, timeout=0.45):
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((str(ip), port))
        return str(ip), port, True
    except Exception:
        return str(ip), port, False
    finally:
        s.close()


def read_arp():
    macs = {}
    try:
        arp = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return macs
    for line in arp.splitlines():
        m = re.search(r"\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+|\(incomplete\))", line, re.I)
        if m and m.group(2) != "(incomplete)":
            macs[m.group(1)] = m.group(2).lower()
    return macs


def rev_dns(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ""


def http_info(ip, port):
    scheme = "https" if port == 443 else "http"
    ctx = ssl._create_unverified_context()
    try:
        req = urllib.request.Request(f"{scheme}://{ip}:{port}/", headers={"User-Agent": "pi-local-scan/1.0"})
        with urllib.request.urlopen(req, timeout=1.5, context=ctx) as r:
            body = r.read(4096).decode("utf-8", "ignore")
            title = ""
            mt = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
            if mt:
                title = " ".join(mt.group(1).split())[:80]
            return {"status": r.status, "server": r.headers.get("Server", "")[:80], "title": title}
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subnet", default=os.environ.get("LOCAL_NETWORK_SUBNET") or infer_subnet())
    ap.add_argument("--ports", default=",".join(map(str, COMMON_PORTS)))
    ap.add_argument("--focus", default="")
    ap.add_argument(
        "--out-dir",
        default=os.environ.get(
            "LOCAL_NETWORK_SCAN_DIR",
            os.path.expanduser("~/.local/share/agent-skills/network-scans"),
        ),
    )
    ap.add_argument("--obsidian", default="")
    args = ap.parse_args()
    if not args.subnet:
        ap.error("unable to infer subnet; pass --subnet or set LOCAL_NETWORK_SUBNET")

    net = ipaddress.ip_network(args.subnet, strict=False)
    ports = [int(p) for p in re.split(r"[, ]+", args.ports.strip()) if p]
    out_dir = Path(os.path.expanduser(args.out_dir)); out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    md_path = out_dir / f"local-subnet-{ts}.md"
    json_path = out_dir / f"local-subnet-{ts}.json"

    ips = list(net.hosts()) if net.prefixlen <= 30 else list(net)
    openmap = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=256) as ex:
        checks = [(ip, p) for ip in ips for p in ports]
        for ip, port, ok in ex.map(lambda x: tcp_check(*x), checks):
            if ok:
                openmap.setdefault(ip, []).append(port)

    macs = read_arp()
    active = sorted(set(openmap) | {ip for ip in macs if ipaddress.ip_address(ip) in net}, key=lambda x: tuple(map(int, x.split('.'))))
    rows = []
    for ip in active:
        row = {"ip": ip, "mac": macs.get(ip, ""), "hostname": rev_dns(ip), "ports": openmap.get(ip, []), "http": {}}
        for p in (80, 443, 5000, 1984, 8000, 8080, 8971):
            if p in row["ports"]:
                hi = http_info(ip, p)
                if hi: row["http"][str(p)] = hi
        rows.append(row)

    dupmac = {}
    for r in rows:
        if r["mac"]: dupmac.setdefault(r["mac"], []).append(r["ip"])
    dupmac = {m: v for m, v in dupmac.items() if len(v) > 1}
    focus_l = args.focus.lower()
    focus_rows = []
    if focus_l:
        try:
            focus_ip = str(ipaddress.ip_address(focus_l))
            focus_rows = [r for r in rows if r["ip"] == focus_ip]
        except Exception:
            focus_rows = [r for r in rows if focus_l in json.dumps(r).lower()]

    data = {"scanned_at": datetime.now().isoformat(), "subnet": str(net), "ports": ports, "devices": rows, "duplicate_macs": dupmac, "focus": args.focus, "focus_matches": focus_rows}
    json_path.write_text(json.dumps(data, indent=2))

    lines = [f"# Local Subnet Scan — {net}", "", f"Scanned: {datetime.now().isoformat(timespec='seconds')}", "", f"Active/ARP-visible entries: **{len(rows)}**", ""]
    if dupmac:
        lines += ["## Duplicate MACs / aliases", ""]
        for m, v in dupmac.items(): lines.append(f"- `{m}` appears at: " + ", ".join(f"`{ip}`" for ip in v))
        lines.append("")
    if focus_l:
        lines += [f"## Focus: `{args.focus}`", ""]
        lines.append("No matching ARP/open-port entry found." if not focus_rows else "\n".join(f"- `{r['ip']}` MAC `{r['mac']}` ports `{','.join(map(str,r['ports']))}`" for r in focus_rows))
        lines.append("")
    cams = [r for r in rows if CAMERA_PORTS.intersection(r["ports"])]
    if cams:
        lines += ["## Camera/NVR/Frigate candidates", ""]
        for r in cams: lines.append(f"- `{r['ip']}` MAC `{r['mac']}` ports `{','.join(map(str,r['ports']))}`")
        lines.append("")
    lines += ["## Devices", "", "| IP | MAC | DNS/hostname | Open ports | HTTP hints |", "|---|---|---|---|---|"]
    for r in rows:
        hints=[]
        for p,h in r["http"].items():
            bits=[]
            if h.get("status"): bits.append(str(h["status"]))
            if h.get("server"): bits.append(h["server"])
            if h.get("title"): bits.append("title=" + h["title"])
            if bits: hints.append(f"{p}: " + ", ".join(bits))
        lines.append(f"| `{r['ip']}` | `{r['mac']}` | `{r['hostname']}` | `{','.join(map(str,r['ports']))}` | {'<br>'.join(hints)} |")
    md_path.write_text("\n".join(lines) + "\n")

    if args.obsidian:
        obs = Path(os.path.expanduser(args.obsidian))
        obs.parent.mkdir(parents=True, exist_ok=True)
        obs.write_text(md_path.read_text())

    print(f"Markdown: {md_path}")
    print(f"JSON: {json_path}")
    if args.obsidian: print(f"Obsidian: {Path(os.path.expanduser(args.obsidian))}")

if __name__ == "__main__":
    main()
