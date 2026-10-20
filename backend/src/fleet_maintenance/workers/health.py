"""Local process-heartbeat checks; no broker remote-control endpoint is enabled."""

import argparse
import json
import math
import os
import time
from pathlib import Path


def heartbeat_path(component: str) -> Path:
    if component not in {"worker", "outbox"}:
        raise ValueError("Unknown worker component")
    return Path("/tmp") / f"fleet-{component}-heartbeat.json"


def record_heartbeat(component: str) -> None:
    path = heartbeat_path(component)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"pid": os.getpid(), "time": time.time()}))
    temporary.replace(path)


def check_heartbeat(component: str, maximum_age: float = 30) -> bool:
    try:
        data = json.loads(heartbeat_path(component).read_text())
        pid, recorded = data["pid"], data["time"]
        if type(pid) is not int or pid <= 0 or not isinstance(recorded, (int, float)):
            return False
        age = time.time() - recorded
        if not math.isfinite(age) or not 0 <= age <= maximum_age:
            return False
        os.kill(pid, 0)
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("component", choices=["worker", "outbox"])
    args = parser.parse_args()
    raise SystemExit(0 if check_heartbeat(args.component) else 1)


if __name__ == "__main__":
    main()
