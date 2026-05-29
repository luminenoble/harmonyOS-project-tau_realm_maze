> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 6 工作的内部蓝图。
# Day 6 — 动态地图（移动迷宫机制）⚡关键里程碑

> 目标：每 20 步触发一次玩家所在层的局部重构（开 K 个 WALL + 关 K 个 FLOOR），配套红色警告与青绿/红色脉冲动效，并保证不破坏连通性导致死局。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 步数计数 | `GameEngine._stepCount` + `stepsUntilRestructure` getter | 侧栏 HUD「下一次重构 N 步」实时刷新；只数成功 tryMove |
| 重构算法 | `game/core/Restructurer.ts` | 开/关 K=2 个 cell，BFS 校验通过；返回 `{opened, closed}` |
| 警告动效 | `UIOverlay.drawWarningOverlay` + `GameEngine.warnPulseAlpha` | ~480ms 全屏红色 sin-pulse + 中央「信号重路由中...」文字 |
| 应用变更 | WARN 末尾自动 apply | warn 进度到 1.0 时一次性改写 tile，紧接 PULSE |
| 改动高亮 | `IsoRenderer.drawRestructurePulse` + `GameEngine.pulseAlpha` | opened cell 青绿菱形、closed cell 红色顶面方块，alpha 1→0 渐隐 |
| 玩家位置安全 | Restructurer 候选过滤 | 玩家所在 cell 不参与关闭；BFS 起点为玩家 |
| 连通性约束 | Restructurer 内 BFS | 每次"试关"后，玩家可达全部 FRAGMENT + VIA；若有 locked GATE 且 fragments 不足，pre-GATE 区仍保留 ≥1 fragment |

## 二、设计决策

### 2.1 状态机扩展

```
EnginePhase 新增：
  RESTRUCTURE_WARN   ← 警告 + 应用
  RESTRUCTURE_PULSE  ← 改动高亮渐隐

转移图：
  IDLE ── tryMove ─▶ MOVING
  MOVING ── landed ─▶ {IDLE / TRANSITION_OUT}
  TRANSITION_IN ── done ─▶ IDLE
  在每个进入 IDLE 之前调用 maybeStartRestructure()：
    若 stepCount > 0 且 stepCount % 20 === 0 → RESTRUCTURE_WARN
  RESTRUCTURE_WARN ── t→1, apply ─▶ RESTRUCTURE_PULSE
  RESTRUCTURE_PULSE ── t→1 ─▶ IDLE
```

- `stepCount` 在 `tryMove` 成功（开始动画）时 +1
- 切层不算"一步"
- 跨层共享计数：玩家不能用切层规避重构

### 2.2 重构算法（Restructurer.apply）

```
输入：layer (Tile[][]), playerCol, playerRow, rng, opens=2, closes=2, fragmentsOnLayer
输出：{ opened: number[][], closed: number[][] }
```

**Pass 1 — 开（WALL → FLOOR）**：
- 候选：所有内圈 WALL（排除外圈外墙：行/列 ∈ [0, size-1]）
- 洗牌后取前 opens 个，**直接改 type**（添加通道不会破坏连通性）

**Pass 2 — 关（FLOOR → WALL）**：
- 候选：所有 FLOOR cell，排除：
  - 玩家当前 cell（不能让玩家变墙里）
  - (1,1) 起点（保留语义）
  - 特殊瓦片（VIA / GATE / FRAGMENT）
- 洗牌后**逐个试关 + BFS 校验**：
  1. 备份原 Tile
  2. 临时改 type = WALL
  3. BFS 从玩家出发：要求 **所有 FRAGMENT + 所有 VIA 仍可达**（GATE 视为可通行，即假定将来都能解开）
  4. 若该层存在 locked GATE 且 fragmentsOnLayer < `GateLogic.THRESHOLD`：再做一次 BFS（locked GATE 视为墙），要求 pre-GATE 区仍有 ≥1 个 FRAGMENT
  5. 通过 → 加入 closed 列表；不通过 → 回退
- 不足 closes 个时按实际成功数返回（视觉上仍是"关了 N 个"）

### 2.3 BFS 复用

Day 5 已经把 BFS 写在 `MazeGenerator.bfsReachable`（私有）。Day 6 要在 Restructurer 调用，方案：
- 把 `bfsReachable` 提为 **public static**
- 加可选参数 `gatesBlock: boolean = true`：
  - `true`（默认）：locked GATE 当墙；初始生成时所有 GATE 都 locked，行为与原版一致
  - `false`：GATE 总是可通行；用于"假设门都能开"的连通性校验
- 同时把"锁定感知"加入判定：`gatesBlock && tile.type===GATE && tile.locked` 才算墙（Day 5 行为是 GATE 无脑当墙，因为那时门刚生成必锁定；新语义对运行时更准确）

### 2.4 警告 / 脉冲动效

| 阶段 | 时长 | 速率 | 视觉 |
|------|------|------|------|
| WARN | 30 tick ≈ 480ms | 1/30 per tick | 全屏红 alpha = 0.35 + 0.2·sin(t·π·4)（连续 2 次脉冲） + 中央白红文字 |
| PULSE | 30 tick ≈ 480ms | 1/30 per tick | opened/closed cell 上叠加颜色，alpha = 1 - t |

WARN 末尾（t==1 那一帧）apply 一次重构，避免玩家在 WARN 中看到地图突变。
PULSE 始末玩家完全看到新地图；高亮渐隐到 0 后回 IDLE。

### 2.5 玩家位置安全

- Restructurer 的 close 候选过滤掉玩家 cell
- 即使玩家四邻全被关：BFS 校验会发现"玩家可达集只剩自己"，所有 close 都 revert，结果是无关（opened 仍可能有）。绝不可能让玩家被墙吃掉。
- 起点 (1,1) 同样排除，防止"重生 = 撞墙"

### 2.6 HUD

侧栏 Sidebar 增加一行：
```
下一次重构
N 步
```

N 从 20 → 1 → 20（触发后立刻 reset 到 20）。颜色用警示橙 `#ff9a40`。

### 2.7 性能

- BFS 是 O(rows·cols) ≈ 169 节点 × 4 邻接 ≈ <1000 操作；每次 close 试探一次，最多 2 次；每 20 步触发一次。
- 总开销远低于每帧渲染开销，无需优化。

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/game/core/Restructurer.ts
docs/day6/day6-plan.md
```

### 修改

- `utils/MazeGenerator.ts` — `bfsReachable` 改 public + 加 `gatesBlock` 参数（locked 感知）
- `game/core/MapManager.ts` — 新增 `getLayer(L): Tile[][]`，让 Restructurer 直接读写
- `game/core/GameEngine.ts` — 引入 `Rng` 实例；`EnginePhase` 加 WARN/PULSE；`_stepCount`、`stepsUntilRestructure`、`warnPulseAlpha`、`pulseAlpha`、`lastOpenedCells`、`lastClosedCells` 等 getter；`tryMove` 加计数；`advance` 加新分支；`onPlayerLanded` 与 TRANSITION_IN 末尾调用 `maybeStartRestructure`
- `game/render/IsoRenderer.ts` — `drawRestructurePulse(ctx, cfg, layer, opened, closed, alpha, wallH)`
- `game/render/UIOverlay.ts` — `drawWarningOverlay(ctx, w, h, alpha)`
- `pages/GamePage.ets` — Sidebar 加"重构倒计时"行；renderMap 末尾追加 `drawRestructurePulse` + `drawWarningOverlay`
- `docs/TODO.md` — Day 6 勾选 + 完成日期

## 四、实施步骤

1. **MazeGenerator**：bfsReachable 提 public + gatesBlock 参数；isPassableForBfs 内联
2. **MapManager**：getLayer(L) → Tile[][]
3. **Restructurer**：apply()
4. **GameEngine**：状态机 + 计数 + 调度
5. **UIOverlay.drawWarningOverlay** + **IsoRenderer.drawRestructurePulse**
6. **GamePage**：HUD 行 + 渲染调用
7. **TODO** 勾选

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入游戏：Sidebar 显示"下一次重构 20 步"
- [ ] 第 1 步：显示 19 步；持续递减至 1
- [ ] 第 20 步：屏幕红色 sin 脉冲 ~500ms + 中央"信号重路由中..."文字
- [ ] WARN 末尾：地图局部变化（看到 ≥1 个新通道 / 新墙），紧接 ~500ms 青绿/红高亮渐隐
- [ ] 第 21 步：Sidebar 重置为 19 步（即下一轮要 20 步）
- [ ] 连续 100 步：所有重构都不导致死锁；玩家从未被关进墙
- [ ] 切层后仍按累计 stepCount 触发；切层期不会被 WARN 打断
- [ ] 拾取碎片与重构同时发生：Dialog 显示 + WARN 红屏，二者共存不冲突

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| 全部 close 候选都破坏连通 | 极小迷宫 / 玩家被孤立 | apply 内回退所有失败 close，本轮可能 0 关 + 2 开，视觉仍触发 PULSE |
| 玩家被四邻关墙包围 | 不可能：close 候选不含玩家相邻 cell 的连通性约束 + BFS 校验 | 已防御 |
| Dialog 与 WARN 同时 | 拾取碎片落点恰为 step 20 | 接受：AlertDialog 系统级浮层，引擎 tick 继续，视觉上"红屏 + 弹窗" |
| WARN 期间切层 | tryMove 拒绝（phase != IDLE）；正常 | OK |
| HarmonyOS Canvas globalAlpha 状态泄漏 | 已知 Day 4 问题 | drawWarningOverlay / drawRestructurePulse 每个函数尾显式 globalAlpha = 1 |
| BFS 共享 visited 数组复用 | 多次调用 | 每次新建二维数组，无共享 |

## 七、Day 6 不做的事

- 不做 90° 等距旋转（TODO 标"可选难度强化"；推到 Day 8 视觉润色阶段）
- 不做重构音效
- 不做"重构倒计时"高级动效（数字下降 tween）；纯 ArkUI Text 重绘即可
- 不做"上一轮变化区域"持久标记；PULSE 结束即遗忘
- 不做多层同步重构；只重构玩家当前所在层
