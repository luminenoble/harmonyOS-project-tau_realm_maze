> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 7 工作的内部蓝图。
# Day 7 — VIA 三级缓存 & τ 评级结算 ⚡关键里程碑

> 目标：把 VIA 节点分成 L1 / L2 / MEM 三类，对应 1 / 3 / 6 时钟周期延迟；
> 玩家踩上 VIA 先看进度条等延迟，再进切层动画；
> 加入 EXIT 终点瓦片，到达后跳 ResultPage，按 τ 给 S/A/B/C 评级。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| VIA 分级数据 | `Tile.viaTier`（0=L1 / 1=L2 / 2=MEM，-1=非 VIA） + `ViaTier` 枚举 | 同一坐标的上下行 VIA tier 一致；非 VIA 永远 -1 |
| 分级延迟 | `ViaUnlock.getTierDelay(tier)` → 1 / 3 / 6 | τ 累计时按返回值加 |
| 分级生成 | `MazeGenerator.placeVias` 按 1:2:3 权重分配 | 多次 seed 平均后比例稳定在 1:2:3 |
| 分级视觉 | `TileSet.drawVia` 接 tier → L1 金 / L2 银 / MEM 铜 | 一眼能区分三类 VIA；锁定态仍用灰圈 |
| 等待延迟 | `EnginePhase.VIA_WAIT` + `viaWaitT` 进度条 | L1 ≈ 200ms / L2 ≈ 600ms / MEM ≈ 1200ms |
| τ 计算 | `GameEngine.tau` = stepCount + Σ viaDelay | 每次成功穿 VIA 累加；HUD 实时刷新 |
| EXIT 瓦片 | `TileType.EXIT` + `MazeGenerator.placeExit` | 顶层 (layer N-1) 离 (1,1) 最远的 FLOOR cell |
| 通关检测 | EXIT 触发回调，要求 totalFragments == totalAll | 缺碎片时弹"还有 N 个碎片"提示 |
| 结算页 | `pages/ResultPage.ets` | 显示 τ / 步数 / VIA 分布 / 热峰 / 评级 / 返回 |

## 二、设计决策

### 2.1 VIA 分级编码

`Tile` 增字段 `viaTier: number`，约定：
- `-1` 非 VIA
- `0` = L1（黄金，延迟 1）
- `1` = L2（银，延迟 3）
- `2` = MEM（铜，延迟 6）

`ViaUnlock` 暴露：
```typescript
enum ViaTier { L1 = 0, L2 = 1, MEM = 2 }
const VIA_DELAYS: number[] = [1, 3, 6]
getTierDelay(tier: number): number
```

放在 `ViaUnlock.ts` 而非新文件，因 tier 语义与解锁紧耦合（未来可能"L1 可绕过 fragment 阈值"等扩展）。

### 2.2 VIA 分级分配

`placeVias` 写完 candidates 后增加 tier 分配阶段：

- 维护 6 元滚动数组 `TIER_ROTATION = [L1, L2, L2, MEM, MEM, MEM]`
- 全局 viaIndex 每 +1 → tier = ROTATION[idx % 6]
- 跨层全局递增（不按 pair 重置），保证整张地图比例稳定 1:2:3

不用纯随机：MVP 地图小，随机会让"无 L1 / 全是 MEM"出现频繁，破坏体验。

### 2.3 状态机扩展

```
EnginePhase 新增：
  VIA_WAIT      ← VIA 延迟等待（含进度条动画）
  VICTORY       ← 到达 EXIT 且条件满足

转移图（节选）：
  MOVING ── landed on VIA(unlocked) ─▶ VIA_WAIT
  VIA_WAIT ── t→1 ─▶ TRANSITION_OUT
  MOVING ── landed on EXIT(满足条件) ─▶ VICTORY
  VICTORY ── tick 1 帧 ─▶ IDLE + 触发 onVictory 回调
```

VIA_WAIT 时长 = `tierDelay × 12 tick`（≈200ms × delay）：
- L1（delay 1）：12 tick ≈ 200ms
- L2（delay 3）：36 tick ≈ 600ms
- MEM（delay 6）：72 tick ≈ 1200ms

`viaWaitT` 进度 0..1，UI 画一条中央水平进度条 + 顶上文字"L2-VIA · 3 cycles"。

### 2.4 EXIT 瓦片

`TileType.EXIT = 6`，新增 `MazeGenerator.placeExit(layers, rng)`：
- 仅在顶层 `layerCount - 1` 放 1 个
- 候选：BFS 从 (1,1) 可达的全部 FLOOR cell（GATE 视为可通行）
- 取 BFS 距离最大的若干 cell（≥ 距离最大值 ×0.8），从中随机 1 个 → 保证 EXIT 远离起点，路径长度有挑战
- 候选为空（极端情况）→ 退化为 (cols-2, rows-2) 强制 carve

EXIT 始终可走（不锁），但触发"通关判定"需 totalFragments == totalAll。
未集齐时仍走过去 → 引擎弹一次提示 dialog（复用 onFragmentPicked 的 dialog 通道）。

### 2.5 τ 计算与统计

GameEngine 新增字段：
```typescript
_tauVia: number               // 各次 VIA 延迟累计
_viaCounts: [number, number, number]  // [l1Count, l2Count, memCount]
_heatPeak: number[]           // 各层热量峰值（每 tick 比较）
```

`tau = _stepCount + _tauVia`，HUD 侧栏新增"τ X cyc"行。

VIA 使用统计在 onPlayerLanded → VIA 分支里加 1；heat 峰值在 advance 末尾扫一遍 max。

### 2.6 通关回调与路由

`GameEngine.setVictoryCallback(cb: VictoryCallback)`：
```typescript
interface VictoryStats {
  steps: number; tauVia: number; tau: number;
  l1: number; l2: number; mem: number;
  heatPeak: number[];
}
```

`GamePage` 监听 → 调 `router.replaceUrl({ url: 'pages/ResultPage', params: stats })`。
用 replaceUrl 让结算页返回主菜单而非回到游戏页（避免脏状态恢复）。

### 2.7 τ 评级阈值

参考一次"低 τ"路径（每层只走 5-8 步 + 全 L1 切层）：
- 理论下限 ≈ 30 步 + 2×1 = 32
- 但实际要捡 9 碎片，又有 GATE / 锁，理想路径 ≈ 50-70 步 + L1+L1 ≈ 52-72

阈值（MVP，留模糊度让玩家有冲刺空间）：
- S：τ ≤ 80
- A：τ ≤ 120
- B：τ ≤ 180
- C：τ > 180

"走线优化 X%"：`(120 - τ) / 120 × 100`（用 A 阈值做基准；负数 clamp 0）。

### 2.8 ResultPage 布局（平板横屏）

```
┌────────────────────────────────────────────────────────┐
│                  通讯链路评估                          │  大标题
│                                                        │
│      ╔═══╗     τ = 87 cyc                              │
│      ║ S ║     步数 64 + VIA 延迟 23                  │  
│      ╚═══╝     走线优化 27.5%                          │  大字号 + 评级牌
│                                                        │
│   ── VIA 使用 ──        ── 热量峰值 ──                 │
│   L1 × 2  (黄金)        Layer 0  ▓▓▓▓▓▓ 92            │
│   L2 × 1  (银)          Layer 1  ▓▓▓ 45               │
│   MEM × 0 (铜)          Layer 2  ▓▓ 30                │
│                                                        │
│         [ 再来一局 ]    [ 返回主菜单 ]                 │
└────────────────────────────────────────────────────────┘
```

参数通过 `router.getParams()` 拿。Day 8 接 AIComment 时在标题下加一段"芯片工程师评语"区。

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/pages/ResultPage.ets
docs/day7/day7-plan.md
```

### 修改

- `game/types/TileType.ts` — `Tile.viaTier` 字段 + `TileType.EXIT`
- `game/puzzle/ViaUnlock.ts` — `ViaTier` 枚举 + `getTierDelay`
- `utils/MazeGenerator.ts` — `placeVias` tier 分配；新增 `placeExit`
- `game/core/MapManager.ts` — 构造时调用 `placeExit`；公开 `totalFragments`
- `game/render/TileSet.ts` — `drawVia` 接 tier；新增 `drawExit`；`drawTile` 分派
- `game/core/GameEngine.ts` — `VIA_WAIT` 阶段 + `viaWaitT`；统计字段；EXIT 处理；victory 回调
- `game/render/UIOverlay.ts` — `drawViaProgressBar` 中央 VIA 等待条
- `pages/GamePage.ets` — 订阅 victory 回调跳 ResultPage；HUD 加 τ 行；renderMap 末尾画 VIA 进度条
- `resources/base/profile/main_pages.json` — 注册 ResultPage
- `docs/TODO.md` — Day 7 勾选 + 完成日期

## 四、实施步骤

1. **TileType**：加 `viaTier` 字段 + `EXIT` 枚举
2. **ViaUnlock**：`ViaTier`、`VIA_DELAYS`、`getTierDelay`
3. **MazeGenerator**：`placeVias` tier 分配；新增 `placeExit`
4. **MapManager**：调用 `placeExit`；公开总碎片数
5. **TileSet**：`drawVia` tier 三色；`drawExit`
6. **GameEngine**：状态机扩展 + 统计 + EXIT 检测 + victory 回调
7. **UIOverlay**：`drawViaProgressBar`
8. **GamePage**：渲染进度条；订阅 victory；HUD τ
9. **ResultPage**：布局 + 评级公式
10. **main_pages.json**：注册
11. **TODO**：勾选

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 顶层（Layer 2）能看到一颗 EXIT 瓦片（青绿钻石样式），明显远离起点
- [ ] 三类 VIA 视觉一眼可分（金 / 银 / 铜）
- [ ] 踩上 L1 VIA：屏幕中央闪 200ms 进度条 → 切层
- [ ] 踩上 MEM VIA：进度条 ≈1.2s 缓慢推进 → 切层（视觉上"慢"明显）
- [ ] HUD 侧栏 τ 行随每步 / 每次 VIA 实时刷新
- [ ] 未集齐碎片走到 EXIT：弹提示 dialog "还需 N 个碎片"，不通关
- [ ] 集齐 9 碎片走 EXIT：跳 ResultPage，看到正确 τ / 步数 / VIA 分布 / 热峰 / S-A-B-C 评级
- [ ] ResultPage "返回主菜单"按钮回到 Index；"再来一局"回到 GamePage 全新一局

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| Day 6 重构把 EXIT 关进墙 | 概率极低（EXIT 是 FLOOR，但 Restructurer 会试关 FLOOR） | Restructurer 的 close 候选过滤 `type !== FLOOR`，EXIT 是 EXIT 类型天然不在候选，无需改 |
| VIA_WAIT 期 force-pop 抢占 | 进入 VIA 但本层热到 100 | force-pop 检测放在 IDLE 末尾，VIA_WAIT 期不再调用；OK |
| 进度条 alpha 残留 | HarmonyOS Canvas 老毛病 | drawViaProgressBar 末尾 globalAlpha = 1 |
| router.pushUrl 参数大对象不可靠 | 跨页 stats 丢失 | 用 router 自带 params；如失败回退用 AppStorage |
| EXIT 不可达 | 顶层 BFS 候选集为空 | 强制 carve (cols-2, rows-2) 为 FLOOR + EXIT |
| L1 太少导致玩家从不见 | 1:2:3 比例，6 个 VIA 才出 1 个 L1 | 全局轮转保证至少 1 个 L1（rotation 第 1 位即 L1） |

## 七、Day 7 不做的事

- 不接入真实 AI 评语（Day 8）
- 不做尾迹 / 折叠 / 层冷暖渐变（Day 8 视觉润色）
- 不做"再来一局保留 seed"
- VIA 进度条不做闪烁/呼吸特效，只是线性 fill bar
