# TauRealmMaze — 文件索引（`ets/` 目录完整解说）

## 目录树总览

```
ets/
├── entryability/
│   └── EntryAbility.ets          ← 应用入口
├── entrybackupability/
│   └── EntryBackupAbility.ets    ← 备份恢复（框架模板）
├── pages/                          ← 7 个页面（路由节点）
│   ├── LoginPage.ets
│   ├── Index.ets
│   ├── DifficultyPage.ets
│   ├── LoadingPage.ets
│   ├── GamePage.ets
│   ├── ResultPage.ets
│   └── HistoryPage.ets
├── components/                     ← 4 个可复用 UI 组件
│   ├── MusicPanel.ets
│   ├── HoldingBar.ets
│   ├── InfoPanel.ets
│   └── InstructionDrawer.ets
├── game/
│   ├── core/                       ← 5 个核心引擎模块
│   │   ├── GameEngine.ts
│   │   ├── MapManager.ts
│   │   ├── Player.ts
│   │   ├── HeatManager.ts
│   │   ├── PathOptimizer.ts
│   │   └── Restructurer.ts
│   ├── render/                     ← 4 个 Canvas 渲染模块
│   │   ├── IsoRenderer.ts
│   │   ├── TileSet.ts
│   │   ├── PlayerRenderer.ts
│   │   └── UIOverlay.ts
│   ├── puzzle/                     ← 2 个谜题逻辑模块
│   │   ├── GateLogic.ts
│   │   └── ViaUnlock.ts
│   ├── data/                       ← 3 个纯数据/常量模块
│   │   ├── Instruction.ts
│   │   ├── Semantics.ts
│   │   └── ChipFacts.ts
│   └── types/
│       └── TileType.ts             ← 瓦片类型定义
└── utils/                          ← 9 个工具与服务模块
    ├── IsoMath.ts
    ├── MazeGenerator.ts
    ├── DbHelper.ts
    ├── UserSession.ts
    ├── MusicService.ts
    ├── AIComment.ts
    ├── DeepSeekService.ts
    ├── InstructionGraph.ts
    ├── ProgramStore.ts
    └── ApiConfig.ts
```

---

## 一、入口层（entryability / entrybackupability）

### `entryability/EntryAbility.ets`
应用生命周期入口，继承 `UIAbility`。
- `onCreate()`：**应用启动时一次性初始化三条链** —
  1. `initSession()` 注册 `PersistentStorage` 登录态；
  2. `initDb(context)` 异步建表（SQLite）；
  3. `getMusicService().init(context)` 加载内置曲目 + 恢复用户偏好。
- `onWindowStageCreate()`：根据 `isLoggedIn()` 决定首页（已登录→`pages/Index`，未登录→`pages/LoginPage`）。

**上游依赖**：`DbHelper.ts`、`UserSession.ts`、`MusicService.ts`
**下游消费**：无（框架入口，仅被系统调用）

---

### `entrybackupability/EntryBackupAbility.ets`
HarmonyOS 备份恢复扩展能力（框架模板），`onBackup()` / `onRestore()` 仅打日志，当前无业务逻辑。

---

## 二、页面层（pages/）— 7 个页面，按玩家流程串联

### 2.1 `pages/LoginPage.ets` — 登录页
**职责**：昵称登录 / 游客模式入口。
- 调用 `loginByNickname(name)` 或 `loginAsGuest()` 写入 `AppStorage` 的 userId
- 成功后 `router.replaceUrl('pages/Index')`（不可回退）
- 昵称校验：非空、≤12 字符、禁止 `游客#` 前缀

**依赖**：`DbHelper.ts`、`UserSession.ts`
**路由出**：→ `Index`

---

### 2.2 `pages/Index.ets` — 主菜单页
**职责**：用户信息展示、称号选择、三大入口（进入游戏 / 历史记录 / 切换用户）。
- `aboutToAppear()` / `onPageShow()` 均刷新用户信息（从历史页返回后称号可能变化）
- 称号弹窗：`ForEach` 渲染已解锁列表，点击切换
- 进入游戏 → `router.pushUrl('pages/DifficultyPage')`
- 右下角挂载 `MusicPanel` 组件

**依赖**：`DbHelper.ts`、`UserSession.ts`、`MusicPanel`
**路由出**：→ `DifficultyPage` / `HistoryPage` / `LoginPage`

---

### 2.3 `pages/DifficultyPage.ets` — 难度选择页
**职责**：Easy(9指令) / Normal(12指令) / Hard(15指令) 三选一。
- 三张难度卡片（`@Builder DiffCard`），显示指令数、并行宽度、每层碎片数、运算场景
- 选中 → `router.pushUrl('pages/LoadingPage', { difficulty })`

**依赖**：`Instruction.ts`（`DIFFICULTY_CONFIGS`、`DifficultyConfig`）
**路由入**：`Index` →   **路由出**：→ `LoadingPage`

---

### 2.4 `pages/LoadingPage.ets` — 指令装载页
**职责**：等待 DeepSeek 生成指令序列，终端风格日志 + 假进度条。
- `aboutToAppear()` 异步调 `generateProgram(difficulty)` →
  调 `InstructionGraph.buildPlan()` 解析 →
  调 `setProgram(program, plan)` 写入模块单例
- `setInterval` 假进度条到 90%，真实返回后冲 100% → `setTimeout` 700ms 后 `router.replaceUrl('pages/GamePage')`
- 终端逐行打印前 6 条指令

**依赖**：`DeepSeekService.ts`、`InstructionGraph.ts`、`ProgramStore.ts`
**路由入**：`DifficultyPage` →   **路由出**：→ `GamePage`

---

### 2.5 `pages/GamePage.ets` — 游戏主页面（最复杂页面）
**职责**：Canvas 宿主 + 侧边栏 HUD + D-Pad + 指令抽屉 + 信息卡 + 手势。
- **双 Canvas 架构**：`staticCtx`（静态层，地图版本/层号/尺寸变化才重绘）+ `ctx`（动态层，每帧重绘残影/玩家/overlay）
- **侧边栏**：`@Builder Sidebar` 显示层名、本层操作数、热量条、分支预测刷新、CPI 实时、重生按钮
- **D-Pad**：`@Builder DPad` 四方向 + EXEC 激活按钮（智能文案：VIA 缓存命中 / EXIT 写回）
- **触摸事件**：`onTouch` 记录 Down/Up 坐标，差值 < 阈值 → 点击命中测试（`screenToGrid` + 查瓦片 → 弹 `InfoPanel`）；否则 → 方向滑动
- **手势**：`.gesture(PanGesture)` 全方向滑动移动
- **引擎回调**：`setTickCallback`（同步 20+ 个 @State 字段，逐字段变化才写）、`setFragmentPickedCallback`（弹 AlertDialog 科普）、`setExitHintCallback`（终点未就绪提示）、`setHazardCallback`（RAW 冒险警告）、`setVictoryCallback`（router 跳结算页）
- **渲染帧**：`renderFrame()` 计算等距参数 → 静态层按需重画 → 动态层每帧重画（玩家/残影/重构脉冲/交互高亮/警告覆盖/VIA进度条/shutter折叠/fade）
- **交互按钮**：指令抽屉 `InstructionDrawer`（右上 ≡）、信息卡 `InfoPanel`（右侧中部）、音乐面板 `MusicPanel`

**依赖**：全部 `game/` 模块 + `IsoMath.ts` + 全部 `components/` + `ProgramStore.ts`
**路由入**：`LoadingPage` →   **路由出**：→ `ResultPage`

---

### 2.6 `pages/ResultPage.ets` — 结算页
**职责**：通关后展示评级 + CPI 数据 + VIA 分布 + 热量峰值 + AI 评语。
- `aboutToAppear()` 从 `router.getParams()` 解析 `VictoryStats`（含 optimalTau、playerViaTiers 等对照字段）
- **评级牌**：左侧大字评级（S/A/B/C）+ CPI 公式 + 流水线效率 + AI 评语卡片
- **统计面板**：右侧缓存命中分布 + 最优 vs 实际 tier 序列对照 + 各层热量峰值
- **AI 评语**：异步调 `getAIComment(stats)`，成功后自动 `saveRecord()` 写数据库
- 底部按钮："再来一局"→ `DifficultyPage` / "返回主菜单"→ `Index`

**依赖**：`AIComment.ts`、`DbHelper.ts`、`UserSession.ts`、`Semantics.ts`
**路由入**：`GamePage` →

---

### 2.7 `pages/HistoryPage.ets` — 历史记录页
**职责**：展示当前用户的通关记录列表。
- **筛选栏**：评级筛选（全部/S/A/B/C）+ 时间筛选（全部/今天/本周/本月）
- **列表**：`List` + `ForEach` 渲染 `RecordCard`（评级大字 + 步数/VIA延迟/分布 + AI评语截断 + 时间）
- **时间格式化**：`Date` 运算输出 `MM-DD HH:mm` 格式

**依赖**：`DbHelper.ts`、`UserSession.ts`

---

## 三、组件层（components/）— 4 个可复用 UI 组件

### `components/MusicPanel.ets`
**职责**：浮动音乐控制面板（右下角 ♪ 按钮 + 展开式面板）。
- `aboutToAppear()` 注册 `MusicService` 监听器，状态变化时 `syncState()` 刷新 UI
- 展开面板：当前曲目名 + 播放控制（上一曲/播放暂停/下一曲）+ 音量 `Slider` + 播放列表 `Scroll`
- **+ 添加按钮**：调 `AudioViewPicker` 选择音频文件 → `svc.addUserTrack(uri, name)`
- 内置曲目标 ★，用户曲目可删除 ✕

**依赖**：`MusicService.ts`、`@kit.CoreFileKit`（picker）

---

### `components/HoldingBar.ets`
**职责**：顶部「持有寄存器」状态条（纯展示）。
- 左：下一条待执行指令（`@Prop nextInstr`）
- 中：已持有的操作数 chip 列表（`@Prop heldLabels`），蓝色小标签
- 右：指令进度（`@Prop progressText`）

**依赖**：无（纯展示，数据由父组件注入）

---

### `components/InfoPanel.ets`
**职责**：右侧点击信息卡片（纯展示）。
- 标题（`@Prop title`）+ 强调色（`@Prop accent`）+ 多行正文（`@Prop body`）+ 关闭按钮
- 半透明深底 + accent 色边框

**依赖**：无（纯展示）

---

### `components/InstructionDrawer.ets`
**职责**：右侧全高指令序列抽屉（纯展示）。
- 标题 + 场景名 + OFFLINE 标签
- `Scroll` 内 `ForEach` 渲染所有指令：已执行→绿 / 当前→黄 / 未来→灰
- 底部当前进度文字

**依赖**：`Instruction.ts`（`Instruction` 接口）

---

## 四、游戏核心层（game/core/）— 6 个引擎模块

### `game/core/GameEngine.ts`
**职责**：游戏主循环 + 七阶段状态机 + 全部游戏规则调度。
- **状态机**：`IDLE → MOVING → VIA_WAIT → TRANSITION_OUT → TRANSITION_IN → RESTRUCTURE_WARN → RESTRUCTURE_PULSE`
- `tryMove(dCol, dRow)`：碰撞检测 + 墙体/锁门拒绝 + 过热降层前置判定 + 升温 + 启动补间
- `tryInteract()`：VIA 缓存命中等待 + EXIT 写回通关
- `advance()`：每 16ms tick 分派动画推进 / VIA 等待 / 转场 / 重构
- `onPlayerLanded()`：落点检测 FRAGMENT（LOAD 操作数）/ GATE（ALU 执行）/ RAW_HAZARD / THERMAL_VIA
- **五种回调**：Tick / FragmentPicked / ExitHint / Victory / Hazard，解耦 UI
- **CPI 实时计算**：`(步数 + VIA延迟) / 总指令数`
- **散热系统**：每步升温 → 过热减速（speed 0.1→0.05）/ 临界强制弹层
- **动态重构**：每 20 步触发 RESTRUCTURE_WARN→PULSE，期间红色警告覆盖 + 青绿通道脉冲
- **起局最优求解**：构造时调 `PathOptimizer.solve()`，结果作为 CPI 评级基准
- **构造 VIA 统计**：每层 FRAGMENT 初始计数、VIA 使用次数、热峰追踪

**依赖**：全部 `game/` 子模块 + `IsoMath.ts`
**被引用**：`GamePage.ets`

---

### `game/core/MapManager.ts`
**职责**：多层地图数据容器（`Tile[][][]`），构造时生成全部层。
- `constructor`：逐层调 `MazeGenerator.generate()` 生成迷宫 →
  顺序放置特殊瓦片（VIA → GATE → FRAGMENT → THERMAL_VIA → RAW_HAZARD → EXIT）
- `applyPlan(plan)`：将 `ProgramPlan` 的操作数池 / ALU 序列 round-robin 标注到瓦片
- `getTile(col, row, layer)` / `getLayer(layer)` / `forEach(cb, layer)`：遍历接口
- **难度化参数**：`fragmentsPerLayer` / `rawPerLayer` 由 `difficultyConfig` 控制

**依赖**：`MazeGenerator.ts`、`InstructionGraph.ts`（`ProgramPlan`）、`TileType.ts`
**被引用**：`GameEngine.ts`

---

### `game/core/Player.ts`
**职责**：玩家状态模型（离散坐标 + 视觉补间 + 残影 + 持有操作数）。
- `startMove(dCol, dRow)`：记录起点 → 推进残影队列 → 更新目标坐标
- `tick()`：每帧推进补间 0..1，`speed` 由热量控制（正常 0.1 / 过热 0.05）
- `visualCol()` / `visualRow()`：浮点插值坐标（Painter's 排序用）
- `trail`：FIFO 队列，最多 3 项（身后残影）
- `heldOperands`：`HeldOperand[]`（寄存器文件），拾取 → push / RAW → splice / ALU → push 结果

**依赖**：无（纯数据模型）
**被引用**：`GameEngine.ts`、`IsoRenderer.ts`

---

### `game/core/HeatManager.ts`
**职责**：三层独立热量管理（0–100）。
- **三层积热速率**：`[2, 1.5, 1]`（底层器件层积热最快，映射 3D 堆叠散热瓶颈）
- **阈值**：≥60 过热减速（`OVERHEAT_THRESHOLD`）、≥90 强制弹层（`FORCE_POP_THRESHOLD`）
- `tickStep(layer)`：走一步按速率升温
- `cool(layer)`：踩散热通道 -30
- `reset(layer)`：强制弹层后清零

**依赖**：无（纯数学模型）
**被引用**：`GameEngine.ts`

---

### `game/core/PathOptimizer.ts`
**职责**：起局求解理论最优 τ（CPI 评级基准）。
- **算法**：逐层递归 DP — 每层枚举碎片访问顺序全排列 × 全部上行 VIA tier 候选，取步数 + VIA 延迟累计最小
- **BFS 两阶段**：入口→首碎片按门锁 BFS（锁门不可过），后续按门开 BFS
- **全排列生成**：递归回溯，碎片数 ≤4/层可行
- **输出**：`OptimalResult`（optimalTau / optimalSteps / optimalDelay / viaTiers / solvable）

**依赖**：`MapManager.ts`、`ViaUnlock.ts`、`TileType.ts`
**被引用**：`GameEngine.ts`（构造时调用一次）

---

### `game/core/Restructurer.ts`
**职责**：动态地图重构 — 仅打通内部墙创造捷径，不关路。
- `apply()`：收集"水平或垂直两侧均为非 WALL"的内部墙壁 → Fisher-Yates 随机选 k 个 → 改为 FLOOR
- **安全约束**：只开不关，永不堵死玩家

**依赖**：`TileType.ts`、`MazeGenerator.ts`（`Rng`）
**被引用**：`GameEngine.ts`

---

## 五、渲染层（game/render/）— 4 个 Canvas 绘制模块

### `game/render/IsoRenderer.ts`
**职责**：等距地图渲染总调度（分层双画布入口）。
- `drawMapStatic()`：静态层 — Pass 1 地板（FLOOR cell 走完整 `drawTile`，WALL cell 仅地板）+ Pass 2 墙块（painter's 排序）
- `drawPlayerLayer()`：动态层 — 残影 `drawTrail` + 玩家 `drawPlayer`
- `drawRestructurePulse()`：重构通道脉冲高亮（青绿 opened / 红色 closed），alpha 由引擎传入
- `drawInteractHighlight()`：落点可激活提示（金色菱形呼吸描边）
- `drawMap()`：旧版单层渲染（保留兼容）

**依赖**：`IsoMath.ts`、`TileSet.ts`、`PlayerRenderer.ts`、`TileType.ts`
**被引用**：`GamePage.ets`

---

### `game/render/TileSet.ts`
**职责**：全部 8 种瓦片类型的 Canvas 绘制函数。
- `drawFloor()`：菱形地板 + 层冷暖渐变（L0 暖棕红 / L1 中性蓝 / L2 冷青蓝）
- `drawWall()`：三面立方体（顶金 + 右暗金 + 左近黑）
- `drawVia()`：方向三角（CALL↑ / RET↓）+ tier 三色（L1 金 / L2 银 / MEM 铜）+ 锁定灰暗红圈
- `drawGate()`：三道横栅栏（锁=红 / 解锁=青绿）+ 中心 ALU 算子文本
- `drawFragment()`：按 `FragmentKind` 三种皮肤（寄存器蓝菱形 / 立即数金方标 / 地址橙方块）
- `drawRawHazard()`：品红底 + 两道白色高光斜纹 + "RAW" 标签
- `drawThermalVia()`：青白冷光双层同心圆
- `drawExit()`：青绿钻石双菱形（外层 + 内层高亮光芯）
- `drawTile()`：总调度 switch，按 `TileType` 分派

**依赖**：`TileType.ts`、`Instruction.ts`（`FragmentKind`、`aluOpName`）
**被引用**：`IsoRenderer.ts`

---

### `game/render/PlayerRenderer.ts`
**职责**：玩家棱柱 + 身后残影绘制。
- `drawPlayer()`：三面棱柱（青绿顶 + 右侧面 + 左侧面）+ 顶面白色信号源圆点
- `drawTrail()`：3 格渐隐残影菱形（alpha [0.15, 0.3, 0.5]），颜色跟随层冷暖（L0 橙 / L1 青 / L2 蓝）

**依赖**：`IsoMath.ts`
**被引用**：`IsoRenderer.ts`

---

### `game/render/UIOverlay.ts`
**职责**：转场 + HUD Canvas 覆盖层。
- `drawFade()`：全屏黑底淡入淡出（强制弹层用）
- `drawShutterFold()`：上下合拢黑色快门 + 中央青绿折痕（VIA 主动切层折叠动画）
- `drawWarningOverlay()`：红色 sin 脉冲底 + "BRANCH MISPREDICT · 流水线冲刷" 文字（重构警告）
- `drawViaProgressBar()`：中央卡片式进度条，按 tier 着色 + 缓存命中术语（L1$ HIT / L2$ HIT / DRAM ACCESS）
- `drawLayerLabel()` / `drawFragmentBadge()`：旧版 Canvas HUD（保留兼容）

**依赖**：无（纯 Canvas API）
**被引用**：`GamePage.ets`

---

## 六、谜题逻辑层（game/puzzle/）— 2 个规则模块

### `game/puzzle/GateLogic.ts`
**职责**：ALU 运算门解锁判定。
- `canPass(tile, heldCount)`：锁门 + 持有操作数 ≥ `THRESHOLD`(1) 才能通过
- `unlockAllInLayer()`：拾取碎片后扫描全层，满足阈值的一键解锁所有 GATE
- **阈值固定 1**：与迷宫 BFS 连通性不变式对齐（pre-GATE 区 ≥1 碎片可达），避免软锁

**依赖**：`TileType.ts`、`MapManager.ts`
**被引用**：`GameEngine.ts`

---

### `game/puzzle/ViaUnlock.ts`
**职责**：上行 VIA 解锁判定 + 三级缓存延迟模型。
- `canTrigger(tile, layer, fragmentCount, requiredCount)`：锁定 VIA 需本层碎片全收集才解锁
- `unlockAllInLayer()`：本层碎片全收集后一键解锁全部上行 VIA
- `getTierDelay(tier)`：L1=1 / L2=3 / MEM=6（时钟周期），非法 tier 退化为 MEM
- **枚举**：`ViaTier`（L1=0 / L2=1 / MEM=2）

**依赖**：`TileType.ts`、`MapManager.ts`
**被引用**：`GameEngine.ts`、`PathOptimizer.ts`、`MazeGenerator.ts`

---

## 七、数据层（game/data/）— 3 个纯常量/映射模块

### `game/data/Instruction.ts`
**职责**：机器指令世界观的全部数据模型与枚举。
- **枚举**：`FragmentKind`（REGISTER/IMMEDIATE/ADDRESS）、`AluOp`（ADD/SUB/MUL/AND/OR/XOR/SHL/SHR）、`Difficulty`（EASY/NORMAL/HARD）
- **接口**：`Instruction`（index/mnemonic/operands/comment/depth）、`InstructionProgram`（difficulty/instrType/instructions/fromFallback）
- **难度配置表**：`DIFFICULTY_CONFIGS` — Easy(9指令,2碎片/层) / Normal(12,3) / Hard(15,4)
- **工具函数**：`aluOpFromMnemonic()`（助记符→算子枚举）、`aluOpName()`（算子→文本）、`isLoadMnemonic()` / `isStoreMnemonic()`、`classifyOperand()`（token→FragmentKind）、《`fragmentKindName()`（皮肤短名）

**依赖**：无（纯数据定义）
**被引用**：几乎所有模块

---

### `game/data/Semantics.ts`
**职责**：游戏机制术语 → CPU 微架构术语的语义映射层。
- **层语义**：L0=Register File / L1=L1/L2 Cache / L2=Memory Bus
- **VIA tier 语义**：L1$ HIT / L2$ HIT / DRAM ACCESS
- **游戏行为语义**：FRAGMENT=LOAD 操作数 / GATE=ALU 运算 / THERMAL=PIPELINE FLUSH / RESTRUCTURE=BRANCH MISPRED / EXIT=STORE/WB
- **CPI 评级**：`cpiRating(cpi)`（S≤1.2 / A≤2.0 / B≤4.0 / C）+ `ratingTagline()`（评语副标题）

**依赖**：无（纯数据映射）
**被引用**：`GamePage.ets`、`ResultPage.ets`、`AIComment.ts`、`UIOverlay.ts`

---

### `game/data/ChipFacts.ts`
**职责**：芯片知识科普文本池（12 条），拾取碎片时顺序取模循环弹出。

**依赖**：无
**被引用**：`GameEngine.ts`

---

## 八、类型定义层（game/types/）

### `game/types/TileType.ts`
**职责**：瓦片类型枚举 + 瓦片数据类。
- `TileType` 枚举：FLOOR/WALL/VIA/GATE/FRAGMENT/THERMAL_VIA/EXIT/RAW_HAZARD
- `Tile` 类：type / viaTarget / locked / viaTier + 指令语义元数据字段（fragKind / operandLabel / aluOp / aluOperands / instrIndex）

**依赖**：无（基础类型）
**被引用**：几乎所有 `game/` 模块

---

## 九、工具层（utils/）— 9 个工具与服务模块

### `utils/IsoMath.ts`
**职责**：等距坐标变换 — 网格 ↔ 屏幕互转。
- `IsoConfig` 类：tileHalfW / tileHalfH / layerOffset / originX
- `gridToScreen()`：正变换（渲染用）
- `screenToGrid()`：逆变换（触摸命中测试用）

**依赖**：无（纯数学）
**被引用**：`GamePage.ets`、`IsoRenderer.ts`、`PlayerRenderer.ts`

---

### `utils/MazeGenerator.ts`
**职责**：迷宫生成 + 特殊瓦片放置。
- `Rng` 类：mulberry32 变体 PRNG，全项目唯一随机源（可复现）
- `generate()`：迭代版递归回溯（DFS），生成奇数网格迷宫（19×19 逻辑 9×9 cell）
- `placeVias()`：跨 pair VIA 放置（三层 1:2:3 L1/L2/MEM 轮转分配）
- `placeGates()`：BFS 死锁校验（试放 + 回退，确保 pre-GATE 区有可达 FLOOR）
- `placeFragments()`：强制 ≥1 碎片在 pre-GATE 区 + 剩余随机
- `placeThermalVias()` / `placeRawHazards()`：剩余 FLOOR 随机占位
- `placeExit()`：BFS 距离图，选最远端 FLOOR
- `bfsReachable()`：公开 BFS（数组队列 + 头指针），供 `Restructurer` 复用
- `shuffleInPlace()`：Fisher-Yates 原地洗牌

**依赖**：`TileType.ts`
**被引用**：`MapManager.ts`、`Restructurer.ts`

---

### `utils/DbHelper.ts`
**职责**：SQLite 数据库封装（`relationalStore`）。
- `initDb(context)`：幂等建库（users + game_records 表）+ ALTER TABLE 补列容错
- **用户 CRUD**：`createUser` / `findUserByNickname` / `findUserById` / `touchUserLogin` / `updateUserTitle`
- **游戏记录 CRUD**：`insertGameRecord`（heatPeak JSON 序列化）/ `queryGameRecords`（评级+时间范围筛选+倒序）/ `getBestRating` / `getRecordCount`
- **称号系统**：`TITLE_LIST` 5 级 + `getMaxTitleIndex(bestRating)` 评级映射

**依赖**：`@kit.ArkData`（relationalStore）
**被引用**：`UserSession.ts`、`Index.ets`、`LoginPage.ets`、`ResultPage.ets`、`HistoryPage.ets`、`EntryAbility.ets`

---

### `utils/UserSession.ts`
**职责**：登录态管理（PersistentStorage + AppStorage）。
- `initSession()`：`PersistentStorage.persistProp('currentUserId', -1)` 注册持久化属性
- `loginByNickname(name)`：查库 → 存在则更新登录时间 / 不存在则创建 → 写入 AppStorage
- `loginAsGuest()`：随机 `游客#XXXX` → 创建 → 写入
- `logout()`：`AppStorage.setOrCreate('currentUserId', -1)`
- `getCurrentUser()` / `getCurrentUserId()` / `isLoggedIn()`
- **称号逻辑**：`getUnlockedTitles(bestRating)`（切片 TITLE_LIST）、`selectTitle()`（仅限已解锁范围）

**依赖**：`DbHelper.ts`
**被引用**：`EntryAbility.ets`、`Index.ets`、`LoginPage.ets`、`ResultPage.ets`、`HistoryPage.ets`

---

### `utils/MusicService.ts`
**职责**：音乐播放单例服务（AVPlayer 封装）。
- 单例模式：模块级 `_instance`，`getMusicService()` 懒初始化
- `init(context)`：创建 AVPlayer → 设置状态机回调 → 加载 Preferences → 扫描 rawfile/music/ → 恢复用户曲目
- AVPlayer 状态机：`stateChange` 回调中 `initialized→prepare()`、`prepared→play()`、`completed→next()`、`error→重置`
- **播放控制**：`play()` / `pause()` / `resume()` / `togglePlay()` / `next()` / `prev()` / `playAt()`
- **音量**：`setVolume(0-100)` → AVPlayer 0.0-1.0 + Preferences 持久化
- **播放列表**：`addUserTrack()` / `removeTrack()`（内置不可删）
- **观察者模式**：`addListener()` / `removeListener()` 通知所有注册 UI 组件
- **降级扫描**：`getRawFileListSync` 不可用时硬编码 fallback 列表

**依赖**：`@kit.MediaKit`（AVPlayer）、`@kit.ArkData`（Preferences）、`@kit.LocalizationKit`（resourceManager）
**被引用**：`EntryAbility.ets`、`MusicPanel.ets`

---

### `utils/AIComment.ts`
**职责**：结算页 AI 评语 — 调 DeepSeek 生成芯片工程师视角点评。
- `getAIComment(stats)`：有 key → `callDeepSeek(prompt)`；无 key 或失败 → `generatePlaceholderComment(stats)` 规则降级
- `buildAIPrompt(stats)`：构造 CPU 微架构工程师视角 prompt（CPI / VIA 命中 / 缓存选择对比 / 热量 / RAW 冒险）
- `callDeepSeek()`：`@kit.NetworkKit` HTTP POST → 解析 `choices[0].message.content`
- **规则降级**：多条件分支 — 开场句（按评级分段）+ VIA 分布观察 + 热管理观察 + 绕路观察 + RAW 冒险观察

**依赖**：`ApiConfig.ts`、`Semantics.ts`、`@kit.NetworkKit`
**被引用**：`ResultPage.ets`

---

### `utils/DeepSeekService.ts`
**职责**：关卡指令序列生成 — 调 DeepSeek 请求合法汇编序列。
- `generateProgram(difficulty)`：有 key → `callDeepSeek(prompt)` → `InstructionGraph.parseInstructions(text)` 解析；
  失败或无 key → `offlineProgram(difficulty)`（硬编码 1×2 向量内积）
- `buildProgramPrompt(cfg)`：按难度配置构造 x86 汇编 prompt（指令集约束 / 寄存器约束 / DAG 宽度 / 输出格式）
- `offlineProgram()`：8 条指令的离线预置序列（2×LOAD + MUL ×2 + ADD + STORE）

**依赖**：`ApiConfig.ts`、`Instruction.ts`、`InstructionGraph.ts`、`@kit.NetworkKit`
**被引用**：`LoadingPage.ets`

---

### `utils/InstructionGraph.ts`
**职责**：指令序列解析 → 地图分配方案（ProgramPlan）。
- `buildPlan(program)`：遍历指令 → LOAD/MOV → 取源操作数入 operand 池（按 token 分类 FragmentKind）；ALU 指令 → 入 aluGate 池；STORE → 忽略（EXIT 承载）
- `parseInstructions(raw)`：JSON 解析 + Markdown 代码围栏剥离 + 容错兜底（字段缺失用默认值）
- **辅助**：`stripCodeFence()`（截取首个 `[` 到末个 `]`）、`asString()` / `asNumber()`（安全取值）
- **输出类型**：`ProgramPlan`（operands[] + aluGates[] + totalInstr + instrType）、`OperandSpec`、`AluGateSpec`

**依赖**：`Instruction.ts`
**被引用**：`LoadingPage.ets`（buildPlan）、`DeepSeekService.ts`（parseInstructions）、`MapManager.ts`（ProgramPlan 类型）、`ProgramStore.ts`（ProgramPlan 类型）

---

### `utils/ProgramStore.ts`
**职责**：本局指令程序的跨页面共享单例（避免 router 传大对象）。
- `setProgram(program, plan)`：LoadingPage 生成后写入
- `getProgram()` / `getPlan()`：GamePage 读取
- `clearProgram()`：返回主菜单时清空

**依赖**：`Instruction.ts`、`InstructionGraph.ts`
**被引用**：`LoadingPage.ets`（set）、`GamePage.ets`（get）

---

### `utils/ApiConfig.ts`
**职责**：DeepSeek API 配置常量（endpoint、model、key）。课程演示用明文配置。

**依赖**：无
**被引用**：`AIComment.ts`、`DeepSeekService.ts`

---

## 十、核心数据流

```
EntryAbility
  ├─ initSession() ──────────── UserSession ──── DbHelper
  ├─ initDb() ──────────────── DbHelper ──────── relationalStore(SQLite)
  └─ getMusicService().init() ─ MusicService ──── AVPlayer + Preferences

LoginPage ──→ Index ──→ DifficultyPage ──→ LoadingPage
                                               │ generateProgram()
                                               │   ├─ DeepSeek (HTTP) 或 offline
                                               │   └─ InstructionGraph.parseInstructions()
                                               │        └─ InstructionGraph.buildPlan()
                                               │             └─ ProgramStore.setProgram()
                                               ↓
                                           GamePage
                                             │ getProgram() / getPlan()
                                             ├─ MapManager(plan, fragPerLayer)
                                             ├─ GameEngine(map, program)
                                             │    ├─ PathOptimizer.solve() → optimalTau
                                             │    ├─ Player ↔ HeatManager
                                             │    ├─ GateLogic / ViaUnlock / Restructurer
                                             │    └─ tick → advance → render
                                             ├─ staticCtx: drawMapStatic()  [按需重画]
                                             └─ ctx: drawPlayerLayer() + overlays  [每帧]
                                                   ↓ 通关
                                               ResultPage
                                                 ├─ getAIComment() → DeepSeek 或规则降级
                                                 └─ insertGameRecord() → DbHelper
```

---

## 十一、分层依赖总图

```
┌──────────────────────────────────────────────────┐
│  pages/  (7 页面)                                  │
│  Login → Index → Difficulty → Loading → Game      │
│                             → Result → History    │
├──────────────────────────────────────────────────┤
│  components/  (4 组件)                             │
│  MusicPanel  HoldingBar  InfoPanel  InstrDrawer   │
├──────────────┬───────────────────────────────────┤
│  game/core/  │  game/render/    game/puzzle/      │
│  GameEngine  │  IsoRenderer     GateLogic         │
│  MapManager  │  TileSet         ViaUnlock         │
│  Player      │  PlayerRenderer                    │
│  HeatManager │  UIOverlay                         │
│  PathOptimizer│                                    │
│  Restructurer│                                    │
├──────────────┼───────────────────────────────────┤
│  game/data/  │  game/types/                       │
│  Instruction │  TileType                          │
│  Semantics   │                                    │
│  ChipFacts   │                                    │
├──────────────┴───────────────────────────────────┤
│  utils/                                            │
│  IsoMath  MazeGenerator  DbHelper  UserSession    │
│  MusicService  AIComment  DeepSeekService         │
│  InstructionGraph  ProgramStore  ApiConfig        │
└──────────────────────────────────────────────────┘
                        │
             @kit.ArkUI / @kit.ArkData
             @kit.MediaKit / @kit.NetworkKit
             @kit.CoreFileKit / @kit.LocalizationKit
             @kit.AbilityKit
```

**依赖方向**：上层（pages/components）→ 中层（game core/render/puzzle）→ 下层（utils + game data/types）→ 底层（HarmonyOS SDK Kit）
