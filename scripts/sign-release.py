"""Create the signed, bounded update envelope and electron-updater metadata."""

import base64
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

ROOT = Path(__file__).resolve().parents[1]


def main():
    version = json.loads((ROOT / "desktop/package.json").read_text())["version"]
    if os.environ.get("GITHUB_REF_NAME", f"v{version}") != f"v{version}":
        raise ValueError("tag_version_mismatch")
    policy = json.loads((ROOT / "desktop/electron/update-config.json").read_text())
    key = Ed25519PrivateKey.from_private_bytes(
        base64.b64decode(os.environ["MINI_THRONE_RELEASE_SIGNING_KEY"], validate=True)
    )
    public = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    if base64.b64encode(public).decode() != policy["publicKey"]:
        raise ValueError("release_signing_key_mismatch")
    directory = ROOT / "artifacts"
    names = [
        "Mini-Throne-Setup-x64.exe",
        "Mini-Throne-Setup-x64.exe.blockmap",
        f"mini-throne-plugin-{version}-linux-x86_64-py3.12.zip",
        f"mini-throne-source-{version}.zip",
    ]
    files = {}
    for name in names:
        path = directory / name
        sha256, sha512 = hashlib.sha256(), hashlib.sha512()
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                sha256.update(chunk)
                sha512.update(chunk)
        files[name] = {
            "size": path.stat().st_size,
            "sha256": sha256.hexdigest(),
            "sha512": base64.b64encode(sha512.digest()).decode(),
        }
    manifest = {
        "schema": 1,
        "repository": policy["repository"],
        "version": version,
        "coreRevision": json.loads((ROOT / "release-config.json").read_text())[
            "coreRevision"
        ],
        "files": files,
    }
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    envelope = {
        "manifest": base64.b64encode(raw).decode(),
        "signature": base64.b64encode(key.sign(raw)).decode(),
    }
    (directory / "release-manifest.json").write_text(json.dumps(envelope) + "\n")
    exe = files[names[0]]
    (directory / "latest.yml").write_text(
        f"version: {version}\nfiles:\n  - url: {names[0]}\n    sha512: {exe['sha512']}\n    size: {exe['size']}\npath: {names[0]}\nsha512: {exe['sha512']}\n"
    )
    (directory / "SHA256SUMS.txt").write_text(
        "".join(f"{data['sha256']}  {name}\n" for name, data in files.items())
    )
    print(f"Signed release {version}: {len(files)} artifacts")


if __name__ == "__main__":
    main()
