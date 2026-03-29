# auto-craft-game prototype

## 概要

自己複製可能な自律キャラクターが構築できるかを検証するプロトタイプ。
ゲーム仕様に不備がなく、実現性があり、要件を満たしているかを確認する目的で作成する。

## 仕様

ゲーム仕様は `docs/specs/` に格納されている。実装の根拠は常にここを参照すること。

| ファイル | 内容 |
|---------|------|
| `docs/specs/requirements.md` | 要件・検証事項 |
| `docs/specs/application_spec.md` | アプリケーション全体（時間モデル、マップ、ゲームループ、技術スタック、プロジェクト構造） |
| `docs/specs/game_spec.md` | クラフトシステム（素材階層、レシピ、加工ルール） |
| `docs/specs/character_spec.md` | キャラクターのコンポーネントシステム、損傷・死亡モデル |
| `docs/specs/character_program_spec.md` | ルールベースProgram仕様（Condition、Action、JSON形式） |
| `docs/specs/self_replication_spec.md` | 自己複製メカニズム（クワイン構造、複製手順） |

## 技術スタック

- TypeScript + Node.js
- Vitest（テスト）
- GUIなし — CUI出力（JSON）で検証

## プロジェクト構造

```
src/
├── types.ts          ... 全体の型定義
├── world.ts          ... マップ、資源ノード、ゲーム世界
├── recipes.ts        ... 素材階層、レシピ定義
├── character.ts      ... キャラクター、コンポーネント
├── program.ts        ... Program評価（Condition/Action）
├── replication.ts    ... 自己複製関連のAction実装
├── simulation.ts     ... ゲームループ、ティック実行
└── cli.ts            ... CUIエントリポイント
test/
├── recipes.test.ts
├── character.test.ts
├── program.test.ts
├── replication.test.ts
└── simulation.test.ts
programs/
└── self-replicator.json
```

## コマンド

- `npm test` — 全テスト実行
- `npm run sim` — シミュレーション実行（`npx tsx src/cli.ts`）
- `npm run sim -- --ticks 200 --program programs/self-replicator.json` — オプション付き実行

## 開発方針

- プロトタイプであるため正常系が動けばよく、拡張性は不要
- 仕様に忠実に実装する。仕様に記載のない挙動は最もシンプルな解釈を採用する
- immutableなデータ操作を基本とする（オブジェクトを変更せず新しいオブジェクトを生成）
- テストは検証事項（requirements.md）を直接表現するものを優先する
- ファイルサイズ: 200-400行を目安、800行を超えない

## 検証の完了基準

以下の3つがテストで通過すること:

1. Programの組立指示でBody構成を自由に決定できる
2. MemoryCoreのデータコピーでProgramが正しく伝達される
3. Program内の組立指示の変更で進化（異なる構成の娘）が実現できる
