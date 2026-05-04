# Clarity MCP Server 運用・接続ガイド（社内向け）

このドキュメントは、Vercel にホスティングされている Clarity MCP Server を社内メンバーが Claude Desktop などの MCP クライアントから利用するための **接続手順** と、サーバー管理者向けの **運用手順（環境変数管理・トークンリフレッシュ）** をまとめたものです。

- 公開エンドポイント: `https://clarity-mcp-server.vercel.app/api/mcp`
- 認証方式: HS256 署名の JWT（`Authorization: Bearer <JWT>`）
- JWT 有効期限: **2週間**（[scripts/generate-token.js](../scripts/generate-token.js)）

---

## 1. システム構成

```
[Claude Desktop] --(stdio)--> [mcp-remote (npx)] --(HTTPS + Bearer JWT)--> [Vercel: /api/mcp]
                                                                                |
                                                                                v
                                                                  [Microsoft Clarity Data Export API]
```

- Claude Desktop は HTTP MCP に直接対応していないため、`mcp-remote` で stdio ⇄ HTTP をブリッジします。
- サーバー側で JWT を検証し ([lib/auth.ts](../lib/auth.ts))、通過したリクエストのみ Clarity API に到達します ([lib/clarity-api.ts](../lib/clarity-api.ts))。

---

## 2. 利用者向け：Claude Desktop からの接続手順

### 2.1 事前準備

サーバー管理者から以下を受け取ってください。

- **JWT トークン**（2週間有効の文字列。`eyJhbGc...` で始まる3パート）

> JWT 自体に Clarity API トークンの権限が紐付いており、漏洩すると第三者がサーバー経由で Clarity データへアクセスできるようになります。Slack DM など漏洩しにくい経路で受領してください。

### 2.2 Claude Desktop 設定ファイルを開く

| OS | パス |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%AppData%\Claude\claude_desktop_config.json` |

ファイルが存在しない場合は新規作成します。

### 2.3 設定を追記

```json
{
  "mcpServers": {
    "clarity": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://clarity-mcp-server.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer <ここにJWTを貼り付け>"
      ]
    }
  }
}
```

**注意**

- `<ここにJWTを貼り付け>` を実際のトークンに置き換える
- 既に他の `mcpServers` 設定がある場合は `clarity` キーを追加するだけで OK
- Node.js（v18+）が PC にインストールされている必要あり（`npx` を使うため）

### 2.4 Claude Desktop を再起動

- 設定ファイル保存後、Claude Desktop を **完全終了 → 再起動**
- ツールアイコン（🔌 / 🔨）に `clarity` が表示されれば接続成功

### 2.5 接続確認用サンプル質問

Claude Desktop で以下のように聞いてみてください。

- 「Clarity でこの1週間のセッション数を国別に教えて」
- 「直近のモバイルからのセッション録画を5件リストアップして」

### 2.6 困ったら：切り分け手順

| 症状 | 原因の可能性 | 対処 |
|---|---|---|
| `clarity` がツール一覧に出ない | 設定 JSON の構文エラー | JSON Linter で検証、Claude Desktop 再起動 |
| `Unauthorized` / 401 エラー | JWT 失効 or サーバー鍵が回転された | 管理者に新しい JWT を依頼 |
| `Token expired` | 2週間経過 | 管理者に新しい JWT を依頼 |
| `500 Server auth token is not configured` | サーバー側環境変数の設定漏れ | 管理者に連絡 |
| `No Clarity API token provided` | サーバー側 `CLARITY_API_TOKEN` 未設定 | 管理者に連絡 |
| `npx` でエラー | Node.js 未インストール | Node.js v18+ をインストール |

疎通だけ確かめたい場合は、ターミナルから以下を実行：

```bash
curl -i https://clarity-mcp-server.vercel.app/api/mcp \
  -H "Authorization: Bearer <JWT>"
```

200 系または MCP 仕様のレスポンスが返れば接続経路は正常です。

---

## 3. 管理者向け：初期セットアップ

> 既にデプロイ済みであれば本セクションはスキップ可。

### 3.1 Vercel 環境変数

Vercel Dashboard → 該当プロジェクト → **Settings → Environment Variables** で、Production / Preview / Development の **すべての環境** に下記3つを登録します。

| 変数名 | 用途 | 生成方法 |
|---|---|---|
| `JWT_SECRET` | JWT 署名検証鍵（HS256）。[lib/auth.ts](../lib/auth.ts) | `openssl rand -base64 32` |
| `JWT_SALT` | ペイロード内 salt と照合する値。鍵ローテーション用に分離。 | `openssl rand -base64 16` |
| `CLARITY_API_TOKEN` | Microsoft Clarity Data Export API 用トークン | Clarity 管理画面 → Settings → Data Export → Generate new API token |

> 環境変数を追加・変更したら **Redeploy が必須**（既存ビルドには反映されない）。

### 3.2 ローカル `.env`

`scripts/generate-token.js` は同じ `JWT_SECRET` / `JWT_SALT` を環境変数として受け取って JWT を発行します。Vercel と同じ値をローカルでも安全な場所に保管してください（推奨: 1Password などのシークレットマネージャ）。

リポジトリ直下に `.env` を作る場合の例：

```bash
# .env （絶対に git commit しない）
JWT_SECRET=<openssl rand -base64 32 の値>
JWT_SALT=<openssl rand -base64 16 の値>
CLARITY_API_TOKEN=<Clarity 管理画面で発行したトークン>
```

`.gitignore` に `.env` が含まれていることを必ず確認すること。

---

## 4. 管理者向け：JWT トークン発行・配布

### 4.1 発行手順

```bash
cd /path/to/clarity-mcp-server

# 環境変数を読み込んでスクリプト実行
JWT_SECRET="..." JWT_SALT="..." node scripts/generate-token.js
```

`.env` に `JWT_SECRET` / `JWT_SALT` が入っていれば、シェルで `export $(cat .env | xargs)` して実行する形でも可。

出力される情報：

- 2週間有効の JWT トークン
- 発行日時 / 有効期限（JST）
- Claude Desktop 用の設定例

スクリプトは同時に `.env` 内の `MCP_SERVER_AUTH_TOKEN` を最新トークンで更新します（管理者の手元用）。

### 4.2 配布

利用者ごとに別トークンを発行する必要は **ない**（現状の実装では JWT の `sub` は `mcp-client` 固定で、ユーザー識別はしていません）。ただし将来的にトークン単位で失効させたいケースを考えると、**メンバーごとに別トークンを発行して台帳管理する運用が望ましい**です。

最低限の配布チェックリスト：

- [ ] 配布先メンバーの氏名・配布日時・有効期限を社内ドキュメントに記録
- [ ] Slack DM など、ログが残る&部外者から見えない経路で送付
- [ ] 「2週間で失効する」「漏洩疑いがあれば即連絡」を必ず添えて伝える

---

## 5. 管理者向け：トークンのリフレッシュ運用

### 5.1 通常リフレッシュ（2週間ごと）

1. 失効日の **数日前** にカレンダーリマインダーをセット
2. `node scripts/generate-token.js` で新しい JWT を発行
3. メンバーへ新トークンを配布
4. メンバーは `claude_desktop_config.json` の `Authorization: Bearer ...` 部分を差し替えて Claude Desktop を再起動

旧トークンは **自然失効に任せる**（exp チェックで弾かれる）か、**緊急時は鍵ローテーション**（5.2）で即時失効させます。

### 5.2 鍵ローテーション（緊急時 / 漏洩疑い時）

`JWT_SECRET` または `JWT_SALT` のどちらかを変更すれば、発行済みの全 JWT が即座に無効化されます。

1. `openssl rand -base64 16` で新しい `JWT_SALT` を生成
2. Vercel の `JWT_SALT` を新しい値に更新
3. **Redeploy**（環境変数反映のため必須）
4. 新しい `JWT_SALT` を使って `node scripts/generate-token.js` を実行し、新 JWT を発行
5. 全メンバーに新トークンを再配布

> `JWT_SECRET` を変える方が原則ですが、`JWT_SALT` のみのローテーションでも全トークンを無効化できます（ペイロード内の salt 値が一致しなくなるため）。緊急ローテーションは `JWT_SALT` の方が手軽です。

### 5.3 Clarity API トークンのリフレッシュ

Clarity 側のトークンに有効期限がある場合は、Clarity 管理画面で再発行 → Vercel の `CLARITY_API_TOKEN` を更新 → Redeploy。
JWT は変更不要です（Clarity API トークンと JWT は独立）。

---

## 6. デプロイ・更新フロー

通常の Vercel フローに従います。

```bash
git switch main
git pull
# 変更を加える
git commit -m "fix: ..."
git push
```

`main` ブランチ push で Vercel が自動デプロイします（プロジェクト設定による）。

デプロイ後の疎通確認：

```bash
# 認証なし → 401 が返れば auth が効いている
curl -i https://clarity-mcp-server.vercel.app/api/mcp

# 有効な JWT 付きで叩く
curl -i https://clarity-mcp-server.vercel.app/api/mcp \
  -H "Authorization: Bearer <JWT>"
```

`scripts/check-deployment.sh` も用意されています（必要に応じて使用）。

---

## 7. セキュリティ運用ルール

- `JWT_SECRET` / `JWT_SALT` / `CLARITY_API_TOKEN` は **絶対にコミットしない**
- JWT を Slack public channel / GitHub Issue / スクリーンショットに貼らない
- 退職・異動メンバーがいた場合は速やかに鍵ローテーション（5.2）を実施
- Vercel の Production 環境変数の閲覧権限は管理者のみに制限
- `.env` は `.gitignore` に必ず含める

---

## 8. 主要ファイル参照

| ファイル | 役割 |
|---|---|
| [app/api/[transport]/route.ts](../app/api/%5Btransport%5D/route.ts) | MCP HTTP エンドポイント。認証チェック後に `@vercel/mcp-adapter` のハンドラへ |
| [lib/auth.ts](../lib/auth.ts) | JWT 検証ロジック（HS256 / exp / salt 照合） |
| [lib/tools.ts](../lib/tools.ts) | MCP ツール登録 |
| [lib/clarity-api.ts](../lib/clarity-api.ts) | Clarity Data Export API クライアント |
| [scripts/generate-token.js](../scripts/generate-token.js) | JWT 発行スクリプト |
| [vercel.json](../vercel.json) | Vercel フレームワーク設定 |

---

## 9. 連絡先 / オーナー

- サーバー管理者: <記入してください>
- Slack チャンネル: <記入してください>
- インシデント連絡先: <記入してください>
