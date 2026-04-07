# チューニング記録

## 概要

v4シミュレーションのパラメータ探索・チューニングの記録を管理するディレクトリ。

分析の手順と観点については [ANALYSIS_GUIDE.md](./ANALYSIS_GUIDE.md) を参照。

## 調整記録

| # | ファイル | 日付 | 概要 |
|---|---------|------|------|
| 001 | [001_baseline_self_replication.md](./001_baseline_self_replication.md) | 2026-04-06 | VMアーキテクチャでの初の自己複製達成。バグ修正3件、パラメータ調整（inventoryMetabolismPerItem=0, rechargeAmount=1000, frameDurability=5000）により全seedで増殖→飽和→老化のサイクルを確認 |
