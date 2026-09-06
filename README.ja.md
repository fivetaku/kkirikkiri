[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | 日本語 | [Español](README.es.md)

# kkirikkiri (끼리끼리)

<p align="center">
  <img src="assets/kkirikkiri-hero-01.png" alt="kkirikkiri" width="320">
</p>

> **一言で十分。AI エージェントチームが編成され、動き出す。**

やりたいことを伝えると、既に答えた内容は繰り返さず、必要な判断だけを確認して承認済みのチームまたは Workflow を実行します。

セッション別台帳と受け入れ検査を使用します。[任意の準備ツール](skills/kkirikkiri/references/prepare-team-pilot.md)は承認済み計画からカードと Agent 要求を生成します。実行時の権限サンドボックスではありません。

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
- **インタビュー** — 結果に影響する未確定事項だけを確認し、回答済みの質問は繰り返しません
- **環境認識** —— インストール済みのツール（Codex CLI、Antigravity CLI `agy`、`.claude/agents/`）を検出し、実際に使えるリソースから最適なチームを構成
- **マルチモデル** —— Claude、Codex CLI（コード・大規模分析）、Antigravity CLI（デザイン/UI）が同じチーム内でそれぞれ異なる役割を担当
- **2 つの実行基盤** —— ユーザーが選択：リアルタイムに協調するチーム（Agent Teams）か、大量ファンアウト作業向けの決定論的エージェントパイプライン（Workflows）か
- **検証ループ** — 受け入れ基準を満たせば終了。既定は最大2ラウンドで、追加には明示的な承認が必要です
- **共有メモリ** —— `.kkirikkiri/teams/{team_name}/` のファイルがラウンドをまたいで保持され、交代したメンバーも即座に文脈を引き継げる。セッションごとに独立ディレクトリを使うため、マルチセッションでも衝突しない
- **エージェントの再利用** —— チームメンバーを `.claude/agents/` に保存して、今後のプロジェクトでも利用可能

名前の由来は韓国語の慣用句 **끼리끼리（キリキリ）** —— *似た者同士が自然と集まる*という意味。すべてのチームは、共通の目的を中心に編成されます。

---

## 仕組み

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

**チームリーダーの原則:**
- 現在のホストセッションが既定の調整役です。別の Leader は承認された場合だけ追加します
- リーダーは計画・委任・検証のみ——コードを直接書かない
- 各メンバーの役割は厳密にスコープが区切られている

---

## 機能

### ワーカーモデルの選択

Teams と Workflow の構成確認で、Fable 中心・Opus 中心・Sonnet 中心・
役割別指定を選択します。指定済みモデルは再質問せず、実際の割り当てを保持します。
推奨する選択肢には印を付けます。Fable は対応ホストの `fable` エイリアスで呼び出し、
実行時のモデル ID を別途記録します。バージョン固定ではありません。
Haiku は明示的に指定された場合のみ使用します。
利用できないモデルを無断で置き換えず、ホストモデルも変更しません。
[選択ルール](skills/kkirikkiri/references/model-selection.md)

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
| 追加ラウンド | 明示的な承認後、未達の基準だけを補強 |

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
