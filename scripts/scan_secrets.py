#!/usr/bin/env python3
"""Scan fetched reachable Git blobs. Emit locations only, NEVER credential values.
Pattern matching is limited; supplement with GitHub secret scanning / gitleaks.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

PATTERNS = {
    "OpenRouter": r"sk-or-v1-[A-Za-z0-9]{20,}",
    "Google": r"AIza[0-9A-Za-z_-]{30,}",
    "GitHub": r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})",
    "Groq": r"gsk_[A-Za-z0-9]{30,}",
    "HuggingFace": r"hf_[A-Za-z0-9]{30,}",
    "OpenAI-like": r"sk-(?:proj-)?[A-Za-z0-9_-]{40,}",
    "AWS": r"AKIA[0-9A-Z]{16}",
    "Private key": r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "Slack": r"xox[baprs]-[A-Za-z0-9-]{20,}",
    "Stripe live": r"[sr]k_live_[A-Za-z0-9]{20,}",
}


def scan(repo):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.DEVNULL)
    objects = git("rev-list", "--objects", "--all").decode().splitlines()
    findings = []
    scanned = 0
    # One batched process avoids thousands of subprocess launches.
    batch = subprocess.Popen(["git", "-C", str(repo), "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        for item in objects:
            oid, _, path = item.partition(" ")
            batch.stdin.write((oid + "\n").encode())
            batch.stdin.flush()
            header = batch.stdout.readline().decode().split()
            if len(header) != 3:
                continue
            _, kind, size = header
            data = batch.stdout.read(int(size))
            batch.stdout.read(1)
            if kind != "blob":
                continue
            scanned += 1
            # Decode even binary files so embedded plaintext can be detected.
            text = data.decode("utf-8", errors="replace")
            for label, pattern in PATTERNS.items():
                for match in re.finditer(pattern, text):
                    findings.append({"type": label, "blob": oid, "path": path, "line": text.count("\n", 0, match.start()) + 1})
    finally:
        batch.stdin.close()
        batch.stdout.close()
        batch.wait(timeout=10)
    return {"commits": int(git("rev-list", "--all", "--count")), "blobs_scanned": scanned, "findings": findings,
            "limitations": "Pattern matches are unverified candidates. Reachable fetched refs only; no private repos, unfetched PR refs, deleted/unreachable objects, LFS payloads, encrypted/encoded content, credential validity checks or exhaustive entropy detection."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", nargs="?", default=".")
    parser.add_argument("--output")
    args = parser.parse_args()
    result = scan(Path(args.repo))
    content = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(content + "\n")
    print(content)
    raise SystemExit(1 if result["findings"] else 0)
