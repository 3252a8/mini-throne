"""Publish the Actions-built plugin for Minishop's repository URL installer."""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    version = json.loads((ROOT / "desktop/package.json").read_text())["version"]
    tag = f"v{version}"
    release_commit = git("rev-parse", "HEAD")
    source = ROOT / f"artifacts/mini-throne-plugin-{version}-linux-x86_64-py3.12.zip"
    body = source.read_bytes()
    os.environ["GIT_ASKPASS"] = str(ROOT / "scripts/ci-git-askpass.py")
    os.environ["GIT_TERMINAL_PROMPT"] = "0"
    Path(os.environ["GIT_ASKPASS"]).chmod(0o700)
    git("config", "user.name", "3252a8")
    git("config", "user.email", "241766812+3252a8@users.noreply.github.com")
    git("fetch", "origin", "dev")
    git("switch", "-C", "dev", "origin/dev")
    git("merge-base", "--is-ancestor", release_commit, "HEAD")
    if json.loads((ROOT / "desktop/package.json").read_text())["version"] != version:
        raise RuntimeError("dev_advanced_to_another_version")
    target = ROOT / "packages/mini-throne.zip"
    target.parent.mkdir(exist_ok=True)
    shutil.copyfile(source, target)
    index = {
        "schema_version": 1,
        "artifact": "packages/mini-throne.zip",
        "sha256": hashlib.sha256(body).hexdigest(),
        "version": version,
    }
    (ROOT / "minishop-plugin.json").write_text(json.dumps(index, indent=2) + "\n")
    git("add", "packages/mini-throne.zip", "minishop-plugin.json")
    if git("diff", "--cached", "--name-only"):
        git("commit", "-m", f"build: publish verified plugin package {version}")
    gitlab = "https://gitlab.com/3252a8/mini-throne.git"
    git("push", gitlab, f"refs/tags/{tag}", "HEAD:refs/heads/dev")
    git("push", "origin", "HEAD:refs/heads/dev")
    head = git("rev-parse", "HEAD")
    for remote in (gitlab, "origin"):
        if git("ls-remote", remote, "refs/heads/dev").split()[0] != head:
            raise RuntimeError("mirror_head_mismatch")
    # Release records also remain in parity; binaries are hosted on GitHub.
    payload = {
        "name": f"Mini Throne {version}",
        "tag_name": tag,
        "description": (ROOT / "docs/release-notes.md").read_text(encoding="utf-8"),
        "assets": {
            "links": [
                {
                    "name": "GitHub release assets",
                    "url": f"https://github.com/3252a8/mini-throne/releases/tag/{tag}",
                }
            ]
        },
    }
    request = Request(
        "https://gitlab.com/api/v4/projects/3252a8%2Fmini-throne/releases",
        data=json.dumps(payload).encode(),
        headers={
            "PRIVATE-TOKEN": os.environ["MINI_THRONE_GITLAB_TOKEN"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        if response.status != 201:
            raise RuntimeError("release_mirror_failed")
    print(f"Published repository installer {version}; both dev heads: {head}")


if __name__ == "__main__":
    main()
