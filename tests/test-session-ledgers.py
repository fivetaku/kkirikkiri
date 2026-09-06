#!/usr/bin/env python3
"""Session ownership regression tests through the actual shell hook entry points."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ABSENT = object()


class SessionLedgers(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="kkirikkiri-session-")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / "home"
        self.cwd = self.home / "workspace"
        self.cwd.mkdir(parents=True)
        self.repo = self.cwd / "repo"
        self.repo.mkdir()
        self.env = dict(os.environ, HOME=str(self.home), CLAUDE_PLUGIN_ROOT=str(ROOT),
                        PYTHONDONTWRITEBYTECODE="1", GIT_CONFIG_NOSYSTEM="1",
                        GIT_CONFIG_GLOBAL=os.devnull)
        # No ambient Git routing, Python startup hooks, or external test repo.
        for key in list(self.env):
            if key.startswith("GIT_") and key not in ("GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL"):
                del self.env[key]
        self.env.pop("PYTHONPATH", None)
        self.env.pop("PYTHONHOME", None)
        self.git("init", "-q")
        (self.repo / "tracked.txt").write_text("baseline\n")
        self.git("add", "tracked.txt")
        self.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
                 "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], env=self.env,
                              cwd=self.cwd, check=True, capture_output=True, text=True,
                              timeout=10)

    def hook(self, gate, session=ABSENT, cwd=None, alias=False, **overrides):
        payload = {"cwd": str(cwd or self.cwd)}
        if session is not ABSENT:
            payload["sessionId" if alias else "session_id"] = session
        if gate == "init":
            payload["prompt"] = "/kkirikkiri repair fixture"
        elif gate == "spawn":
            payload.update(tool_name="Agent", tool_input={"name": "worker", "prompt": "no boundary"})
        else:
            payload["stop_hook_active"] = False
        payload.update(overrides)
        return subprocess.run(["bash", str(ROOT / "hooks" / "scripts" / f"gate-{gate}.sh")],
                              input=json.dumps(payload), env=self.env, cwd=cwd or self.cwd,
                              text=True, capture_output=True, timeout=30)

    def assert_exit(self, result, code):
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)

    def seed(self, name, session=ABSENT, cwd=None, **fields):
        runs = (cwd or self.cwd) / ".kkirikkiri" / "runs"
        runs.mkdir(parents=True, exist_ok=True)
        path = runs / f"{name}.json"
        data = {"outcome": None, "work": {"repo": str(self.repo),
                "report": str(self.cwd / "missing-report.md")}}
        if session is not ABSENT:
            data["session_id"] = session
        data.update(fields)
        path.write_text(json.dumps(data))
        return path

    def snapshot(self):
        return {p: p.read_bytes() for p in self.cwd.rglob(".kkirikkiri/runs/*.json")}

    def test_init_creates_separate_session_ledgers_and_reuses_only_own(self):
        self.assert_exit(self.hook("init", "A"), 0)
        before = self.snapshot()
        self.assert_exit(self.hook("init", "B"), 0)
        after = self.snapshot()
        self.assertEqual(len(after), 2)
        self.assertEqual({json.loads(value)["session_id"] for value in after.values()}, {"A", "B"})
        for path, value in before.items():
            self.assertEqual(after[path], value)
        self.assert_exit(self.hook("init", "A"), 0)
        self.assertEqual(self.snapshot(), after)

    def test_spawn_mutations_and_overlap_do_not_touch_newer_session(self):
        a = self.seed("1000-A", "A")
        b = self.seed("9999-B", "B", declarations=[{"agent": "B-owner", "write_scope": ["src/**"]}])
        os.utime(a, (1000, 1000))
        os.utime(b, (2000, 2000))
        untouched = b.read_bytes()
        valid = {"name": "A-owner", "prompt": "tools: Read, Write / write_scope: src/** / stop: maxTurns 5"}
        self.assert_exit(self.hook("spawn", "A", tool_input=valid), 0)
        self.assertEqual(json.loads(a.read_text())["declarations"][0]["agent"], "A-owner")
        self.assertEqual(b.read_bytes(), untouched)
        self.assert_exit(self.hook("spawn", "A"), 2)
        valid["name"] = "A-intruder"
        self.assert_exit(self.hook("spawn", "A", tool_input=valid), 2)
        self.assertEqual({v["gate"] for v in json.loads(a.read_text())["boundary_violations"]},
                         {"spawn", "spawn-overlap"})
        self.assertEqual(b.read_bytes(), untouched)

    def test_done_mutates_only_session_a_even_when_b_newer(self):
        a = self.seed("1000-A", "A")
        b = self.seed("9999-B", "B")
        os.utime(a, (1000, 1000))
        os.utime(b, (2000, 2000))
        untouched = b.read_bytes()
        self.assert_exit(self.hook("done", "A"), 2)
        gate = json.loads(a.read_text())["outcome_gate"]
        self.assertEqual(gate["block_count"], 1)
        self.assertEqual(gate["report"]["verdict"], "no_change_unjustified")
        self.assertEqual(b.read_bytes(), untouched)
        self.assert_exit(self.hook("done", "A", stop_hook_active=True), 0)
        self.assertEqual(json.loads(a.read_text())["outcome_gate"]["block_count"], 1)
        self.assertEqual(b.read_bytes(), untouched)

    def test_ancestor_drift_ignores_nearer_other_session_for_all_hooks(self):
        a = self.seed("1000-A", "A")
        b = self.seed("9999-B", "B", cwd=self.repo)
        before = self.snapshot()
        self.assert_exit(self.hook("init", "A", cwd=self.repo), 0)
        self.assertEqual(self.snapshot(), before)
        self.assert_exit(self.hook("spawn", "A", cwd=self.repo), 2)
        self.assertIn("boundary_violations", json.loads(a.read_text()))
        self.assert_exit(self.hook("done", "A", cwd=self.repo), 0)
        # B's nested ledger is an untracked real Git change: prove done-gate ran.
        self.assertEqual(json.loads(a.read_text())["outcome_gate"]["report"]["verdict"], "changed")
        self.assertEqual(b.read_bytes(), before[b])

    def test_session_id_alias_is_canonical_on_creation_and_shared_by_hooks(self):
        self.assert_exit(self.hook("init", "A", alias=True), 0)
        snapshot = self.snapshot()
        self.assertEqual(len(snapshot), 1)
        a = next(iter(snapshot))
        self.assertEqual(json.loads(a.read_text())["session_id"], "A")
        b = self.seed("9999-B", "B")
        untouched = b.read_bytes()
        self.assert_exit(self.hook("spawn", "A", alias=True), 2)
        self.assert_exit(self.hook("done", "A", alias=True), 2)
        self.assertIn("outcome_gate", json.loads(a.read_text()))
        self.assertEqual(b.read_bytes(), untouched)

    def test_identified_missing_context_never_uses_legacy_or_other_session(self):
        self.seed("1000-legacy")
        self.seed("9999-B", "B")
        before = self.snapshot()
        for gate in ("spawn", "done"):
            with self.subTest(gate=gate):
                self.assert_exit(self.hook(gate, "A"), 0)
                self.assertEqual(self.snapshot(), before)
        self.assert_exit(self.hook("init", "A"), 0)
        after = self.snapshot()
        self.assertEqual(len(after), 3)
        for path, value in before.items():
            self.assertEqual(after[path], value)

    def test_closed_ledger_is_not_mutated_or_reused(self):
        closed = self.seed("1000-A", "A", outcome={"status": "closed"})
        self.seed("9999-B", "B")
        before = self.snapshot()
        for gate in ("spawn", "done"):
            self.assert_exit(self.hook(gate, "A"), 0)
            self.assertEqual(self.snapshot(), before)
        self.assert_exit(self.hook("init", "A"), 0)
        self.assertEqual(len(self.snapshot()), 3)
        self.assertEqual(closed.read_bytes(), before[closed])

    def test_same_second_recreation_never_overwrites_closed_ledger(self):
        # Freeze only the clock in subprocesses, not resolution, storage or hooks.
        startup = self.home / "python-startup"
        startup.mkdir()
        (startup / "sitecustomize.py").write_text(
            "import datetime\n"
            "class FixedDatetime(datetime.datetime):\n"
            "    @classmethod\n"
            "    def now(cls, tz=None):\n"
            "        return cls(2026, 9, 5, 12, 0, 0, tzinfo=tz)\n"
            "datetime.datetime = FixedDatetime\n")
        self.env["PYTHONPATH"] = str(startup)
        self.assert_exit(self.hook("init", "A"), 0)
        first = next(iter(self.snapshot()))
        self.assertTrue(first.name.startswith("20260905_120000"))
        data = json.loads(first.read_text())
        data["outcome"] = {"status": "closed"}
        first.write_text(json.dumps(data))
        closed = first.read_bytes()
        self.assert_exit(self.hook("init", "A"), 0)
        self.assert_exit(self.hook("init", "B"), 0)
        self.assertEqual(len(self.snapshot()), 3)
        self.assertTrue(all(p.name.startswith("20260905_120000") for p in self.snapshot()))
        self.assertEqual(first.read_bytes(), closed)

    def test_ambiguous_session_context_blocks_all_hooks_without_mutation(self):
        self.seed("1000-A", "A")
        self.seed("9999-A", "A", work=None)
        before = self.snapshot()
        for gate in ("init", "spawn", "done"):
            with self.subTest(gate=gate):
                result = self.hook(gate, "A")
                self.assert_exit(result, 2)
                self.assertIn("ambiguous-ledger", result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_ambiguity_across_ancestors_blocks_instead_of_choosing_nearest(self):
        self.seed("1000-A", "A")
        self.seed("9999-A", "A", cwd=self.repo)
        before = self.snapshot()
        for gate in ("init", "spawn", "done"):
            with self.subTest(gate=gate):
                result = self.hook(gate, "A", cwd=self.repo)
                self.assert_exit(result, 2)
                self.assertIn("ambiguous-ledger", result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_no_id_uses_only_unique_unowned_legacy_context(self):
        legacy = self.seed("1000-legacy")
        owned = self.seed("9999-owned", "B")
        before = self.snapshot()
        self.assert_exit(self.hook("init"), 0)
        self.assertEqual(self.snapshot(), before)
        self.assert_exit(self.hook("spawn"), 2)
        self.assert_exit(self.hook("done"), 2)
        self.assertIn("boundary_violations", json.loads(legacy.read_text()))
        self.assertIn("outcome_gate", json.loads(legacy.read_text()))
        self.assertEqual(owned.read_bytes(), before[owned])

    def test_no_id_does_not_use_owned_context(self):
        self.seed("9999-owned", "B")
        before = self.snapshot()
        for gate in ("spawn", "done"):
            self.assert_exit(self.hook(gate), 0)
            self.assertEqual(self.snapshot(), before)
        self.assert_exit(self.hook("init"), 0)
        self.assertEqual(len(self.snapshot()), 2)

    def test_ambiguous_legacy_context_blocks_all_hooks_without_mutation(self):
        self.seed("1000-legacy")
        self.seed("9999-legacy")
        before = self.snapshot()
        for gate in ("init", "spawn", "done"):
            with self.subTest(gate=gate):
                result = self.hook(gate)
                self.assert_exit(result, 2)
                self.assertIn("ambiguous-ledger", result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_git_file_worktree_is_recognized(self):
        worktree = self.cwd / "worktree"
        self.git("worktree", "add", "--detach", str(worktree), "HEAD")
        self.assertTrue((worktree / ".git").is_file())
        self.assert_exit(self.hook("init", "A", cwd=worktree), 0)
        ledger = next(iter(self.snapshot()))
        self.assertEqual(json.loads(ledger.read_text())["work"]["repo"], str(worktree))


if __name__ == "__main__":
    unittest.main(verbosity=2)
