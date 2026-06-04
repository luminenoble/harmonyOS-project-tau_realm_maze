# 指令序列重构 — 实施计划

> 源设计：[`new-design.md`](./new-design.md)
> 分支：`feat/instr-redesign`
> 本文档拆解 new-design 的实现步骤、文件清单、关键技术点与风险，作为开发蓝图。

---

## 一、设计确认（开放问题落地）

| 开放问题 | 决策 |
|----------|------|
| DeepSeek API Key 存储 | 本地明文配置 `ApiConfig.ts`（课程演示，无需考虑泄露） |
| 离线 fallback | 提供 1 个「向量内积」预置指令序列；API 不可用时自动降级 |
| RAW 数据冒险格 | **纳入 MVP** |
| 难度是否影响层数 | 不影响，固定 3 层；难度仅改变 AI 返回的指令数与每层并行宽度 |
| 结算 CPI 公式 | **按 new-design 第七节替换**：`CPI = (步数 + VIA延迟) / 总指令数`；原 PathOptimizer 的 `τ/最优τ` 退役（保留文件但不再用于评级） |
| 路由接入 | `Index → DifficultyPage → LoadingPage → GamePage`（新增两页） |

---

## 二、核心数据流

```
DifficultyPage (选难度)
      │ difficulty
      ▼
LoadingPage (终端风格加载)
      │ DeepSeekService.generateProgram(difficulty)
      │   ├─ 成功：解析 JSON → InstructionProgram
      │   └─ 失败/无网：offline fallback（向量内积）
      │ InstructionGraph.buildPlan(program) → ProgramPlan
      │ ProgramStore.set(program, plan)        ← 全局单例传递（避免 router 大对象）
      ▼
GamePage
      │ ProgramStore.get()
      │ new MapManager(19, 19, 3, seed, plan)  ← plan 注入操作数/ALU 语义
      │ new GameEngine(map, program)           ← 指令执行状态机 + CPI
      ▼
ResultPage
      │ VictoryStats（含 totalInstr / instrType）
      │ CPI = (steps + tauVia) / totalInstr → S/A/B/C
```

**设计取舍**：为降低对已稳定的迷宫生成 / BFS 校验链路的破坏，指令语义以「叠加元数据」方式落在既有 FRAGMENT / GATE 瓦片上，而非重写放置算法：

- 迷宫、VIA、碎片、门、散热、EXIT 的**放置位置**仍由 `MazeGenerator` 决定（保持连通性校验不变）；
- `ProgramPlan` 提供操作数池 + ALU 算子序列，`MapManager` 在放置后把语义**标注**到已生成的 FRAGMENT / GATE 瓦片上；
- 收集碎片 = 执行一条 LOAD/MOV；通过 ALU 门 = 执行一条运算指令；踩 EXIT = STORE/WB。

---

## 三、文件清单

### 新增

| 文件 | 职责 |
|------|------|
| `game/data/Instruction.ts` | 指令 / 操作数 / ALU 算子 / 难度配置的数据模型与枚举 |
| `utils/InstructionGraph.ts` | 解析指令 JSON → 依赖深度 → 产出 `ProgramPlan`（操作数池 + ALU 序列 + 每层碎片数） |
| `utils/DeepSeekService.ts` | 指令序列生成 API 封装 + 离线向量内积 fallback |
| `utils/ProgramStore.ts` | 跨页面共享本局 `InstructionProgram` + `ProgramPlan`（模块级单例） |
| `pages/DifficultyPage.ets` | 难度选择页（Easy/Normal/Hard） |
| `pages/LoadingPage.ets` | 终端风格加载页（API 等待 + 逐行打印 + 跳转） |
| `components/InstructionDrawer.ets` | 右侧参考文档抽屉（本局指令序列 + 进度） |
| `components/InfoPanel.ets` | 右侧点击信息卡片 |
| `components/HoldingBar.ets` | 顶部「持有寄存器」状态条 |

### 修改

| 文件 | 改动 |
|------|------|
| `utils/ApiConfig.ts` | 填入演示 Key；新增难度→指令数/并行宽度常量 |
| `game/types/TileType.ts` | 新增 `RAW_HAZARD`；`Tile` 扩展操作数 / ALU 元数据字段 |
| `game/core/HeatManager.ts` | 阈值 60/90；三层独立积热速率 [2, 1.5, 1] |
| `game/core/MapManager.ts` | 接收 `ProgramPlan`，标注操作数 / ALU 语义；难度化碎片数；放置 RAW 格 |
| `game/core/Player.ts` | 新增 `heldOperands`（持有操作数列表） |
| `game/puzzle/GateLogic.ts` | ALU 门通过条件改为「持有所需操作数」 |
| `game/core/GameEngine.ts` | 指令执行状态机；CPI=(步数+延迟)/指令数；RAW 失效；持有/进度 getter |
| `game/render/TileSet.ts` | 操作数碎片皮肤（寄存器/立即数/地址）、ALU 门皮肤、VIA CALL/RET 文本、RAW 格 |
| `game/render/IsoRenderer.ts` | 屏幕坐标 → 网格命中测试（供点击信息面板） |
| `game/render/UIOverlay.ts` | CPI 仪表盘（替换 τ 仪表）、当前指令提示 |
| `pages/GamePage.ets` | 19×19；挂载 Drawer/InfoPanel/HoldingBar；点击命中；读取 ProgramStore |
| `pages/ResultPage.ets` | τ→CPI=(步数+延迟)/指令数；展示指令类型 |
| `pages/Index.ets` | 「进入」改为跳 DifficultyPage |
| `utils/DbHelper.ts` | `game_records` 新增 `instr_type` 字段（建表 + 写入 + 读取兜底） |
| `utils/AIComment.ts` | prompt 接入指令类型 / 指令数 / RAW 次数；CPI 用新公式 |
| `resources/base/profile/main_pages.json` | 注册 DifficultyPage / LoadingPage |

### 不变

`MazeGenerator`（仅尺寸由调用方传 19）、`MusicService` / `MusicPanel`、`PathOptimizer`（退役但保留）、`Restructurer`、`ViaUnlock`（延迟模型复用）。

---

## 四、关键技术点

### 4.1 指令模型（Instruction.ts）

```
enum FragmentKind { REGISTER, IMMEDIATE, ADDRESS }
enum AluOp { ADD, SUB, MUL, AND, OR, XOR, SHL, SHR }   // 与 ALU 门对应
interface Instruction { index, mnemonic, operands, comment, depth }
```

- 难度配置：Easy=9 条 / 并行≤2 / 碎片2；Normal=12 / ≤3 / 3；Hard=15 / ≤4 / 4。

### 4.2 ProgramPlan（InstructionGraph.ts）

从指令序列提取：
- **操作数池**：所有 LOAD/MOV 目标 → 寄存器/立即数/地址碎片标签（去重，保留出现序）；
- **ALU 序列**：所有运算指令的算子 + 所需源操作数；
- **总指令数** `totalInstr`、**指令类型描述** `instrType`（如「1×2 向量内积」）。

`MapManager` 按层 round-robin 把操作数标签贴到已放置的 FRAGMENT 上，把 ALU 算子贴到 GATE 上。

### 4.3 CPI 与评级（Semantics.ts 复用阈值）

```
CPI = (steps + tauVia) / totalInstr
S ≤ 1.2 / A ≤ 2.0 / B ≤ 4.0 / C > 4.0
```

> 注意：分母换成「总指令数」后，CPI 量级与原「τ/最优τ」不同，但 S/A/B/C 阈值沿用 new-design 第七节给定值。

### 4.4 RAW 数据冒险

- `RAW_HAZARD` 瓦片，每层 1–2 个；
- 踩上 → 当前持有的某个寄存器操作数失效（从 `heldOperands` 移除一个），需重新拾取对应碎片（该碎片瓦片复原）；
- HUD 顶部持有条实时更新，触发 `PIPELINE FLUSH`/`HAZARD` 提示。

### 4.5 点击信息面板

- Canvas `onTouch` 命中 → `screenToGrid` 反解网格坐标 → 查瓦片 → 弹 `InfoPanel`；
- `IsoRenderer` 提供 `screenToGrid`（`IsoMath` 已有逆变换可复用 / 必要时新增）。

---

## 五、实施阶段（提交节奏）

1. **docs + 基础数据**：本计划 + `Instruction.ts` / `InstructionGraph.ts` / `DeepSeekService.ts` / `ProgramStore.ts` / `ApiConfig.ts`。
2. **地图参数 + 散热**：`HeatManager`（60/90、三层速率）、`MazeGenerator` 尺寸、`TileType` 扩展。
3. **核心玩法**：`Player` 持有、`GateLogic` ALU、`MapManager` 语义标注 + RAW、`GameEngine` 指令状态机 + CPI。
4. **渲染**：`TileSet` 皮肤、`IsoRenderer` 命中、`UIOverlay` CPI 盘。
5. **页面/组件**：难度页、加载页、抽屉/信息/持有条组件、GamePage/ResultPage/Index 接入、DbHelper、路由注册。

每阶段独立 commit；提交信息遵循 `docs/git-format.md`（`feat(scope): ...` / `refactor(scope): ...`）。

---

## 六、风险

| 风险 | 缓解 |
|------|------|
| WSL 无法编译 ArkTS，类型/装饰器错误只能事后修 | 严格显式类型、对象字面量配 interface、类字段初始化；分阶段小步提交便于定位 |
| 指令语义与随机迷宫放置耦合 | 采用「叠加元数据」而非重写放置，保留既有 BFS 连通性保证 |
| DeepSeek 返回格式不稳 / 无网 | 严格 JSON 解析 + 离线 fallback，任何异常都回退预置序列 |
| RAW 失效导致死锁（碎片已被门消耗） | RAW 仅作用于「当前持有」，失效后对应碎片瓦片复原可重新拾取 |
| router 传大对象 | 用 `ProgramStore` 模块单例共享，router 仅传难度/结算标量 |

---

## 七、实现记录

- 2026-06-03：建分支 `feat/instr-redesign`，移入 `new-design.md`，落地本计划。
- 2026-06-03：**阶段 1（基础数据）** — `Instruction.ts`（模型/枚举/难度配置/分类工具）、`InstructionGraph.ts`（JSON 解析 + ProgramPlan）、`DeepSeekService.ts`（生成 + 离线向量内积 fallback）、`ProgramStore.ts`（跨页共享）、`ApiConfig.ts`（演示 Key）。
- 2026-06-03：**阶段 2（地图/散热）** — `HeatManager`（60/90 + 三层速率 [2,1.5,1]）、`TileType`（RAW_HAZARD + 指令语义元数据）、`MazeGenerator.placeRawHazards`、`MapManager`（接 ProgramPlan + 难度碎片数 + 标注语义）。
- 2026-06-03：**阶段 3（核心玩法）** — `Player.heldOperands`、`GateLogic` 改持有操作数判定、`GameEngine` 指令执行状态机（LOAD 装载 / ALU 执行生成结果寄存器 / RAW 失效）+ CPI=(步数+延迟)/指令数 + hazard 回调。
- 2026-06-03：**阶段 4（渲染）** — `TileSet` 操作数三皮肤 + ALU 算子文本 + VIA CALL/RET + RAW 危险块；`drawTile` 分派传元数据。
- 2026-06-03：**阶段 5（UI/页面）** — `DifficultyPage` / `LoadingPage` / `HoldingBar` / `InfoPanel` / `InstructionDrawer`；`GamePage` 19×19 + ProgramStore 接入 + 点击命中信息卡 + CPI 侧栏；`ResultPage` CPI 新公式；`DbHelper.instr_type`；`AIComment` 接指令上下文；`Index`→难度页；`main_pages` 注册。
- 2026-06-03：**修复** — 上行 VIA 解锁阈值改为本层碎片总数（修 Easy/Hard 难度软锁）。

> 说明：WSL 无法编译 ArkTS，已用 `tsc --noEmit` 对纯 TS 文件做语法预检（无 TS1xxx 语法错误）；`.ets`（ArkUI 装饰器）需在 DevEco Studio Build 验证，报错回传后迭代修复。
