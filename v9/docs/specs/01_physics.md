# 物理・接続 仕様

v3-v5の力ベース物理を再採用する（[5_design_decisions.md](../plan/5_design_decisions.md) Q5）。
定数値は [05_parameters.md](05_parameters.md)。

## 位置と運動の単位

- ワールドは幅 WORLD_WIDTH × 高さ WORLD_HEIGHT の連続2D空間（浮動小数点座標）
- 時間はtick単位。積分の dt = 1（係数なし）

## 運動の主体

- 運動するのは**グループ**（接続されたコンポーネントの集合。単独コンポーネントは要素数1のグループ）のみ
- グループの全メンバーはグループのワールド座標を共有する（v8と同様。ローカル座標はない）
- 資源ノード・地面の物体は動かない

## 質量

```
グループ質量 = Σ メンバーの原子数 + Σ Storage内容物の原子数
```

- 物質の質量はその原子構成の総原子数に等しい（クラフトツリーと単位を共有する）
- エネルギーは質量に寄与しない
- 例: Processor(S2B1I4) = 7、Storage(S6B1) = 7、BaseSolid = 2

## 力の合成と積分（Semi-implicit Euler）

毎tickの物理フェーズで、グループごとに:

```
F_total = Σ THRUST（作動中のActuator） + F_摩擦 + F_衝突 + F_壁
a  = F_total / mass
v' = v + a
|v'| > MAX_SPEED なら v' を MAX_SPEED に正規化   # 媒質の終端速度
if |v'| < VELOCITY_CLAMP_THRESHOLD: v' = 0       # 微小速度のスナップ（位置更新の前）
p' = p + v'
p' を [radius, WORLD_SIZE - radius] にクランプ
```

- **上限速度 MAX_SPEED を設ける**（媒質の終端速度のメタファー）。
  軽い剛体が重なり反発のバネ力で1tickに数ユニット射出される事象を防ぐために必要
  （祖先種実験で、出現直後の子部品が接続射程外へ弾き出される問題として顕在化した）
- 速度クランプは位置更新の**前**に行う（v3実装準拠。v3仕様書の記述はコードと逆だった点に注意）

## 推進（THRUST）

- 作動中のActuatorは毎tick、力ベクトルをグループへ加える:
  `F = 強さ × THRUST_FORCE_UNIT × (cos θ, sin θ)`（θは操作メモリの方向 0〜255 を 0〜2π に対応）
- 複数のActuatorの力はベクトル和
- エネルギー消費・耐久摩耗は [02_components.md](02_components.md)

## 摩擦

```
F_摩擦 = -v × FRICTION_COEFFICIENT × mass
```

（速度・質量に比例。重いグループほど終端速度が低い）

## 衝突（バネ反発）

- 衝突するのは**グループ同士**および**グループと壁**のみ。
  資源ノード・地面の物体は何とも衝突しない（0_requirement.md の決定）
- グループの衝突形状は円近似:
  `radius = COMPONENT_RADIUS × sqrt(メンバー数)`（面積比例）。
  接続状態が変わったときのみ再計算する
- 反発力（線形バネ）:

```
overlap = radiusA + radiusB - distance(A, B)
if overlap > 0:
    n = (posB - posA) / distance          # ほぼ完全重複(distance < 0.001)時は +x 方向に退避
    F = overlap × COLLISION_STIFFNESS
    Aに -n×F、Bに +n×F を加える（作用反作用）
```

- ペアの走査はグループID昇順、二重計上しない
- 壁: 各軸で半径分めり込んだ量に比例した内向きの力 + 積分後の位置クランプ（二重防御）

## 接続と辺

- 各コンポーネントは辺0〜5を持ち、辺ごとに最大1接続（最大6接続）
- コンポーネントAの辺iにBが接続されるとき、B側は対面辺 (i+3) mod 6 を使用する。
  対面辺が使用済みなら接続は失敗する（[5_design_decisions.md](../plan/5_design_decisions.md) Q6）
- 辺に幾何的な意味はない（全メンバー同座標のため）。接続トポロジと辺インデックスのみが意味を持つ
- **グループ = 接続グラフの連結成分**。接続・切断・分解・崩壊のたびに連結成分を再計算する
- 分裂時、新グループは元グループの座標・速度を引き継ぐ
- 接続はASSEMBLE時に形成される。DISCONNECTで切断できる（操作の詳細は [03_program_io.md](03_program_io.md)）
- 別グループ同士を後から接続する手段はv9では提供しない（v8と同様、組立時接続のみ）
