> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 5 工作的内部蓝图。
# Day 5 — 解谜元素：信号碎片 & 逻辑门

> 目标：在已有 3 层迷宫上加入「拾取信号碎片 → 解锁逻辑门 → 解锁上行 Via」的核心解谜回路，并配套芯片知识科普弹窗。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 碎片放置 | `MazeGenerator.placeFragments` | 每层 3 个 FRAGMENT，不与起点 / VIA / GATE 重叠 |
| 碎片拾取 | `GameEngine.advance` 落点检测 | 走到碎片：计数 +1、tile 变 FLOOR、触发 Dialog 回调 |
| 逻辑门 | `placeGates` + `GateLogic.canPass` | 每层 1 个 GATE，碎片数 ≥ 阈值才能走过去 |
| Via 锁定 | `placeVias` 标 `locked` + `ViaUnlock.canTrigger` | 上行 VIA 默认锁定，需集齐当前层全部碎片才能切层 |
| 科普弹窗 | `ChipFacts.ts` + ArkUI AlertDialog | 拾取碎片即弹一句芯片知识，可关闭 |
| HUD 计数 | `UIOverlay.drawFragmentBadge` + ArkUI Text | 屏幕显示当前层「碎片 x/3」 |

## 二、设计决策

### 2.1 数据扩展

`Tile`：
```typescript
export class Tile {
  type: TileType;
  viaTarget: number;      // -1 哨兵（Day 4）
  locked: boolean;        // Day 5：GATE/上行 VIA 默认 true，解锁后置 false
}
```

新建 `game/data/ChipFacts.ts`：
- 导出 `CHIP_FACTS: string[]`（10 条左右）
- 导出 `pickFact(rng | counter)`：每次拾取顺序取一条，避免重复

### 2.2 碎片放置策略

每层 3 个 FRAGMENT：
1. 收集该层所有 FLOOR cell（排除起点 (1,1)、外圈、已是 VIA/GATE 的 cell）
2. 候选 < 3 时降到候选实际数量（小概率场景，13×13 上几乎不可能发生）
3. 随机抽 3 个 → 标 `type = FRAGMENT`

### 2.3 GATE 放置策略

每层 1 个 GATE：
- 在候选 FLOOR cell（同上排除清单 + 排除已成为 FRAGMENT 的 cell）里随机选 1 个
- 标 `type = GATE`，`locked = true`
- **不做 BFS 路径分析**：13×13 迷宫只有 ~36 FLOOR，门后即使有碎片，玩家也能先拾取门外/门后任一碎片后回头解锁。死锁概率极低，暂不处理。

### 2.4 阻挡与解锁规则

| 瓦片 | 默认 locked | 解锁条件 | 阻挡时机 |
|------|------------|----------|----------|
| FRAGMENT | — | 走上即拾取 | 无阻挡（走上后变 FLOOR） |
| GATE | true | `fragments[layer] ≥ GATE_THRESHOLD (=1)` | `tryMove` 拒绝进入 locked GATE |
| VIA 上行 | true | `fragments[layer] ≥ VIA_THRESHOLD (=3)` | 允许踩上，但 `advance` 检测到 locked 不触发切层 |
| VIA 下行 | false | — | 直接切层 |

GATE 阻挡放在 `tryMove`，与"撞墙"同语义，玩家直观；VIA 锁定放在落点检测，玩家踩上后仍可继续探索，符合"踩到门但要先回去找钥匙"的解谜手感。

### 2.5 GameEngine 新增

```typescript
private _fragments: number[];           // 每层已拾取计数
private _fragmentTotals: number[];      // 每层初始总数（HUD 显示 x/total）
private onFragmentPicked: (factText: string) => void;
```

- 构造时遍历 `MapManager` 统计各层 FRAGMENT 总数 → `_fragmentTotals[L]`
- `tryMove`：目标 GATE && locked → 拒绝
- `advance` MOVING done 分支：
  - tile == FRAGMENT → `_fragments[currentLayer]++`，tile.type 改 FLOOR，回调 `onFragmentPicked(pickFact(...))`，调 `GateLogic.unlockAllInLayer(map, currentLayer, _fragments[currentLayer])` 和 `ViaUnlock.unlockAllInLayer(...)` 检查解锁
  - tile == VIA && !locked → 进入 TRANSITION_OUT（同 Day 4）
  - tile == VIA && locked → 留 IDLE，不切层（玩家"踩到锁定的 VIA"无视觉反馈也可，HUD 上的"碎片 x/3"会暗示原因；MVP 不加额外提示）

### 2.6 GateLogic / ViaUnlock 模块

两者都是无状态的静态工具：

```typescript
// puzzle/GateLogic.ts
export class GateLogic {
  static readonly THRESHOLD: number = 1;   // 解锁所需碎片数
  static canPass(tile: Tile, fragmentCount: number): boolean;
  // 扫描该层所有 GATE，把符合阈值的全部解锁
  static unlockAllInLayer(map: MapManager, layer: number, fragmentCount: number): void;
}

// puzzle/ViaUnlock.ts
export class ViaUnlock {
  static readonly UP_THRESHOLD: number = 3;   // 上行 VIA：需全收集
  static canTrigger(tile: Tile, currentLayer: number, fragmentCount: number): boolean;
  static unlockAllInLayer(map: MapManager, layer: number, fragmentCount: number): void;
}
```

把阈值参数化到模块内，便于 Day 9 调难度时单点修改。

### 2.7 视觉

- **FRAGMENT**：沿用 Day 4 黄色菱形（`drawFragment`）；不加闪烁动画（Day 8 处理）
- **GATE locked**：红色三道横杠（"门栅"），上面叠"锁"图（小方框）
- **GATE unlocked**：地板 + 淡绿提示边框，区分"已解锁的曾门"
- **VIA locked 上行**：地板 + 暗灰三角（替代亮蓝），外圈暗红警示
- **VIA unlocked 上行**：沿用 Day 4 亮蓝三角
- **VIA 下行**：沿用 Day 4 暗蓝三角

### 2.8 HUD 与 Dialog

- Canvas 左上角"L n/2"右侧追加"◆ x/3"碎片角标（`drawFragmentBadge`）
- ArkUI 顶部 Text 改为：`'TauRealmMaze · Layer ' + currentLayer + '/2 · ◆ ' + currentFragments + '/' + currentFragmentTotal`
- 拾取碎片：`AlertDialog.show({ title: '信号碎片 +1', message: factText, ... })`，单按钮"继续"关闭

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/
├── game/
│   ├── data/
│   │   └── ChipFacts.ts        # 科普文本池 + 顺序取
│   └── puzzle/
│       ├── GateLogic.ts        # GATE 解锁判定
│       └── ViaUnlock.ts        # 上行 VIA 解锁判定
```

### 修改

- `game/types/TileType.ts` — `Tile` 增 `locked: boolean`
- `utils/MazeGenerator.ts` — `placeVias` 把上行 VIA 标 `locked = true`；新增 `placeFragments` 与 `placeGates`
- `game/core/MapManager.ts` — 构造时按序调 `placeVias → placeFragments → placeGates`
- `game/core/GameEngine.ts` — `_fragments`、`_fragmentTotals`、拾取回调；`tryMove` 阻挡 locked GATE；`advance` 落点检测加 FRAGMENT / VIA locked 分支
- `game/render/TileSet.ts` — `drawGate` 区分 locked/unlocked；`drawVia` 增 `locked` 形参影响色相
- `game/render/IsoRenderer.ts` — `drawTile` 调用透传无需变更（参数已覆盖）；若 `drawVia` 签名变化需同步
- `game/render/UIOverlay.ts` — 新增 `drawFragmentBadge`
- `pages/GamePage.ets` — 引入 ChipFacts；@State `currentFragments` / `currentFragmentTotal`；引擎 `setFragmentPickedCallback`；AlertDialog 弹窗；HUD 文本扩展
- `docs/TODO.md` — Day 5 勾选 + 完成日期

## 四、实施步骤

1. **Tile**：加 `locked: boolean = false`
2. **ChipFacts.ts**：导出 10 条科普 + `pickFact(index)` 取模循环
3. **MazeGenerator**：
   - `placeVias` 末尾给上行 VIA 设 `locked = true`，下行保持 `false`
   - 新增 `placeFragments(layers, rng, perLayer)`
   - 新增 `placeGates(layers, rng, perLayer)`
4. **MapManager.constructor**：依次 `placeVias → placeFragments → placeGates`
5. **GateLogic / ViaUnlock**：实现静态方法
6. **GameEngine**：
   - 加 `_fragments` / `_fragmentTotals` / `onFragmentPicked`
   - 加 `setFragmentPickedCallback`
   - `tryMove`：目标 GATE && locked 拒绝
   - `advance`：MOVING done 增加 FRAGMENT / locked VIA 分支
7. **TileSet.drawGate / drawVia**：加 locked 视觉分支
8. **UIOverlay.drawFragmentBadge**：右侧角标
9. **GamePage**：
   - `@State currentFragments / currentFragmentTotal`
   - `setFragmentPickedCallback` 内 `AlertDialog.show` + 同步 `currentFragments`
   - HUD Text 扩展
10. **TODO.md** 勾选

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入游戏：HUD "Layer 0/2 · ◆ 0/3"
- [ ] 走到碎片：弹 Dialog 显示一条科普 + 计数变 1/3
- [ ] 集齐 1 个碎片后：本层 GATE 可通过（推门动画无强制要求，视觉变化即可）
- [ ] 集齐 3 个碎片后：本层上行 VIA 视觉由灰转亮蓝；踩上去触发切层
- [ ] 切到上层后：HUD `currentFragments` 重置为该层已拾取数（≥0）
- [ ] 下行 VIA 始终可用（回退不受锁）
- [ ] 连续 5 次 Build / 重生：无控制台报错；流程稳定

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| GATE 阻断玩家所有路径 | 13×13 中门挡死出口 | 阈值仅 1 个碎片 + 玩家可回头；如频繁出现，改为门后必有 1 碎片 |
| Dialog 弹出期间 tick 仍在跑 | 引擎 `setInterval` 不受 ArkUI 弹窗暂停 | 拾取瞬间 phase 已回 IDLE，timer 自然停；后续 tryMove 被 Dialog 拦截层接管 |
| `AlertDialog.show` 在 .ts 文件不可用 | ArkUI Dialog 仅可在 .ets `@Component` 内调用 | 回调签名为 `(factText: string) => void`，由 `GamePage.ets` 实现 Dialog 调用 |
| 重生（initEngine）后 HUD 计数残留 | @State 未重置 | initEngine 内显式 `currentFragments = 0` |
| FRAGMENT/GATE 数量不足 | placeFragments 候选 < 3（理论上极小） | 静默降到实际数量；HUD `total` 用 engine 统计值，不写死 3 |
| 上行 VIA locked 玩家不知缘故 | 踩 VIA 无反馈 | MVP 接受：HUD 上"◆ x/3"自带暗示；Day 8 可加文字提示 |

## 七、Day 5 不做的事

- 不做 GATE / VIA 解锁动画（仅静态色相变化；Day 8 视觉润色）
- 不做"碎片闪烁脉冲"
- 不做 GATE / 碎片放置的连通性 BFS 校验（信任 13×13 上随机分布足够鲁棒）
- 不做拾取音效（Day 8 可选）
- 不做"全部碎片集齐 → 全局通关"判定（Day 7 ResultPage 处理）
- 不做动态地图重构（Day 6）
