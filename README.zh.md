[English](README.md) | [한국어](README.ko.md) | 中文 | [日本語](README.ja.md) | [Español](README.es.md)

# kkirikkiri (끼리끼리)

<p align="center">
  <img src="assets/kkirikkiri-hero-01.png" alt="kkirikkiri" width="320">
</p>

> **一句话就够了。一支 AI 智能体团队，自动组建并开始运行。**

用平常的语言描述你想做什么。kkirikkiri 会通过 2–3 个问题采访你，扫描你的环境，提出团队方案并执行——全部在 Claude Code 内完成。

[快速开始](#快速开始) • [为什么选 kkirikkiri？](#为什么选-kkirikkiri) • [工作原理](#工作原理) • [功能](#功能) • [环境要求](#环境要求)

---

## 快速开始

### 1. 添加插件市场

```
/plugin marketplace add https://github.com/fivetaku/gptaku_plugins.git
```

### 2. 安装

```
/plugin install kkirikkiri
```

### 3. 启用 Agent Teams

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 4. 运行

```
/kkirikkiri build me a research team
```

---

## 为什么选 kkirikkiri？

- **输入自然语言，产出运行中的团队** —— 不用写 YAML，也不用手写智能体定义文件
- **采访驱动** —— 用 2–3 个精准的问题取代冗长的配置表单
- **感知环境** —— 检测已安装的工具（Codex CLI、Antigravity CLI `agy`、`.claude/agents/`），基于你实际拥有的资源组建最优团队
- **多模型** —— Claude、Codex CLI（代码与大规模分析）、Antigravity CLI（设计/UI）可以在同一支团队中各自承担不同角色
- **两种执行基座** —— 由你选择：实时协作团队（Agent Teams），或面向大批量扇出工作的确定性智能体流水线（Workflows）
- **验证循环** —— 如果第 1 轮产出不达标，团队会自动重试或重建（最多 3 轮）
- **共享内存** —— `.kkirikkiri/teams/{team_name}/` 中的文件跨轮次保留，替换上场的团队成员能立即接续上下文；每个会话使用独立目录，避免多会话冲突
- **智能体可复用** —— 把团队成员保存到 `.claude/agents/`，供未来的项目使用

名字来自韩语惯用语 **끼리끼리** —— 意为*志同道合的人自然聚在一起*。每支团队都围绕一个共同目标组建。

---

## 工作原理

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

**队长规则：**
- 队长永远由可用的最强模型担任（默认 Opus）
- 队长只做计划、分派和验证——从不直接写代码
- 每位成员的角色都有严格边界

---

## 功能

### 预设

内置 5 种预设，通过自然语言触发词匹配：

| 预设 | 触发词 | 默认团队 |
|--------|--------------|--------------|
| 研究 | 调研、查找、搜一下、对比 | 队长 + 2 名研究员 |
| 开发 | 构建、实现、写代码、加功能 | 队长 + 2 名开发者 |
| 分析 | 分析、评审、检查、审计 | 队长 + 2 名探索者 |
| 内容 | 写作、文档、README、博客文章 | 队长 + 撰稿人 + 审校 |
| 产品/PM | PRD、战略、路线图、OKR、GTM | 队长 + PM + 研究员 |

预设只是起点。采访和环境扫描每次都会重塑最终的团队。

### 共享内存

团队会写入项目根目录下的 `.kkirikkiri/teams/{team_name}/`（按会话隔离，并发会话之间不冲突）：

| 文件 | 用途 |
|------|---------|
| `TEAM_PLAN.md` | 任务计划、角色分工、目标 |
| `TEAM_PROGRESS.md` | 实时进度——已完成与待办事项 |
| `TEAM_FINDINGS.md` | 发现的线索、走过的死胡同（`DEAD_ENDS`） |
| `report.md` | 本次会话的正式最终报告 |

已保存的团队会跨会话存放在 `.kkirikkiri/shared/saved-teams/`。如果有成员在任务中途被替换，新成员读取这些文件后即可立刻跟上进度。

### 验证循环

| 轮次 | 策略 |
|-------|---------|
| 第 1 轮 | 原班团队执行 |
| 第 2 轮 | 自动判定：保留（A）/ 整体换血（B）/ 部分替换（C） |
| 第 3 轮 | 无条件重建整支团队 |

### 多模型支持

Claude + Codex CLI（代码与大规模分析、跨模型评审）+ Antigravity CLI `agy`（设计/UI）可以在同一支团队中各自承担不同角色。kkirikkiri 会自动检测已安装的工具并据此优化。没有外部 CLI 时，仅用 Claude 也能正常工作。

### 智能体自动检测与复用

如果 `.claude/agents/` 中存在智能体定义，kkirikkiri 会检测到它们，并按预设推荐相关的智能体：

| 预设 | 智能体示例 |
|--------|---------------|
| 研究 | insane-research, data-analyst |
| 开发 | code-reviewer, architect |
| 分析 | code-analyzer, security-reviewer |
| 内容 | writer, translator |

运行成功后，你可以把表现出色的团队成员保存回 `.claude/agents/`，在其他项目中复用。

### 生成稳定性

如果某位成员加入团队失败：
1. 用相同配置重试一次
2. 降级模型后重试
3. 由其余成员继续推进

### 团队保存与重载

```
/kkirikkiri use the research team from last time
```

---

## 环境要求

### 必需

- **Claude Code**（最新版）
- **Agent Teams 功能开关：**
  ```json
  // ~/.claude/settings.json
  {
    "env": {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
  }
  ```
- **Node.js**（用于外部 CLI 集成）
- **tmux**（可选）：仅用于分屏展示团队。没有它时团队在进程内正常运行。`brew install tmux`（macOS）/ `apt install tmux`（Linux）

### 可选（多模型）

```bash
npm install -g @openai/codex                                    # Codex CLI — code & large-scale analysis, cross-model review
curl -fsSL https://antigravity.google/cli/install.sh | bash     # Antigravity CLI (agy) — design/UI
curl -fsSL https://x.ai/cli/install.sh | bash                  # Grok CLI (代码·长上下文交叉审查)
```

没有这些也能用。Claude 会独自扛起整支团队。

### 成本参考

| 团队规模 | 预计耗时 | 成本水平 |
|-----------|---------------|-----------|
| 2–3 名成员 | 5–15 分钟 | 低 |
| 4–5 名成员 | 10–30 分钟 | 中 |
| 5 名以上、多轮次 | 30 分钟–1 小时 | 高 |

减少团队人数，或借助 Codex/Antigravity CLI，可以降低成本。

---

## 许可证

MIT

---

<div align="center">

**志同道合的智能体，为你的目标而聚。**

</div>
