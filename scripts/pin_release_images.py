"""Pin already-built local Linux/amd64 images; never pull or publish an image."""

import argparse
import json
import os
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", required=True)
    parser.add_argument("--web", required=True)
    parser.add_argument("--postgres", default="postgres:17-alpine")
    parser.add_argument("--rabbitmq", default="rabbitmq:4-management-alpine")
    parser.add_argument("--output", type=Path, default=Path(".env.images"))
    args = parser.parse_args()
    pins = []
    for key, tag in (
        ("API", args.api), ("WEB", args.web),
        ("POSTGRES", args.postgres), ("RABBITMQ", args.rabbitmq),
    ):
        record = json.loads(subprocess.check_output(
            ["docker", "image", "inspect", tag], text=True,
        ))[0]
        if record.get("Os") != "linux" or record.get("Architecture") != "amd64":
            parser.error(f"{key} must be built/pulled for Linux amd64 on the target VM")
        pins.append(f"FLEET_{key}_IMAGE={record['Id']}\n")
    # Refuse accidental replacement of the previous release's rollback pins.
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.writelines(pins)
    print(f"Pinned four Linux/amd64 images in {args.output}; no images published.")


if __name__ == "__main__":
    main()
