> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 4 工作的内部蓝图。
# Day 4 — 多层地图 & 层间跳跃（Via 节点）⚡关键里程碑

> 目标：把单层迷宫扩展为 3 层独立结构，通过 Via 节点支持上下切层，配合淡入淡出转场动画。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 多层数据存储 | `MapManager` 持 `Tile[][][]`，按 layer 索引 | `getTile(c, r, layer)` 三层都返回正确 |
| Via 放置算法 | `MazeGenerator.placeVias` | 每对相邻层放 K 对 Via，源/目位置都是 FLOOR |
| Via 目标记录 | `Tile.viaTarget?: number` | VIA 瓦片可读出目标层号 |
| 切层状态机 | `GameEngine` 增加 transition 阶段 | 踩 Via 触发 OUT→swap→IN 三阶段，全程锁输入 |
| 转场动画 | 淡入黑→换层→淡出黑 | 视觉无跳变，时长 ≈ 500ms |
| Via 视觉 | `TileSet.drawVia` 改为带方向三角 | 上行 / 下行肉眼可分 |
| HUD 层数 | `UIOverlay.drawHUD` + ArkUI Text | "Layer N" 切换后立即更新 |

## 二、设计决策

### 2.1 多层结构

```
MapManager
├── layers: Tile[][][]       // [layer][row][col]
├── readonly layerCount: number = 3
└── 每层独立迷宫种子，互不相同
```

接口已在 Day 2 预留 `layer` 形参，Day 4 把实现从"忽略 layer"改为"按 layer 索引"，调用方零改动。

### 2.2 Via 配对：**同坐标跨层**

| 层对 | 源 | 目 | 数量 |
|------|----|----|------|
| L0 ↔ L1 | L0 (c,r) UP-Via → L1 | L1 (c,r) DOWN-Via → L0 | 2 对 |
| L1 ↔ L2 | L1 (c,r) UP-Via → L2 | L2 (c,r) DOWN-Via → L1 | 2 对 |

- **同 (col,row) 配对**：踩 Via 不改变水平坐标，避免"切层后玩家不知道自己在哪"
- 总计 8 个 VIA tile（L0:2, L1:4, L2:2）
- 候选选取：源 & 目两层都为 FLOOR 的 cell；若数量不足，把 WALL→FLOOR 强行凿开（不会破坏连通性，递归回溯算法的 FLOOR 是连通的，只增节点）

### 2.3 Tile 扩展

```typescript
export class Tile {
  type: TileType;
  viaTarget?: number;        // 仅 VIA 时有值，记录目标层号
  constructor(type: TileType, viaTarget?: number) { ... }
}
```

方向（上行/下行）通过 `viaTarget vs currentLayer` 比较得到，不引入新的 enum 值，保持 5 种瓦片类型不变。

### 2.4 GameEngine 状态机

```
        tryMove                  tick→done            tick→done
IDLE ─────────────► MOVING ─────────────────────► (landed on VIA?)
  ▲                                                      │ Yes
  │                                                      ▼
  │                                              TRANSITION_OUT
  │                                                      │ progress→1
  │                                                      ▼
  │                                       (currentLayer = viaTarget)
  │                                                      │
  │                                                      ▼
  │                                              TRANSITION_IN
  │                                                      │ progress→1
  └──────────────────────────────────────────────────────┘
```

- `tryMove` 仅 IDLE 时接受输入
- transition 阶段共享 `progress: 0..1`，速度 0.05/tick → 20 tick ≈ 320ms 每阶段，总 ≈ 640ms（接近"半秒切层"手感）
- `currentLayer` 在 OUT 完成的瞬间 swap，玩家 (col, row) 不变（同坐标配对）

### 2.5 转场视觉

`UIOverlay.drawFade(ctx, w, h, alpha)`：在所有内容之上覆盖黑色矩形，alpha 由 engine 提供。
- TRANSITION_OUT：alpha = progress（0→1）
- TRANSITION_IN：alpha = 1 - progress（1→0）
- IDLE / MOVING：跳过

### 2.6 Via 几何（TileSet.drawVia 改造）

地板 + 三角箭头：
- 上行：三角朝上，亮蓝 `#5ec0ff`
- 下行：三角朝下，暗蓝 `#2a78c8`
- 三角中心位于地板中心，尺寸 ≈ halfW × halfH

### 2.7 HUD：双源策略

- **ArkUI Text**：`@State currentLayer` 绑定，主显示
- **UIOverlay.drawHUD**：Canvas 左上角附加 "L{n}/2" 小标签，方便截图/演示时永远可见
- 选择双源是因为转场动画期间 ArkUI 顶部 Text 不变，Canvas 标签可与 fade 同步淡化

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/game/render/
└── UIOverlay.ts        # 转场 fade + Canvas 内层数标签
```

### 修改

- `game/types/TileType.ts` — `Tile` 增 `viaTarget?: number`
- `utils/MazeGenerator.ts` — 增 `static placeVias(layers, rng, perPair)`；导出公开 `Rng` 给外部种子分发
- `game/core/MapManager.ts` — 持有 `Tile[][][]`，构造时按 `layerCount` 生成各层并调 placeVias
- `game/core/GameEngine.ts` — 增 `currentLayer / transitionPhase / transitionT`；扩展 tick 推进 transition；tryMove 在 transition 中拒绝
- `game/render/TileSet.ts` — `drawVia` 改造为方向感知；`drawTile` 多传 `tile`（带 viaTarget）与 `currentLayer`
- `game/render/IsoRenderer.ts` — `drawMap` 透传 `currentLayer` 与 `tile` 给 TileSet
- `pages/GamePage.ets` — 引入 `UIOverlay`；ArkUI Text 绑定 `@State currentLayer`；tick 回调同步 currentLayer
- `docs/TODO.md` — Day 4 勾选

## 四、实施步骤

1. **Tile** 加 `viaTarget?`
2. **MazeGenerator**：把现有 `generate` 留作单层；新增 `placeVias` 静态方法，对每对相邻层选 K 个候选 cell（FLOOR ∩ FLOOR），标 VIA + viaTarget
3. **MapManager**：构造时循环生成 `layerCount` 层，最后调 `placeVias` 串联各层 Via
4. **GameEngine**：
   - 新增枚举 `EnginePhase { IDLE, MOVING, TRANSITION_OUT, TRANSITION_IN }`（或字符串常量）
   - `tick()` 推进当前阶段；MOVING 完成后 detect VIA，进入 TRANSITION_OUT；TRANSITION_OUT 完成时 swap currentLayer，进 IN；IN 完成回 IDLE
   - 新增 getter：`currentLayer / transitionAlpha`
5. **TileSet.drawVia** 改造，`drawTile` 加 `currentLayer` 形参
6. **IsoRenderer.drawMap** 透传 currentLayer + tile 到 drawTile
7. **UIOverlay**：导出 `drawFade(ctx, w, h, alpha)`、`drawLayerLabel(ctx, layer, max, x, y, alpha)`
8. **GamePage**：
   - `@State currentLayer = 0`
   - tick 回调同步 `this.currentLayer = engine.currentLayer`
   - 顶部 ArkUI Text 改为 `'Layer ' + this.currentLayer + '/' + (TARGET_LAYERS - 1)`
   - renderMap 末尾追加 `drawFade` + `drawLayerLabel`

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入游戏：HUD 显示 Layer 0
- [ ] 玩家走到 VIA 时：屏幕淡入黑（≈300ms）→ 瞬间换层 → 淡出黑
- [ ] 切层后 HUD 立即更新为新层号
- [ ] 三层之间可来回切换：L0→L1→L2→L1→L0
- [ ] 转场过程中输入被锁定，无法 tryMove
- [ ] 上行 VIA / 下行 VIA 视觉可区分（亮/暗蓝、三角朝向）
- [ ] 每层迷宫**不同**（独立种子）
- [ ] 控制台无报错；连续切层 20 次无掉帧

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| Via 候选不足（极小概率） | 13×13 中两层共同 FLOOR 太少 | placeVias 内 fallback：强行 carve WALL→FLOOR，不破坏连通性 |
| transition tick 与 player tick 共用 timer 起停不一致 | MOVING 结束 timer 被 stop 但 transition 还要继续 | startLoop 改为根据 phase ∈ {MOVING, TRANSITION_*} 持续运行，IDLE 才 stop |
| Tile 字段扩展破坏序列化 | 现阶段无序列化，无影响 | 忽略 |
| ArkTS 不支持类的可选字段 `?:` 语法 | 编译报错 | 改为 `viaTarget: number = -1`（哨兵值） |
| 切层动画期间用户返回主菜单 | aboutToDisappear 时 timer 在跑 | stop() 内强制清除所有 phase 与 interval |

## 七、Day 4 不做的事

- 不做 Via 锁定/解锁（Day 5 ViaUnlock）
- 不做信号碎片拾取（Day 5）
- 不做动态地图重构（Day 6）
- 不做层切换音效（Day 8）
- 不做"层间瞭望"特效（如能看到上层透视轮廓），视觉留到 Day 8
- 不做异层 VIA 跨越（如 L0 直达 L2），仅相邻层
