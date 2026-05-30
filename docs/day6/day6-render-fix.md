> 注：由 Claude Code (Opus 4.7) 协助排查与修复。
# Day 6 修复：玩家移动时角色部分/全部消失

## 现象

开发者反馈：操控的角色（青绿小棱柱）在移动过程中刷新容易"先地面再角色"地闪烁，连续按方向键时角色偶尔**部分或全部消失**。
初步假设：`setInterval` 与屏幕刷新率不同步导致的撕裂。

## 根因（与初判不同）

**主因不是 setInterval，而是 painter's algorithm + 玩家浮点坐标的几何遮挡问题。**

原始 `IsoRenderer.drawMap` 把所有 cell 和玩家放进同一个 painter's 排序列表，按 `row+col` 升序绘制。
玩家排序键写作 `visualCol + 0.001`、`visualRow + 0.001`，**只比同格 cell 略大**，但比"前方格"（`row+col` 大 1 以上）都小。

举例：玩家从 (5, 5) 走向 (6, 5)，途中处于 (5.5, 5)：

| 项 | sort key |
|----|----------|
| 玩家 | 5.5 + 5 + 0.002 = 10.502 |
| 前方格 (6, 5) 的 FLOOR | 11.000 |

前方格的 FLOOR **晚于玩家绘制**。它的菱形左半部（顶尖 `(originX, 11·halfH)`）与玩家底面（横跨 5/6 两格，y 下沿 ≈ `11.1·halfH`）几何上**有重叠**。

后画的 FLOOR 覆盖了玩家底面右下角的像素 → 视觉上"角色右下一块缺失"。

**为什么"连续按键更明显"**：连按时玩家几乎一直处于浮点中间态（visualCol 一直不是整数），覆盖每一帧都在发生；间歇按时玩家有更多时间处于整数格状态（key 与同格 cell 持平），覆盖窗口短得多。

**setInterval 撕裂确实也存在**，但只会让"边缘像素少一两行"，不至于让整个右下角缺失。所以是次要因素。

## 方案：两遍渲染（floor-pass + sprite-pass）

经典 iso 范式。把"地面"和"立体物"拆成两个 pass：

```
Pass 1 — 地板层（row-major 无排序）
  ▸ 每个 cell 先画 FLOOR 菱形（包括 WALL cell 的"墙脚地板"，垫底）
  ▸ 非 WALL cell 继续画地面标识：VIA 三角 / GATE 栅 / FRAGMENT / THERMAL_VIA 等

Pass 2 — 立体层（painter's 排序）
  ▸ 收集：所有 WALL 块 + 玩家
  ▸ 共用 row+col key 排序
  ▸ 玩家 key 加 0.001，与同格 WALL 偏向"靠前"
  ▸ 顺序绘制：drawWall 只画墙块（地板 pass 1 已画），drawPlayer 画棱柱
```

### 为什么修好了

- **扁瓦片不再排在玩家之后**：所有地板在 pass 1 就画完，pass 2 只画立体物。前方格的 FLOOR 不再有机会覆盖玩家底面 → 几何遮挡消失。
- **墙后/墙前遮挡仍正确**：WALL 块和玩家共用 painter's 排序。玩家走到墙后（玩家 row+col < 墙），墙后画 → 墙覆盖玩家上半身；玩家走到墙前（玩家 row+col > 墙），墙先画 → 玩家覆盖墙上端。立体感保留。
- **性能略提速**：pass 1 不排序（169 个 cell row-major 遍历），pass 2 只排约 30–50 个 sprite（WALL + 玩家），比原本 170 个 item 全排序少。

### 为什么不影响其他层

`drawTile` 内部分派对 VIA / GATE / FRAGMENT / THERMAL_VIA 都包含"先 drawFloor"，pass 1 直接复用未改动。
仅 WALL 这一个分支做了"拆分"——pass 1 调 `drawFloor` 替代 `drawTile(WALL)`，pass 2 调 `drawWall` 只画墙块。
TileSet.ts 完全不动。

## 代码改动

仅 `app-storage/entry/src/main/ets/game/render/IsoRenderer.ts`：

- 引入 `drawFloor` / `drawWall` 自 TileSet，引入 `TileType` 自 types
- 移除 `KIND_CELL` 常量；改用 `KIND_WALL`
- `drawMap` 重写为两 pass 结构，约 70 行（与原版相近）

签名不变：`drawMap(ctx, map, cfg, wallH, layer, player?, playerH?)`。所有调用方（`GamePage.renderMap`）零改动。

## 验证清单（请在 DevEco 跑一遍）

- [ ] 正常移动：角色棱柱完整，无右下角缺失 / 闪烁
- [ ] **连续按方向键**：原本最易触发缺失的场景，现在角色应保持完整
- [ ] 角色走到墙后（沿 row+col 降序方向，墙在玩家"前方"）：墙正确遮挡玩家上半身
- [ ] 角色走到墙前（沿 row+col 升序方向，墙在玩家"身后"）：玩家覆盖墙，立体感保留
- [ ] FRAGMENT / VIA / GATE / THERMAL_VIA 的地面标识仍正常显示
- [ ] 重构 PULSE 阶段：opened 青绿 / closed 红高亮位置无错位（drawRestructurePulse 在 drawMap 之后调用，不受影响）
- [ ] 切层转场 / 警告 / 弹层：UIOverlay 覆盖层位置正常

## 残余风险

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| 仍有轻微闪烁（撕裂） | HarmonyOS Canvas 不做原子 swap，setInterval 与 vsync 异相 | 后续可加 OffscreenCanvas 缓存静态地图，每帧 drawImage + 玩家；先观察两遍渲染后是否还能感知 |
| 玩家上一帧残影 | 不会：renderMap 入口已 clearRect + fillRect | 维持 |
| 两 WALL 同 row+col | 不可能：WALL 都在整数格 | 不需要处理 |
| 玩家与同格 WALL 同 key | 玩家 +0.001 偏移；玩家排在 WALL 之后（覆盖墙） | 当前期望：玩家走入墙的合法路径不存在（撞墙会拒绝 tryMove），不会触发 |

## 不在本修复范围

- 不引入 OffscreenCanvas（等两遍渲染验证后再决定）
- 不切换 setInterval → requestAnimationFrame（同上）
- 不重新美化角色棱柱
- 不改 Day 6 已交付的重构 / 散热 / HUD
