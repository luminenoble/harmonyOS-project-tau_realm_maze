# 排查记录：移动卡顿 & 收集碎片回到起点

> 分支 `feat/instr-redesign`。记录两个运行期问题的根因分析、修复与验证方式。

---

## 一、收集寄存器碎片导致"回到起始位置"

### 现象
玩家在上层收集（寄存器）碎片时，有概率被瞬间送回起始处。

### 根因
排查 `GameEngine` 所有会改写 `player.col/row` / `_currentLayer` 的路径，确认 **重构（Restructurer）只开墙、从不移动玩家**，VIA 切层保持同坐标。唯一的位置重置来自**过热强制降层**（`maybeForcePop`）：

1. 热量在 `tryMove` 里**移动开始时**就 `tickStep` 自增；
2. `onPlayerLanded` 的碎片分支末尾又调用了 `maybeForcePop()`；
3. 于是"踩上碎片那一步"恰好把热量顶过 90 阈值时，降层会在**同一次落地**触发——表现为"一收集碎片就被弹走"；
4. 旧实现降层固定回 `(1,1)`；19×19 地图 + 新散热阈值（60/90）下触发频繁，且降回 Layer 0（起始层）= 玩家所说的"回到起始位置"。

### 修复
两步，均在 `game/core/GameEngine.ts`：

1. **落点不再触发降层**：删除 `onPlayerLanded`（碎片 / ALU / RAW / 普通落点）与切层结束处的全部 `maybeForcePop()` 调用。
2. **改在"尝试移动"时触发**：`tryMove` 开头、本步升温**之前**先 `if (this.maybeForcePop()) return false;`。
   - 跨过阈值的那一步能正常落地（含拾取碎片）；
   - 降层推迟到玩家**下一次主动移动**时发生，语义清晰（"过热时再想动 → 被迫降层"），不再"凭空被弹走"。
3. （上一轮已做）降层落点由 `(1,1)` 改为 `findNearestFloor(lower, col, row)`——下层中与当前列行最近的 FLOOR，保留降层惩罚但不丢失位置。

### 验证
DevEco 真机：在 Layer 1/2 持续移动直到热量条变红，确认仅在**再次按方向键**时才降层、且落点在原位置附近而非 (1,1)；收集碎片本身不再触发位移。

---

## 二、移动刷新卡顿

### 根因（两层）
1. **HUD churn**：`syncFromEngine` 每 tick 无条件重置 ~17 个 `@State` + 每帧 new 一个 `heldLabels` 数组 → ArkUI 每帧 diff 整个侧栏/持有条。（上一轮已修：逐字段"变化才写" + 持有标签指纹比对。）
2. **Canvas 全量重绘**：`renderMap` 每帧 `clearRect` 全屏后重画当前层**全部 19×19=361 格**（地板 + 特殊瓦片含文字标签 + 墙），单帧约 900+ 次路径操作。19×19 比旧 13×13 多约一倍瓦片，是 Canvas 侧卡顿主因。

### 修复：分层画布缓存（离屏静态层）
把渲染拆成两张同尺寸 `Canvas`（`pages/GamePage.ets`）：

| 画布 | 内容 | 重画时机 |
|------|------|----------|
| 底层 `staticCtx` | 背景 + 地板 + 特殊瓦片 + 墙（`drawMapStatic`） | **仅** `mapVersion` / 层号 / 画布尺寸变化时 |
| 顶层 `ctx`（透明） | 残影 + 玩家 + 重构脉冲 / 警告 / VIA 进度条 / 转场（`drawPlayerLayer` + overlay） | 每帧 |

- `GameEngine` 新增 `mapVersion`：碎片拾取 / ALU 通过 / RAW / 散热 / 重构开墙 / 切层时自增；渲染层据此判定静态层是否需重画（`renderFrame` 命中缓存则跳过整张地图重绘）。
- `IsoRenderer` 新增 `drawMapStatic`（地板+特殊+墙，墙间 painter's 排序）与 `drawPlayerLayer`（残影+玩家）。
- **取舍**：墙块整体位于静态层之下，玩家恒画在顶层 → 不再被前方墙体遮挡。短墙（`wallH≈0.45×halfW`）等距下遮挡轻微，换来每帧绘制量从"360 格全画"降到"清屏 + 玩家 + 少量 overlay"。
- 回退：本方案为分层缓存；若需真正的 `OffscreenCanvas`，需把 TileSet/IsoRenderer 的 ctx 形参统一到 `CanvasRenderer` 基类（改动面大）。当前实现等价收益且类型安全，回退用 `git revert` 即可。

### 调试埋点（排查用）
`GamePage` 右上角 `DBG` 按钮开关，开启后右上角面板每 ~15 帧刷新并 `console.info('[perf] ...')`（DevEco HiLog 可抓）：

- `frame Xms (~Yfps)`：相邻帧墙钟间隔（>200ms 的 IDLE 停顿不计入）；
- `dyn Xms`：动态层单帧绘制耗时；
- `static Xms ×N`：静态层单次绘制耗时 + 累计重画次数；
- `layer / tiles / phase`：当前层、瓦片总数、阶段。

判读：
- `frame` 远大于 16ms 而 `dyn` 很小 → 瓶颈在 tick 调度 / ArkUI 重渲（非 Canvas 绘制）；
- `dyn` 很大 → 动态层绘制是瓶颈；
- `static ×N` 频繁增长 → `mapVersion` 触发过勤（缓存失效）。

### 验证
DevEco 真机：开 `DBG`，移动观察 `frame` 是否稳定 ~16-20ms、`static ×N` 在静止移动时不增长（仅吃碎片/切层/重构时 +1）。

---

## 三、相关提交

- `fix(game): 修移动HUD卡顿 + 强制弹层不再打回起点`（@State 守卫 + findNearestFloor）
- 本轮：过热降层改为"尝试移动时触发" + 分层画布缓存 + DBG 埋点。
