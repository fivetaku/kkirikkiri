[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | 日本語 | [Español](README.es.md)

# kkirikkiri (끼리끼리)

<p align="center">
  <img src="assets/kkirikkiri-hero-01.png" alt="kkirikkiri" width="320">
</p>

> **一言で十分。AI エージェントチームが編成され、動き出す。**

やりたいことを普段の言葉で伝えるだけ。kkirikkiri が 2〜3 個の質問でインタビューし、環境をスキャンし、チームを提案して実行します——すべて Claude Code の中で完結します。

[クイックスタート](#クイックスタート) • [なぜ kkirikkiri なのか](#なぜ-kkirikkiri-なのか) • [仕組み](#仕組み) • [機能](#機能) • [動作要件](#動作要件)

---

## クイックスタート

### 1. マーケットプレイスを追加

```
/plugin marketplace add https://github.com/fivetaku/gptaku_plugins.git
```

### 2. インストール

```
/plugin install kkirikkiri
```

### 3. Agent Teams を有効化

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 4. 実行

```
/kkirikkiri build me a research team
```

---

## なぜ kkirikkiri なのか

- **自然言語を入れると、動くチームが出てくる** —— YAML もエージェント定義ファイルも手書き不要
- **インタビュー駆動** —— 長い設定フォームの代わりに、的を絞った 2〜3 個の質問でチームを設計
- **環境認識** —— インストール済みのツール（Codex CLI、Antigravity CLI `agy`、`.claude/agents/`）を検出し、実際に使えるリソースから最適なチームを構成
- **マルチモデル** —— Claude、Codex CLI（コード・大規模分析）、Antigravity CLI（デザイン/UI）が同じチーム内でそれぞれ異なる役割を担当
- **2 つの実行基盤** —— ユーザーが選択：リアルタイムに協調するチーム（Agent Teams）か、大量ファンアウト作業向けの決定論的エージェントパイプライン（Workflows）か
- **検証ループ** —— 1 ラウンド目の成果が不十分なら、チームを自動でリトライまたは再編成（最大 3 ラウンド）
- **共有メモリ** —— `.kkirikkiri/teams/{team_name}/` のファイルがラウンドをまたいで保持され、交代したメンバーも即座に文脈を引き継げる。セッションごとに独立ディレクトリを使うため、マルチセッションでも衝突しない
- **エージェントの再利用** —— チームメンバーを `.claude/agents/` に保存して、今後のプロジェクトでも利用可能

名前の由来は韓国語の慣用句 **끼리끼리（キリキリ）** —— *似た者同士が自然と集まる*という意味。すべてのチームは、共通の目的を中心に編成されます。

---

## 仕組み

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

**チームリーダーの原則:**
- リーダーは常に、利用可能な中で最も高性能なモデル（デフォルトは Opus）
- リーダーは計画・委任・検証のみ——コードを直接書かない
- 各メンバーの役割は厳密にスコープが区切られている

---

## 機能

### プリセット

自然言語トリガーのマッチングで選ばれる 5 種の組み込みプリセット：

| プリセット | トリガーワード | デフォルト構成 |
|--------|--------------|--------------|
| リサーチ | 調べて、リサーチ、探して、比較して | リーダー + リサーチャー 2 名 |
| 開発 | 作って、実装して、コーディングして、機能追加 | リーダー + 開発者 2 名 |
| 分析 | 分析して、レビューして、検査して、監査して | リーダー + エクスプローラー 2 名 |
| コンテンツ | 書いて、ドキュメント、README、ブログ記事 | リーダー + ライター + レビュアー |
| プロダクト/PM | PRD、戦略、ロードマップ、OKR、GTM | リーダー + PM + リサーチャー |

プリセットは出発点にすぎません。インタビューと環境スキャンによって、最終的なチームは毎回変わります。

### 共有メモリ

チームはプロジェクトルートの `.kkirikkiri/teams/{team_name}/` に書き込みます（セッション単位のスコープで、同時セッション間の衝突なし）：

| ファイル | 役割 |
|------|------|
| `TEAM_PLAN.md` | タスク計画、役割分担、目標 |
| `TEAM_PROGRESS.md` | リアルタイムの進捗——完了・未完了の項目 |
| `TEAM_FINDINGS.md` | 発見事項、行き止まりの記録（`DEAD_ENDS`） |
| `report.md` | このセッションの正式な最終レポート |

保存されたチームはセッション横断で `.kkirikkiri/shared/saved-teams/` に保管されます。作業の途中でメンバーが交代しても、新しいメンバーがこれらのファイルを読んで即座に追いつけます。

### 検証ループ

| ラウンド | 戦略 |
|-------|---------|
| ラウンド 1 | 元のチームが実行 |
| ラウンド 2 | 自動判定：維持（A）/ 全面交代（B）/ 部分入れ替え（C） |
| ラウンド 3 | 無条件でチームを全面再編成 |

### マルチモデル対応

Claude + Codex CLI（コード・大規模分析、クロスモデルレビュー）+ Antigravity CLI `agy`（デザイン/UI）が、同じチーム内でそれぞれ異なる役割を担えます。kkirikkiri はインストール済みのツールを自動検出して最適化します。外部 CLI がなくても、Claude 単体で問題なく動作します。

### エージェントの自動検出と再利用

`.claude/agents/` にエージェント定義があれば、kkirikkiri が検出してプリセットごとに関連するものを推薦します：

| プリセット | エージェント例 |
|--------|---------------|
| リサーチ | insane-research, data-analyst |
| 開発 | code-reviewer, architect |
| 分析 | code-analyzer, security-reviewer |
| コンテンツ | writer, translator |

実行がうまくいったら、活躍したメンバーを `.claude/agents/` に保存し直して、他のプロジェクトで再利用できます。

### スポーンの安定性

メンバーがチームへの参加に失敗した場合：
1. 同じ構成でもう一度リトライ
2. モデルをダウングレードしてリトライ
3. 残りのメンバーで続行

### チームの保存と再読み込み

```
/kkirikkiri use the research team from last time
```

---

## 動作要件

### 必須

- **Claude Code**（最新版）
- **Agent Teams のフィーチャーフラグ:**
  ```json
  // ~/.claude/settings.json
  {
    "env": {
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
  }
  ```
- **Node.js**（外部 CLI 連携用）
- **tmux**（任意）：分割ペインでのチーム表示にのみ使用。なくてもチームはインプロセスで動作します。`brew install tmux`（macOS）/ `apt install tmux`（Linux）

### 任意（マルチモデル）

```bash
npm install -g @openai/codex                                    # Codex CLI — code & large-scale analysis, cross-model review
curl -fsSL https://antigravity.google/cli/install.sh | bash     # Antigravity CLI (agy) — design/UI
curl -fsSL https://x.ai/cli/install.sh | bash                  # Grok CLI (コード・長文コンテキスト相互レビュー)
```

これらがなくても動きます。Claude が単独でチーム全体をこなします。

### コストの目安

| チーム規模 | 推定時間 | コスト水準 |
|-----------|---------------|-----------|
| 2〜3 名 | 5〜15 分 | 低 |
| 4〜5 名 | 10〜30 分 | 中 |
| 5 名以上・マルチラウンド | 30 分〜1 時間 | 高 |

チームの人数を減らすか、Codex/Antigravity CLI を活用するとコストを抑えられます。

---

## ライセンス

MIT

---

<div align="center">

**あなたのゴールのために集まった、同じ志のエージェントたち。**

</div>
