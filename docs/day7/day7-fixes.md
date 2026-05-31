> 注：本文档由 Claude Code (Opus 4.7) 生成，记录 Day 7 收尾期间发现并修复的 Bug。
# Day 7 — 收尾 Bug 修复

## Fix #1：散热通道反复横跳 → 改为单次消耗

### 现象
玩家可以在两格之间来回踩同一个 `THERMAL_VIA` 散热节点，每次 -30 热量，**无限降温**。
导致 Day 6 散热系统的"过热弹层"压力机制被完全绕开：Layer 0（×2 升温）原本是核心难度来源，但只要旁边有散热节点就毫无意义。

### 根因
Day 6 设计时为了让散热节点"随手可用"，把 `THERMAL_VIA` 设成了**永久瓦片**：踩上去 `HeatManager.cool(layer)` 后瓦片不变化。
设计假设是"地图大、节点稀疏，玩家不会专门绕回去"——但 MVP 地图只有 13×13，节点稀疏度不够，玩家很容易学会"贴着散热点走 8 字"。

代码位置：`game/core/GameEngine.ts` 的 `onPlayerLanded` → THERMAL_VIA 分支。

```typescript
// 修复前
if (tile.type === TileType.THERMAL_VIA) {
  this._heat.cool(this._currentLayer);
  // 散热后通常不会立即过热弹层；保险起见仍走标准路径
  this.phase = EnginePhase.IDLE;
  this.maybeStartRestructure();
  return;
}
```

### 修复
踩一次即烧毁：调完 `cool()` 后把瓦片改成 FLOOR，散热点用完即消失。

```typescript
// 修复后
if (tile.type === TileType.THERMAL_VIA) {
  this._heat.cool(this._currentLayer);
  tile.type = TileType.FLOOR;
  tile.locked = false;
  this.phase = EnginePhase.IDLE;
  this.maybeStartRestructure();
  return;
}
```

### 连锁正面影响

| 子系统 | 影响 |
|--------|------|
| 渲染层 | `drawTile` 看到 FLOOR 就走 `drawFloor`，不再画青白冷光环，玩家一眼就能识别"这格用过了" |
| 动态重构 | `Restructurer.closePassages` 的 close 候选过滤是 `type !== FLOOR continue`，原 THERMAL_VIA 永远不在候选；改 FLOOR 后允许被关闭，地图更动态 |
| 散热压力 | 每层 2 个 THERMAL_VIA × -30 = 总降温预算 60，远小于满血 100，玩家必须主动管理路径，符合"散热是核心压力"的初衷 |
| 数值表 | HUD 热量条数值不变，单次降温 -30 语义保留；CLAUDE.md 不需要改 |

### 验收点
- [x] 走到 THERMAL_VIA 上：热量 -30 + 瓦片变 FLOOR（青白光环消失）
- [x] 回头再走同一格：不触发降温
- [x] Layer 0 长时间停留：用完 2 个 THERMAL_VIA 后必然过热弹层
- [x] 重构期偶尔把已用过的 THERMAL_VIA 位置改成墙：合理（这格已是普通 FLOOR）

### Git
```
commit 941f7d5 fix(GameEngine.ts): 修复冷却块不消失
```

## 经验沉淀

> "永久"的可交互瓦片在 MVP 小地图上往往会被玩家发现并滥用，**默认单次消耗**比"永久 + 后期再加冷却时间"更稳。
> 真要做永久节点，至少要绑冷却 CD（如 N 步内不可再用）或更稀疏的密度，**Day 6 当时为了实现简单选了永久，Day 7 平衡时才发现破洞**。
