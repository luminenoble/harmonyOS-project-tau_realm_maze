> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 6 散热系统的内部蓝图。
# Day 6 · 散热系统（HeatManager）

> 目标：实现三维堆叠芯片散热瓶颈的玩法映射 — 每层独立热量值、底层 ×2 积热、过热减速、强制弹层、THERMAL_VIA 散热通道。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 热量数据 | `game/core/HeatManager.ts` | 三层独立计数 0..100 |
| 每步升温 | `HeatManager.tickStep(layer)` | 中层 +2，底层 ×2 = +4 |
| 散热瓦片 | `TileType.THERMAL_VIA` + `MazeGenerator.placeThermalVias` | 每层 2 个；不与起点 / VIA / GATE / FRAGMENT 重叠 |
| 散热触发 | `GameEngine.onPlayerLanded` 检测 THERMAL_VIA | 热量 -30，瓦片不消耗，可反复 |
| 过热减速 | 热量 ≥ 80 → `Player.setSpeed(0.05)` | 每格动画时长翻倍，玩家有"卡顿感" |
| 强制弹层 | 热量 ≥ 100 且 currentLayer > 0 → 复用 TRANSITION → currentLayer - 1 | 玩家被弹到下一层 (1,1)，原层热量 reset 为 0 |
| HUD 显示 | Sidebar 加 Progress + 数值 + 颜色 | 蓝→黄→红阶梯；过热文字闪烁警示 |

## 二、设计决策

### 2.1 调参常量

```typescript
class HeatManager {
  static readonly MAX: number = 100;
  static readonly OVERHEAT_THRESHOLD: number = 80;
  static readonly FORCE_POP_THRESHOLD: number = 100;
  static readonly HEAT_PER_STEP_BASE: number = 2;     // 中层每步 +2
  static readonly BOTTOM_LAYER_MULT: number = 2;      // 底层 ×2 = +4
  static readonly COOL_AMOUNT: number = 30;
}
```

按这套数值：
- Layer 0：100/4 = **25 步**到强制弹层；80/4 = **20 步**到减速
- Layer 1+：100/2 = **50 步**到强制弹层；80/2 = **40 步**到减速
- 每个 THERMAL_VIA 缓解 30 点（在 L0 相当于"多撑 7.5 步"）

20 步与重构周期同频，玩家会感受到"每次重构前 1-2 步内底层会卡一下"的紧张感。

### 2.2 散热瓦片放置

继 placeFragments / placeGates / placeVias 之后：
- 每层 2 个 THERMAL_VIA
- 候选：剩余 FLOOR cell（排除 (1,1) 起点）
- 不做 BFS 校验：放在不可达区只是"少了个缓解点"，不影响通关

### 2.3 玩家加热触发点

`GameEngine.tryMove` 成功（开始动画）的瞬间：
```typescript
this.heat.tickStep(this._currentLayer);
const speed: number = this.heat.isOverheated(this._currentLayer) ? 0.05 : 0.1;
this.player.setSpeed(speed);
this.player.startMove(...);
```

注意顺序：先升温再判断速度，这样达到 80 的那一步立刻生效减速。

### 2.4 强制弹层

新增方法：`triggerForcedPop()`，在 `onPlayerLanded` 末尾、`maybeStartRestructure` 之前调用：
```typescript
private maybeForcePop(): boolean {
  if (!this.heat.isForcedPop(this._currentLayer)) return false;
  if (this._currentLayer === 0) {
    // 底层无处可弹，仅 cap 在 100
    return false;
  }
  // 标记 forced 后复用 TRANSITION 流水线
  this._forcedPop = true;
  this.phase = EnginePhase.TRANSITION_OUT;
  this.transitionT = 0;
  return true;
}
```

`TRANSITION_OUT` 末尾的换层逻辑分两支：
```typescript
if (this._forcedPop) {
  this.heat.reset(this._currentLayer);  // 离开层热量清零
  this._currentLayer -= 1;
  this.player.col = 1;                  // 弹层回到新层 (1,1) 起点
  this.player.row = 1;
  this._forcedPop = false;
} else if (tile.viaTarget >= 0) {
  this._currentLayer = tile.viaTarget;
}
```

VIA 切层与强制弹层共用 TRANSITION 动画，玩家看到一致的"切层有缓冲"反馈，差异仅在 HUD 警示（"过热弹层"红字）。

### 2.5 HUD 显示

Sidebar 在"信号碎片"和"下一次重构"之间加：

```
本层热量
[━━━━━━━━━━] 62/100      （蓝/黄/红 Progress 条 + 数值）
```

颜色阶梯：
- heat < 50 → `#22d3a8`（青绿，凉）
- 50 ≤ heat < 80 → `#ffd166`（黄，警示）
- heat ≥ 80 → `#ff6b6b`（红，过热）

ArkUI 的 `Progress` 组件原生支持设色与百分比，直接用。

### 2.6 视觉：THERMAL_VIA

`TileSet.drawThermalVia(ctx, cx, cy, halfW, halfH)`：
- 地板 + 中心一组双层环（外层青白 `#a8e6ff`，内层冷白 `#e0f4ff`）
- 视觉上区别于 VIA（无方向三角）、区别于 FRAGMENT（无暖色）
- 不参与 locked 语义，永远可用

### 2.7 模块边界

- HeatManager 完全是数据 + 计算，不知道渲染
- GameEngine 持有 HeatManager 实例；状态机扩展（强制弹层走 TRANSITION 流水线）
- Player 加 `setSpeed` 方法（speed 从 readonly 改成可变）；不引入"过热"概念，仍是纯位置数据
- TileSet 加分支
- GamePage 加 @State currentHeat + Sidebar 段

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/game/core/HeatManager.ts
docs/day6/day6-heat.md
```

### 修改

- `game/types/TileType.ts` — 新增 `THERMAL_VIA = 5`
- `utils/MazeGenerator.ts` — 新增 `placeThermalVias(layers, rng, perLayer)`
- `game/core/MapManager.ts` — 调用 placeThermalVias；常量 `THERMALS_PER_LAYER = 2`
- `game/core/Player.ts` — speed 改可变 + `setSpeed(s)`
- `game/core/GameEngine.ts` — 持有 HeatManager；tryMove 升温 + 设速度；onPlayerLanded 检测 THERMAL_VIA 冷却 + 强制弹层；TRANSITION_OUT 末尾分支
- `game/render/TileSet.ts` — `drawThermalVia` + 分派
- `pages/GamePage.ets` — Sidebar 增热量段；@State currentHeat / overheated 同步
- `docs/TODO.md` — 散热子段勾选 + Day 6 头标完成

## 四、实施步骤

1. **TileType** 加 THERMAL_VIA
2. **HeatManager** 写完
3. **Player.setSpeed**
4. **MazeGenerator.placeThermalVias**
5. **MapManager** 调用
6. **GameEngine** 加 HeatManager + tickStep + cool + 强制弹层 + 速度设置
7. **TileSet.drawThermalVia** + 分派
8. **GamePage** Sidebar 热量段
9. **TODO** 勾选 + Day 6 头标完成

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入 Layer 0，第一步：热量 4 → HUD 显示 4/100，颜色蓝
- [ ] Layer 0 走 20 步：热量 80，HUD 变黄变红，移动明显变慢（speed 0.05）
- [ ] Layer 0 走 25 步：热量 100，黑屏淡入 → 强制弹到 Layer ?（注：Layer 0 无下层，仅 cap）
- [ ] Layer 1 走 50 步：强制弹到 Layer 0，玩家落在 (1,1)，Layer 1 热量清零
- [ ] 踩到 THERMAL_VIA：热量瞬间 -30，瓦片不消耗
- [ ] 切层后 HUD 显示新层独立热量
- [ ] 同步重构 + 过热：先红屏警告，后弹层（或先弹层后重构），无 phase 冲突

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| HeatManager 与重构 phase 竞争 | 同一 onPlayerLanded 触发两者 | 优先级：forced pop > restructure；pop 启动 TRANSITION 后跳过 maybeStartRestructure |
| Layer 0 强制弹层无解 | 玩家底层走 25 步 | MVP：cap 在 100 + 移动减速；提示文字加在 HUD（"过热警告·禁底层久留"） |
| THERMAL_VIA 候选不足 | 该层 FLOOR 都被占 | placeThermalVias 内静默降到实际数量；Day 5 同样策略 |
| Player setSpeed 冲突 | 多次连续 tryMove 重设 | 每次 tryMove 都按当前 heat 重设；幂等 |
| BFS / Restructurer 视 THERMAL_VIA 为不可走 | 校验失败 | THERMAL_VIA 在 BFS 中视为 FLOOR；`isPassableForBfs` 已经只拦 WALL/locked GATE，THERMAL_VIA 自然通过 |
| Restructurer 关掉了 THERMAL_VIA | close 候选过滤了 VIA/GATE/FRAGMENT，没加 THERMAL_VIA | 在 close 候选过滤里追加 `!== THERMAL_VIA` |

## 七、Day 6 散热不做的事

- 不做"局部热扩散"（同层相邻 cell 升温）
- 不做"温度可视化"（Canvas 上热点叠色）
- 不做过热音效
- 不做散热瓦片冷却动画（瞬时 -30，HUD 数值更新即视觉反馈）
- 不做"层间热量传导"（CLAUDE.md 提及但 MVP 不实现）
