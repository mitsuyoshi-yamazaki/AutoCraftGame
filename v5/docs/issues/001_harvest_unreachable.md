# Issue 001: キャラクターがHARVEST距離に到達しない

## ステータス: 解決済み

## 症状

replicatorプログラムのキャラクターがSENSE→MOVE→RECHARGEのループを繰り返すが、
リソースノードのINTERACT_RANGE内に入れず、HARVESTが一度も実行されない。

## 原因

複合的な問題が原因だった:

1. **RECIPE/CRAFT IDの不一致** (actions.ts): コンパイラ定数(0-based)とアクション実行側(1-based)のID不一致により、PROCESS/CRAFTが無条件失敗
2. **移動オーバーシュート**: `moving = d`（距離d分のtick移動）で、1tickあたり~1.8単位移動するため大幅にオーバーシュート
3. **エネルギー経済の破綻**: inventoryMetabolismPerItemが高すぎ、アイテム所持中の代謝がRECHARGE供給を超過

## 解決策

1. actions.tsのRECIPE/CRAFT IDを0-basedに修正
2. 毎tickSENSEして方向修正するプログラムに変更
3. パラメータ調整（inventoryMetabolismPerItem=0, rechargeAmount=1000, frameDurability=5000）
4. スタックリーク回避（全変数グローバル化）
5. WRITE/ACTIVATE予約の分離（別tickに）

詳細は docs/tuning/001_baseline_self_replication.md を参照。
