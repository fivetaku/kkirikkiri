English | [한국어](README.ko.md)

# kkirikkiri (끼리끼리)

> **One sentence. A team of AI agents, assembled and running.**

Describe what you want in plain language. kkirikkiri interviews you with 2–3 questions, scans your environment, proposes a team, and executes — all within Claude Code.

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
- **Interview-driven** — 2–3 targeted questions replace a long configuration form
- **Environment-aware** — detects installed tools (Codex CLI, Gemini CLI, `.claude/agents/`) and builds the best team from what you actually have
- **Multi-model** — Claude, Codex CLI, and Gemini CLI can each take different roles in the same team
- **Validation loop** — if round 1 output falls short, the team is automatically retried or rebuilt (up to 3 rounds)
- **Shared memory** — `.kkirikkiri/` files persist across rounds so a replacement team picks up context immediately
- **Reusable agents** — save team members to `.claude/agents/` for use in future projects

The name comes from the Korean idiom **끼리끼리** — *like-minded people naturally gathering together*. Every team is assembled around a shared purpose.

---

## How it works

```
Natural language input
    → Step 1: Intent detection + preset matching
    → Step 2: Environment scan (parallel)
    → Step 3: Interview — 2–3 AskUserQuestion prompts
    → Step 4: Dynamic team composition
    → Step 5: Team proposal + your confirmation
    → Step 6: Shared memory init + team execution
    → Step 7: Quality validation loop (up to 3 rounds)
    → Step 8: Result collection + report
```

**Team leader rules:**
- Leader is always the most capable model available (Opus by default)
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

The team writes to `.kkirikkiri/` in your project root:

| File | Purpose |
|------|---------|
| `TEAM_PLAN.md` | Task plan, role assignments, goals |
| `TEAM_PROGRESS.md` | Live progress — completed and pending items |
| `TEAM_FINDINGS.md` | Discoveries, dead ends (`DEAD_ENDS`) |

If a team member is replaced mid-task, the new member reads these files and catches up immediately.

### Validation loop

| Round | Strategy |
|-------|---------|
| Round 1 | Original team executes |
| Round 2 | Auto-judge: keep (A) / full replacement (B) / partial swap (C) |
| Round 3 | Full team rebuild, unconditionally |

### Multi-model support

Claude + Codex CLI + Gemini CLI can each take different roles in the same team. kkirikkiri auto-detects what is installed and optimizes accordingly. Claude-only works fine if no external CLIs are present.

### Agent auto-detection and reuse

If `.claude/agents/` contains agent definitions, kkirikkiri detects them and recommends relevant ones per preset:

| Preset | Example agents |
|--------|---------------|
| Research | deep-research, data-analyst |
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
- **tmux:** `brew install tmux` (macOS) / `apt install tmux` (Linux)
- **Node.js** (for external CLI integrations)

### Optional (multi-model)

```bash
npm install -g @openai/codex       # Codex CLI — code analysis and review
npm install -g @google/gemini-cli  # Gemini CLI — design and large-scale analysis
```

Works without these. Claude handles the full team on its own.

### Cost reference

| Team size | Estimated time | Cost level |
|-----------|---------------|-----------|
| 2–3 members | 5–15 min | Low |
| 4–5 members | 10–30 min | Medium |
| 5+ members, multi-round | 30 min–1 hr | High |

Reduce team size or use Codex/Gemini CLI to lower costs.

---

## License

MIT

---

<div align="center">

**Like-minded agents, gathered for your goal.**

</div>
