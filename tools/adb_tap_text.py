#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

DEVICE = None

def run(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result.stdout


def get_device():
    global DEVICE
    if DEVICE:
        return DEVICE
    env_device = os.environ.get("MUSE_DEVICE") or os.environ.get("ANDROID_SERIAL")
    if env_device:
        DEVICE = env_device
        return DEVICE
    result = subprocess.run(["adb", "devices"], stdout=subprocess.PIPE, text=True)
    lines = [l for l in result.stdout.splitlines() if "device" in l and "List" not in l]
    if not lines:
        return None
    DEVICE = lines[0].split()[0]
    return DEVICE


def dump_ui():
    serial = get_device()
    if not serial:
        raise SystemExit("No adb device found")
    subprocess.run(["adb", "-s", serial, "shell", "uiautomator", "dump", "/sdcard/window_dump.xml"], stdout=subprocess.DEVNULL)
    xml = run(["adb", "-s", serial, "shell", "cat", "/sdcard/window_dump.xml"])
    return ET.fromstring(xml)


def find_node(root, text, contains_only=False, res_id=None, res_contains=False):
    if res_id:
        for node in root.iter():
            node_res = node.attrib.get("resource-id")
            if node_res and (node_res == res_id or (res_contains and res_id in node_res)):
                return node
    target = text.lower()
    # Prefer exact text/content-desc matches first unless we only want contains.
    if not contains_only:
        for node in root.iter():
            node_text = node.attrib.get("text")
            content_desc = node.attrib.get("content-desc")
            if node_text and node_text.lower() == target:
                return node
            if content_desc and content_desc.lower() == target:
                return node
    # Fallback to substring match.
    for node in root.iter():
        node_text = node.attrib.get("text")
        content_desc = node.attrib.get("content-desc")
        if node_text and target in node_text.lower():
            return node
        if content_desc and target in content_desc.lower():
            return node
    return None


def parse_bounds(bounds):
    # format: [x1,y1][x2,y2]
    left_top, right_bottom = bounds.split("][")
    x1, y1 = left_top.strip("[").split(",")
    x2, y2 = right_bottom.strip("]").split(",")
    return int(x1), int(y1), int(x2), int(y2)


def tap_center(bounds):
    serial = get_device()
    x1, y1, x2, y2 = parse_bounds(bounds)
    x = (x1 + x2) // 2
    y = (y1 + y2) // 2
    subprocess.run(["adb", "-s", serial, "shell", "input", "tap", str(x), str(y)])


def main():
    parser = argparse.ArgumentParser(description="Tap UI element matching text/content-desc.")
    parser.add_argument("text", nargs="?", help="Text to match")
    parser.add_argument("--text", dest="text_flag", help="Text to match (flag form)")
    parser.add_argument("--res-id", dest="res_id", help="Resource-id to match")
    parser.add_argument("--res-contains", action="store_true", help="Match resource-id by substring")
    parser.add_argument("--wait", dest="wait_ms", type=int, default=500, help="Wait ms after tap")
    parser.add_argument("--retries", type=int, default=3, help="Number of retries")
    parser.add_argument("--contains", action="store_true", help="Use contains match only")
    parser.add_argument("--debug", action="store_true", help="Print available texts when not found")
    args = parser.parse_args()
    text = args.text_flag or args.text
    if not text and not args.res_id:
        print("Usage: adb_tap_text.py <text> [--wait 500] or --res-id <id>")
        sys.exit(1)
    wait_ms = args.wait_ms
    node = None
    for _ in range(max(1, args.retries)):
        root = dump_ui()
        node = find_node(
            root,
            text or "",
            contains_only=args.contains,
            res_id=args.res_id,
            res_contains=args.res_contains
        )
        if node:
            break
        time.sleep(0.4)
    if not node:
        if args.debug or os.environ.get("ADB_TAP_DEBUG") == "1":
            texts = []
            for n in root.iter():
                t = n.attrib.get("text")
                if t:
                    texts.append(t)
            print(f"Available texts: {texts[:20]}")
        print(f"Text not found: {text}")
        sys.exit(2)
    bounds = node.attrib.get("bounds")
    if not bounds:
        print(f"Bounds not found for: {text}")
        sys.exit(3)
    tap_center(bounds)
    time.sleep(wait_ms / 1000.0)

if __name__ == "__main__":
    main()
