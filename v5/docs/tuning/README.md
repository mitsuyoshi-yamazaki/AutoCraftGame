# チューニング記録

## 概要

v4シミュレーションのパラメータ探索・チューニングの記録を管理するディレクトリ。

分析の手順と観点については [ANALYSIS_GUIDE.md](./ANALYSIS_GUIDE.md) を参照。

## 調整記録

| # | ファイル | 日付 | 概要 |
|---|---------|------|------|
| 001 | [001_baseline_self_replication.md](./001_baseline_self_replication.md) | 2026-04-06 | VMアーキテクチャでの初の自己複製達成。バグ修正3件、パラメータ調整（inventoryMetabolismPerItem=0, rechargeAmount=1000, frameDurability=5000）により全seedで増殖→飽和→老化のサイクルを確認 |
| 002 | [002_multi_species_coexistence.md](./002_multi_species_coexistence.md) | 2026-04-07 | 複数種族の長期共存達成。Pioneer+Survivor(同構成・異行動)で全5 seedで14849-15000tick共存。パラメータ変更: EnergyNode 60/prod200, aging N=8000/M=12000。Scavengerニッチは0エネルギー死の渦により断念 |
| 003 | [003_lifecycle_balance.md](./003_lifecycle_balance.md) | 2026-04-07 | ライフサイクルバランスの確立。frameDurability=3000/decay=4/aging N=3000/M=6000で継続的な生死サイクル実現。Explorer種追加。3種族が10000tick共存。Evolver COPY_SIZEバグ修正 |
