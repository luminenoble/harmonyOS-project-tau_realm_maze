> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 2 工作的内部蓝图。
# Day 2 — 迷宫生成 & 地图数据结构

> 目标：把 Day 1 的静态地板升级为算法生成的可玩迷宫，并在等距视角下用 Painter's Algorithm 正确处理墙体遮挡。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 瓦片类型系统 | `TileType.ts` 枚举 + `Tile` 数据 | 编译通过，类型可在 IDE 自动补全 |
| 地图数据容器 | `MapManager.ts`（Day2 单层版） | 持有 `Tile[][]`，提供 `getTile / forEach` |
| 迷宫生成算法 | `MazeGenerator.ts` 递归回溯 | 同一种子复现，不同种子结果不同，连通性正确 |
| 瓦片绘制套件 | `TileSet.ts`：地板/墙/Via/Gate/Fragment 五种绘制函数 | 每类瓦片在 Canvas 上视觉可区分 |
| 等距渲染升级 | `IsoRenderer.drawMap()` 接入 Painter's 排序 | 墙体前后遮挡正确，无 z-fighting |
| GamePage 接入 | `GamePage.ets` 调用生成 + 渲染 | 进入游戏看到随机迷宫，每次刷新不同 |

## 二、设计决策

### 2.1 迷宫尺寸：13×13 tile-grid，逻辑 6×6 cells

递归回溯算法在 **`(2N+1) × (2N+1)`** 的"厚墙"网格上最自然——奇数位置是通路，偶数位置是墙体。CLAUDE.md MVP 中的 12×12 不便对齐厚墙模型，因此 Day 2 微调为：

| 项 | Day 1 / CLAUDE.md | Day 2 实际 |
|----|-------------------|-----------|
| Tile 网格 | 5×5 / 12×12 | **13×13** |
| 逻辑 cell | — | **6×6** |
| 备注 | — | 提交时同步把 CLAUDE.md 的 12×12 改为 13×13 |

后续 Day 4 多层时仍按 13×13/层。

### 2.2 瓦片类型枚举（Day 2 全部定义，仅地板/墙完整绘制）

```typescript
export enum TileType {
  FLOOR = 0,    // 可行走地板
  WALL = 1,     // 阻挡墙体（Day 2 主角）
  VIA = 2,      // 层间通孔（Day 4 启用，Day 2 占位渲染）
  GATE = 3,     // 逻辑门障碍（Day 5 启用，Day 2 占位渲染）
  FRAGMENT = 4, // 信号碎片道具（Day 5 启用，Day 2 占位渲染）
}

export interface Tile {
  type: TileType;
  // 预留 Day 4-5 扩展字段（locked / collected / gateId 等）
}
```

Day 2 实际生成的迷宫只含 `FLOOR / WALL`；`VIA / GATE / FRAGMENT` 仅留枚举值与占位绘制色块，方便 Day 4-5 直接接入。

### 2.3 数据结构

```typescript
// MapManager.ts — Day 2 单层版
export class MapManager {
  readonly cols: number;
  readonly rows: number;
  private tiles: Tile[][];   // tiles[row][col]

  constructor(cols, rows, seed?) { ... }
  getTile(col, row): Tile { ... }
  forEach(cb: (tile, col, row) => void): void { ... }  // 行优先遍历
}
```

Day 4 会扩展为 `tiles: Tile[][][]`（按 layer 索引）。Day 2 接口先按多层友好的方式预留：`MapManager` 内部存数组，外部通过 `getTile(c, r, layer=0)` 访问。

### 2.4 递归回溯算法（迭代版）

```
function generate(cols, rows, seed):
  tiles = fill all WALL
  rng = seeded(seed)
  start = (1, 1)
  tiles[1][1] = FLOOR
  stack = [start]
  while stack not empty:
    cur = stack.top
    neighbors = unvisited cells 2 steps away (N/E/S/W), in random order
    if no neighbor:
      stack.pop
    else:
      pick first neighbor (cx, cy)
      tiles[(cur.y + cy)/2][(cur.x + cx)/2] = FLOOR   // 凿穿中间墙
      tiles[cy][cx] = FLOOR
      stack.push((cx, cy))
```

- **种子**：可选 `seed?: number`，不传则用 `Date.now()`，便于复现 bug
- **RNG**：自己实现 mulberry32（一行短的可种子化 PRNG），避免依赖 `Math.random()` 不可复现
- **边界**：第 0 行/列和最后一行/列保持 WALL，作为外墙

### 2.5 Painter's Algorithm

等距视角下越靠"屏幕下方/右方"的瓦片越靠近相机，必须**后绘制**。排序 key：

```
drawOrder = row + col   // 升序遍历
```

对每个 cell：
1. 先绘制 FLOOR 底板（即使该 cell 是 WALL，底下也铺一块地板，让墙脚有 PCB 底色统一感）
2. 再按 `TileType` 绘制其上的"突起物"：
   - WALL：等距立方块（顶面菱形 + 左侧面 + 右侧面三个多边形）
   - VIA / GATE / FRAGMENT：占位色块（Day 2 暂用纯色菱形 + 小图形标识）

由于 Day 2 全部对象都附着在同一 layer 上、且块体高度一致，单次 `(row+col)` 排序即可正确遮挡。Day 4 多层时还需把 `layer` 纳入排序 key。

### 2.6 墙体立方块几何

地板瓦片中心 `(cx, cy)`，墙高 `H`（默认 24px）。墙块的几何点：

```
T = (cx,            cy - H - halfH)   // 顶面 top
TR = (cx + halfW,   cy - H)           // 顶面 right
TB = (cx,           cy - H + halfH)   // 顶面 bottom
TL = (cx - halfW,   cy - H)           // 顶面 left

BR = (cx + halfW,   cy)               // 底面 right
BB = (cx,           cy + halfH)       // 底面 bottom
BL = (cx - halfW,   cy)               // 底面 left
```

三个可见面：
- **顶面（菱形）**：T → TR → TB → TL，最亮（`#22d3a8`）
- **右侧面（平行四边形）**：TR → BR → BB → TB，中亮（`#177a6a`）
- **左侧面（平行四边形）**：TL → TB → BB → BL，最暗（`#0f4f48`）

三色阶差异模拟受光，配合 PCB 青绿主色调。

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/
├── game/
│   ├── core/
│   │   └── MapManager.ts        # 地图数据容器（Day2 单层版，预留多层接口）
│   └── render/
│       └── TileSet.ts           # 各瓦片类型的绘制函数（含墙立方块）
├── game/types/
│   └── TileType.ts              # TileType 枚举 + Tile 接口
└── utils/
    └── MazeGenerator.ts         # 递归回溯 + mulberry32 PRNG
```

### 修改

- `game/render/IsoRenderer.ts` — 新增 `drawMap(ctx, map, cfg)`，内部按 `row+col` 排序遍历，调用 `TileSet`
- `pages/GamePage.ets` — `renderMap` 改为：构造 `MapManager` → 调用 `MazeGenerator` 填充 → 调用 `drawMap`
- `CLAUDE.md` — MVP 表中"单层网格 12×12" → "单层网格 13×13"
- `docs/TODO.md` — Day 2 各项完成后勾选

## 四、实施步骤

1. **TileType / Tile**：写最小定义，不引入 class（保持 ArkTS 友好）
2. **mulberry32 PRNG**：放在 `MazeGenerator.ts` 顶部，作为模块私有函数
3. **MazeGenerator.generate(cols, rows, seed?) → Tile[][]**：迭代版递归回溯
4. **MapManager**：薄包装，构造时调用 `MazeGenerator` 生成 tiles
5. **TileSet**：导出 `drawFloor / drawWall / drawVia / drawGate / drawFragment`，统一签名 `(ctx, cx, cy, cfg) => void`
6. **IsoRenderer.drawMap**：先清屏，再按 painter's 顺序遍历，每格先地板后突起
7. **GamePage 接入**：把 5×5 静态地图替换为 13×13 随机迷宫；保留返回按钮 + HUD
8. **联调 + 截图给用户在 DevEco Build**

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入游戏每次显示**不同**的迷宫（说明种子随机）
- [ ] 迷宫**连通**——从 (1,1) 可到达所有 FLOOR cell（生成算法天然保证）
- [ ] 墙体三面（顶/左/右）颜色阶差清晰，立体感正确
- [ ] **遮挡顺序正确**：靠近屏幕下方的墙在视觉上压住远处的墙，无穿模
- [ ] 控制台无 Canvas 报错；13×13 渲染帧率主观流畅

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| Painter's 排序错误导致穿模 | 墙体之间互相覆盖错位 | 降级方案：把 cells 拆成 `{floor 层, wall 层}` 两遍 pass，每 pass 内排序 |
| ArkTS 不支持 enum / interface 某些语法 | 编译报错 | enum 改为 `const` 对象 + 字符串字面量；interface 改为 class |
| Canvas 渲染 169 块（13×13）卡顿 | 帧率明显下降 | Day 2 不优化（静态地图只画一次），帧率问题留到 Day 6 评估 |
| 递归回溯生成走廊太单调 | 路径过窄不好玩 | Day 2 不调整算法，Day 9 测试时再决定是否换 Prim's / room-based |
| mulberry32 在 ArkTS 中 bitwise 截断异常 | 生成结果不一致 | 改用 `Math.imul` 显式 32 位运算，必要时退化为 `Math.random()` 放弃可复现性 |

## 七、Day 2 不做的事

- 不渲染玩家角色（Day 3）
- 不实现输入与移动（Day 3）
- 不处理多层 / Via 真实跳转（Day 4，本日仅占位绘制）
- 不实现碎片拾取 / 逻辑门激活（Day 5，本日仅占位绘制）
- 不做动态地图重构（Day 6）
- 不优化渲染性能（Day 6 起视情况）
