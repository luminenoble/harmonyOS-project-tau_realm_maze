> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 3 工作的内部蓝图。
# Day 3 — 玩家移动 & 输入控制

> 目标：在 Day 2 的静态迷宫上加入玩家角色，支持四方向输入、碰撞检测、过渡动画，并搭起游戏主循环骨架。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 玩家状态模型 | `Player.ts`（col / row / 动画 progress） | tryMove 走得通；isAnimating 返回正确 |
| 主循环骨架 | `GameEngine.ts`（hold map+player，`start/stop/tryMove`） | 启停干净，不泄漏 timer |
| 玩家渲染 | `PlayerRenderer.ts`（青绿小棱柱 + 高亮顶面） | 在地板上能看出位置和朝向（朝向先不做，留 Day 8） |
| 输入：滑动手势 | GamePage `PanGesture` 监听 | 上/下/左/右 四方向触发 tryMove |
| 输入：虚拟方向键 | GamePage 右下浮层（可选） | 模拟器测试方便 |
| 碰撞检测 | `GameEngine.tryMove` 内查 `MapManager.getTile` | 撞墙不移动，越界不移动 |
| Painter's 集成 | `IsoRenderer.drawMap` 把玩家排入 row+col 序 | 玩家被前方墙体正确遮挡 |

## 二、设计决策

### 2.1 移动模型：离散网格 + 视觉补间

- **逻辑上**：玩家位置始终是整数 `(col, row)`，移动一次只跨 1 格
- **视觉上**：从旧格补间到新格，`progress: 0→1`，每 tick `+0.1`（≈10 帧 ≈ 160ms 一格），过渡期间锁输入
- 动画结束前的输入直接忽略（不入队，避免按键堆积带来的"自动驾驶"感）

### 2.2 主循环：setInterval(16ms) 按需启停

- HarmonyOS 标准 ArkTS 没有原生 `requestAnimationFrame`，用 `setInterval` 近似 60Hz
- **按需启停**：玩家**静止时不跑 tick**，避免空转——`tryMove` 启动 interval，动画完成立刻 `clearInterval`
- `onPageHide` / `aboutToDisappear` 中调用 `engine.stop()`，杜绝路由返回后还在跑

### 2.3 方向映射（屏幕滑动 → 网格方向）

由于等距视角下 grid 的 N/E/S/W 在屏幕上是斜向，方案二选一：

| 方案 | 上滑 | 右滑 | 下滑 | 左滑 |
|------|------|------|------|------|
| A. 逻辑对齐（简单）| row-- | col++ | row++ | col-- |
| B. 视觉对齐（45° 旋转）| row--、col-- 同时 | col++、row-- | row++、col++ | col--、row++ |

**Day 3 选 A**：实现成本低，玩家上手快；B 方案的"双键复合移动"会让碰撞检测复杂化。视觉上看起来角色"斜着走"是等距视角的天然观感，可接受。

### 2.4 玩家几何外形

- 占据一个 cell，立体感与墙体一致但**矮一截**且**色调对比**
- `playerH = wallH * 0.6`（视觉上明显比墙矮）
- 顶面：亮青绿 `#5ef5c8`（比墙顶 `#22d3a8` 更亮，强调"主角"）
- 左/右面：与墙体配色相近但更亮一阶
- 在顶面中心加一个小亮点圆，作为"信号源"指示

### 2.5 Painter's 集成

`IsoRenderer.drawMap` 接受可选 `player: Player`：
- 收集 cell 列表时额外加入虚拟"玩家 cell"：`{ col: visualCol, row: visualRow, isPlayer: true }`
- 排序 key 仍是 `row + col`（浮点 OK）
- 遍历绘制时遇到玩家 cell 调用 `drawPlayer`

注意：移动过程中 `visualCol/Row` 是浮点，排序天然落在新旧两格之间，能正确处理"穿越墙脚"的遮挡。

## 三、文件清单

### 新增

```
app-storage/entry/src/main/ets/game/
├── core/
│   ├── Player.ts             # 玩家状态 + 动画补间
│   └── GameEngine.ts         # 主循环 + 输入派发 + 碰撞检测
└── render/
    └── PlayerRenderer.ts     # 玩家几何绘制
```

### 修改

- `game/render/IsoRenderer.ts` — `drawMap` 增加可选 `player` 参数，参与排序与绘制
- `pages/GamePage.ets` — 引入 GameEngine，PanGesture 派发方向，tick 回调触发重绘；加可选虚拟 D-pad
- `docs/TODO.md` — Day 3 各项完成后勾选

## 四、实施步骤

1. **Player.ts**：字段 + `startMove / tick / isAnimating / visualCol / visualRow`，纯数据，不引用 ctx
2. **GameEngine.ts**：构造时传 `MapManager`；`tryMove(dx, dy)` 内做边界 + WALL 检查；`start(onTick)` / `stop()`
3. **PlayerRenderer.ts**：抽象一个 `drawPlayer(ctx, cx, cy, halfW, halfH, playerH)`
4. **IsoRenderer.drawMap 扩展**：把 player 当作"浮点坐标的特殊瓦片"塞进排序数组
5. **GamePage 接入**：
   - `aboutToAppear`：构造 engine
   - `onReady`：调用 `renderMap`
   - `engine.start(() => this.renderMap())`：tick 时重绘
   - `Canvas` 外层包 `Stack`，挂 `PanGesture(direction: All, distance: 20)`，在 `onActionEnd` 算方向 → `engine.tryMove`
   - 可选：右下角浮层 4 个方向按钮
   - `aboutToDisappear`：`engine.stop()`

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 进入游戏看到玩家位于 (1, 1)
- [ ] 上/下/左/右 滑动玩家正确移动一格，带补间动画
- [ ] 撞墙时玩家不动，无报错
- [ ] 越过迷宫外界不可能（外圈全是 WALL）
- [ ] 玩家走到屏幕"上方"墙脚下，墙体正确遮挡玩家头部
- [ ] 返回主菜单后再进入，引擎重新启动，无内存泄漏感（连续进出 10 次无掉帧）
- [ ] 控制台无 Canvas / setInterval 报错

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| `setInterval` 在 ArkTS 中不可用或精度差 | 编译报错 / 抖动 | 回退到 `animator` API；或用 `Promise.then` 链式 setTimeout |
| PanGesture 与 Canvas 触摸冲突 | 滑动无响应 | 把 PanGesture 挂到 Canvas 父 `Stack` 上；或改用 `.onTouch` 自写阈值判定 |
| 玩家浮点排序导致 z-fighting | 与同 row+col 的瓦片闪烁 | 排序时给玩家加一个 `+0.001` 的微小偏移，强制晚于同 key cell |
| 玩家动画期间用户切层 / 返回 | 引擎未停 timer 仍在跑 | `aboutToDisappear` 显式 stop；二次 stop 幂等 |
| 16ms tick 在低端机卡顿 | 帧率不稳 | progress 增量改为按真实时间差（`(now - last) / 160ms`）插值，避免帧率影响速度 |

## 七、Day 3 不做的事

- 不做朝向（玩家"面向"方向），保留几何对称外形，朝向留给 Day 8 视觉润色
- 不做层切换（Day 4）
- 不做拾取/逻辑门触发（Day 5）
- 不做动态地图重构（Day 6）
- 不做旋转视角（Day 6 可选任务）
- 不做音效（Day 8）
