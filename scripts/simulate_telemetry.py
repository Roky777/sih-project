"""Bounded localhost-only FD001 replay producer using the application's HTTP API."""

import argparse
import json
import time
import urllib.request
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081/api")
    parser.add_argument("--stream")
    parser.add_argument("--ticks", type=int, default=6)
    parser.add_argument("--interval", type=float, default=2)
    args = parser.parse_args()
    if urlparse(args.base_url).hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("This synthetic demo producer is localhost only")
    if not 1 <= args.ticks <= 36 or not 0.5 <= args.interval <= 30:
        raise ValueError("Use 1–36 ticks and an interval between 0.5 and 30 seconds")

    def post(path, payload):
        request = urllib.request.Request(
            args.base_url + path,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "X-Demo-Role": "engineer"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    row = (
        post("/telemetry", {})
        if not args.stream
        else post(f"/telemetry/{args.stream}/control", {"status": "running"})
    )
    identifier = row["id"]
    print(
        json.dumps({"stream": identifier, "provenance": "archived simulated FD001 replay"}),
        flush=True,
    )
    try:
        for _ in range(args.ticks):
            row = post(f"/telemetry/{identifier}/replay", {"count": 5})
            print(
                json.dumps(
                    {
                        "accepted_cycles": row["accepted_cycles"],
                        "status": row["status"],
                        "pipeline": row["process"],
                    }
                ),
                flush=True,
            )
            if row["status"] == "completed":
                break
            time.sleep(args.interval)
    finally:
        if row["status"] != "completed":
            post(f"/telemetry/{identifier}/control", {"status": "paused"})


if __name__ == "__main__":
    main()
