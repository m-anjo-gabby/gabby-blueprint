# Gabby Blueprint

英語学習アプリ『Gabby Blueprint』のモノレポ（Turborepo / pnpm Workspaces）です。

| ディレクトリ | 内容 | ローカルURL |
|---|---|---|
| `apps/student` | 学習者向けアプリ | https://localhost:3000 |
| `apps/admin` | 管理者向けアプリ | https://localhost:3001 |
| `apps/coach` | コーチ向けアプリ | https://localhost:3002 |
| `packages/lib` / `packages/types` | 共通ロジック・UI・型定義 |  |
| `supabase/` | DDL・リリーススクリプト（`supabase/release/README.md`） |  |
| `testing/` | データ主体テスト・E2E（`testing/README.md`） |  |
| `docs/` | 規約・画面仕様書など（索引は `CLAUDE.md` の表、画面仕様書は `docs/screens/README.md`） |  |

## はじめに

新しい端末での環境構築は [docs/SETUP.md](docs/SETUP.md) を参照してください。

```powershell
pnpm install
pnpm dev:ssl
```

開発規約は [CLAUDE.md](CLAUDE.md) にまとめています（画面の作り方は [docs/UI.md](docs/UI.md) ほか）。
