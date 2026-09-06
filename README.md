English | [한국어](README.ko.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [Español](README.es.md)

# kkirikkiri (끼리끼리)

<p align="center">
  <img src="assets/kkirikkiri-hero-01.png" alt="kkirikkiri" width="320">
</p>

> **One sentence. A team of AI agents, assembled and running.**

Describe your goal in plain language. kkirikkiri asks only for missing decisions, scans your environment, and runs the team or Workflow you approve.

Session-owned ledgers and acceptance checks prevent incidental changes from counting as completion. The [opt-in preparation pilot](skills/kkirikkiri/references/prepare-team-pilot.md) generates cards and Agent requests from one approved plan; it is not a runtime permission sandbox.

[Quick Start](#quick-start) • [Why kkirikkiri?](#why-kkirikkiri) • [How it works](#how-it-works) • [Features](#features) • [Requirements](#requirements)

---

## Quick Start

### 1. Add the marketplace

```
/plugin marketplace add https://github.com/fivetaku/gptaku_plugins.git
```

### 2. Install

```
/plugin install kkirikkiri
```

### 3. Enable Agent Teams

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 4. Run

```
/kkirikkiri build me a research team
```

---

## Why kkirikkiri?

- **Natural language in, running team out** — no YAML, no agent definitions to write by hand
- **Interview-driven** — asks only for consequential information not already supplied
- **Environment-aware** — detects installed tools (Codex CLI, Antigravity CLI `agy`, `.claude/agents/`) and builds the best team from what you actually have
- **Multi-model** — Claude, Codex CLI (code & large-scale analysis), and Antigravity CLI (design/UI) can each take different roles in the same team
- **Two execution substrates** — you pick: a live collaborating team (Agent Teams) or a deterministic agent pipeline (Workflows) for high-volume fan-out work
- **Validation loop** — stop when acceptance passes; at most two rounds by default, with explicit approval for more
- **Shared memory** — `.kkirikkiri/teams/{team_name}/` files persist across rounds so a replacement team picks up context immediately; each session gets its own directory to prevent multi-session collisions
- **Reusable agents** — save team members to `.claude/agents/` for use in future projects

The name comes from the Korean idiom **끼리끼리** — *like-minded people naturally gathering together*. Every team is assembled around a shared purpose.

---

## How it works

```
Natural language input
    → Step 1: Intent detection + preset matching
    → Step 2: Environment scan (parallel)
    → Step 3: Interview — missing consequential decisions only
    → Step 4: Dynamic team composition
    → Step 5: Team proposal + your confirmation
    → Step 6: Shared memory init + team execution
    → Step 7: Quality validation (two rounds by default; approved extensions only)
    → Step 8: Result collection + report
```

**Team leader rules:**
- The current host session coordinates by default; a separate Leader is optional, not automatically spawned
- Leader plans, delegates, and validates — never writes code directly
- Each member has a strictly scoped role

---

## Features

### Presets

Five built-in presets with natural-language trigger matching:

| Preset | Trigger words | Default team |
|--------|--------------|--------------|
| Research | research, find, look up, compare | Leader + 2 researchers |
| Development | build, implement, code, add feature | Leader + 2 developers |
| Analysis | analyze, review, inspect, audit | Leader + 2 explorers |
| Content | write, document, README, blog post | Leader + writer + reviewer |
| Product/PM | PRD, strategy, roadmap, OKR, GTM | Leader + PM + researcher |

Presets are a starting point. The interview and environment scan shape the final team every time.

### Shared memory

The team writes to `.kkirikkiri/teams/{team_name}/` in your project root (session-scoped, no collision between concurrent sessions):

| File | Purpose |
|------|---------|
| `TEAM_PLAN.md` | Task plan, role assignments, goals |
| `TEAM_PROGRESS.md` | Live progress — completed and pending items |
| `TEAM_FINDINGS.md` | Discoveries, dead ends (`DEAD_ENDS`) |
| `report.md` | Canonical final report for this session |

Saved teams are stored cross-session under `.kkirikkiri/shared/saved-teams/`. If a team member is replaced mid-task, the new member reads these files and catches up immediately.

### Validation loop

| Round | Strategy |
|-------|---------|
| Round 1 | Original team executes |
| Round 2 | Auto-judge: keep (A) / full replacement (B) / partial swap (C) |
| Additional rounds | Explicit approval required; repair only unresolved criteria |

### Multi-model support

Claude + Codex CLI (code & large-scale analysis, cross-model review) + Antigravity CLI `agy` (design/UI) can each take different roles in the same team. kkirikkiri auto-detects what is installed and optimizes accordingly. Claude-only works fine if no external CLIs are present.

### Agent auto-detection and reuse

If `.claude/agents/` contains agent definitions, kkirikkiri detects them and recommends relevant ones per preset:

| Preset | Example agents |
|--------|---------------|
| Research | insane-research, data-analyst |
| Development | code-reviewer, architect |
| Analysis | code-analyzer, security-reviewer |
| Content | writer, translator |

After a successful run, you can save well-performing team members back to `.claude/agents/` for reuse in other projects.

### Spawn stability

If a team member fails to join:
1. Retry once with the same configuration
2. Retry with a downgraded model
3. Continue with the remaining team members

### Team save and reload

```
/kkirikkiri use the research team from last time
```

---

## Requirements

### Required

- **Claude Code** (latest)
- **Agent Teams feature flag:**
  ```json
  // ~/.claude/settings.json
  {
    "env": {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
  }
  ```
- **Node.js** (for external CLI integrations)
- **tmux** (optional): only for split-pane team display. Teams run in-process without it. `brew install tmux` (macOS) / `apt install tmux` (Linux)

### Optional (multi-model)

```bash
npm install -g @openai/codex                                    # Codex CLI — code & large-scale analysis, cross-model review
curl -fsSL https://antigravity.google/cli/install.sh | bash     # Antigravity CLI (agy) — design/UI
curl -fsSL https://x.ai/cli/install.sh | bash                  # Grok CLI (code, long-context cross-review)
```

Works without these. Claude handles the full team on its own.

### Cost reference

| Team size | Estimated time | Cost level |
|-----------|---------------|-----------|
| 2–3 members | 5–15 min | Low |
| 4–5 members | 10–30 min | Medium |
| 5+ members, multi-round | 30 min–1 hr | High |

Reduce team size or use Codex/Antigravity CLI to lower costs.

---

## License

MIT

---

<div align="center">

**Like-minded agents, gathered for your goal.**

</div>
