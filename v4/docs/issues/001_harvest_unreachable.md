# Issue 001: キャラクターがHARVEST距離に到達しない

## 症状

replicatorプログラムのキャラクターがSENSE→MOVE→RECHARGEのループを繰り返すが、
リソースノードのINTERACT_RANGE内に入れず、HARVESTが一度も実行されない。

## 原因の候補

1. **MOVEの力と摩擦のバランス**: MOVE_FORCE=80, FRICTION_COEFFICIENT=0.8 の組み合わせで、
   1tickあたりの移動距離が小さく、5tick（move_counter上限）では到達しない可能性
2. **SENSE結果の角度精度**: 整数丸め（0-359度）による方向のずれ
3. **プログラムのロジック**: state=1(MOVE)で5tick移動した後state=0に戻り再SENSEするが、
   SENSEのたびに最も近い対象が変わる可能性
4. **距離判定**: SENSE結果のdistanceが整数丸めで、distance < 2 のチェックが厳しい

## 調整方針

- move_counter上限を増やす（5→20等）
- INTERACT_RANGEを確認（v3のデフォルト値1.5）
- distance < 2 の閾値をINTERACT_RANGEに合わせる
- 物理パラメータのチューニング
