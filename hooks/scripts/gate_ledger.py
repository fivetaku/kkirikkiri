"""Shared session-owned open-ledger lookup for init, spawn and done hooks."""

import glob
import json
import os
import sys


def block(message):
    print(f"[kkirikkiri] {message}", file=sys.stderr)
    raise SystemExit(2)


def session_id(data):
    owner = data.get("session_id")
    if owner in (None, ""):
        owner = data.get("sessionId")
    if owner in (None, ""):
        return None
    if not isinstance(owner, str):
        block("invalid-session-id: expected a string")
    return owner


def resolve_ledger(cwd, owner):
    """Match across cwd and five ancestors, stopping at HOME or filesystem root.

    No ID matches only unowned legacy ledgers. A nearer unrelated run never
    hides a matching ancestor; multiple matches block before any mutation.
    This lookup does not serialize concurrent mutations within one session.
    """
    matches = []
    probe = os.path.abspath(cwd)
    home = os.path.abspath(os.path.expanduser("~"))
    for _ in range(6):
        runs = os.path.join(probe, ".kkirikkiri", "runs")
        for path in sorted(glob.glob(os.path.join(runs, "*.json"))):
            try:
                with open(path, encoding="utf-8") as stream:
                    ledger = json.load(stream)
                if not isinstance(ledger, dict):
                    raise ValueError("expected a ledger object")
            except (OSError, ValueError) as error:
                block(f"ledger-read-error: {path}: {error}")
            if ledger.get("outcome") in (None, {}) and session_id(ledger) == owner:
                matches.append((path, ledger))
        parent = os.path.dirname(probe)
        if probe == home or parent == probe:
            break
        probe = parent
    if len(matches) > 1:
        block(f"ambiguous-ledger: session_id={owner!r}; matches="
              + ", ".join(path for path, _ in matches))
    return matches[0] if matches else None
