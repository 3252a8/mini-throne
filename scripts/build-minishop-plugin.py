"""Build a signed portable plugin ZIP; keep its development key in Windows DPAPI."""

from __future__ import annotations

import argparse
import base64
import ctypes
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[1]


class Blob(ctypes.Structure):
    _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def protect(data: bytes, *, decrypt: bool = False) -> bytes:
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    destination = Blob()
    function = (
        ctypes.windll.crypt32.CryptUnprotectData
        if decrypt
        else ctypes.windll.crypt32.CryptProtectData
    )
    if not function(
        ctypes.byref(source), None, None, None, None, 1, ctypes.byref(destination)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(destination.data, destination.size)
    finally:
        ctypes.windll.kernel32.LocalFree(destination.data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--core", type=Path, default=ROOT.parent / "core")
    parser.add_argument("--system", default="linux")
    parser.add_argument("--machine", default="x86_64")
    parser.add_argument("--python", default="3.12")
    args = parser.parse_args()
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=args.core, text=True
    ).strip()
    key_path = (
        Path(os.environ["LOCALAPPDATA"])
        / "Minishop"
        / "signing"
        / "mini-throne-dev.dpapi"
    )
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        private = Ed25519PrivateKey.from_private_bytes(
            protect(key_path.read_bytes(), decrypt=True)
        )
    else:
        private = Ed25519PrivateKey.generate()
        raw = private.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
        key_path.write_bytes(protect(raw))
    public = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    files = {}
    source = ROOT / "minishop-plugin"
    for section in ("backend", "frontend"):
        for path in sorted((source / section).rglob("*")):
            if (
                path.is_file()
                and "__pycache__" not in path.parts
                and path.suffix not in {".pyc", ".pyo"}
            ):
                files[path.relative_to(source).as_posix()] = path.read_bytes()
    manifest = {
        "schema_version": 1,
        "id": "mini-throne",
        "name": "Mini Throne",
        "description": "Windows device authorization, branding and single-use installation packages",
        "version": "0.1.0-alpha.1",
        "publisher": "minishop-3252a8-dev",
        "publisher_public_key": base64.b64encode(public).decode(),
        "publisher_fingerprint": hashlib.sha256(public).hexdigest(),
        "plugin_api": 1,
        "frontend_host_api": 1,
        "core_revision": revision,
        "runtime": {
            "python": args.python,
            "system": args.system,
            "machine": args.machine,
        },
        "backend": {"entry_point": "mini_throne_plugin:plugin"},
        "frontend": {
            "user": {
                "entry": "customer/index.js",
                "styles": ["customer/style.css"],
                "assets": [],
                "pages": [
                    {
                        "id": "connect",
                        "view": "connect",
                        "label": "Mini Throne",
                        "icon": "device",
                        "parent": "devices",
                        "navigation": "section",
                        "order": 100,
                    }
                ],
                "slots": [
                    {
                        "id": "install",
                        "view": "install",
                        "label": "Mini Throne",
                        "target": "user.install.blocks",
                        "order": 10,
                    }
                ],
            }
        },
        "files": {
            name: hashlib.sha256(data).hexdigest() for name, data in files.items()
        },
    }
    canonical = json.dumps(
        manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()
    target = (
        ROOT
        / "artifacts"
        / f"mini-throne-plugin-0.1.0-alpha.1-{args.system}-{args.machine}-py{args.python}.zip"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        archive.writestr("plugin.json", canonical)
        archive.writestr("signatures/ed25519.sig", private.sign(canonical))
    print(
        json.dumps(
            {
                "artifact": str(target),
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                "publisher_fingerprint": manifest["publisher_fingerprint"],
                "core_revision": revision,
            }
        )
    )


if __name__ == "__main__":
    main()
