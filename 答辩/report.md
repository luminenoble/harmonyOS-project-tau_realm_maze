# TauRealmMaze 课程报告 — 写作指导

> 本文是**报告撰写蓝图**，给出每章要点、对应代码位置、配图建议与写作提示。
> 后续由 Claude cowork 据此扩写成正式报告。数据库部分按 `答辩/db-table-split.md` 的 **5 表拆解后**结构描述（视作已实现）。
> 全篇主线：**玩家 = 控制信号，游戏 = 执行一段 CPU 指令序列**。

---

## 0. 摘要 / 封面

- 一句话定位：基于华为"韬定律"（2D 平面 → 3D 堆叠芯片）的 HarmonyOS 平板解谜游戏；把"一条机器指令在三级存储层级中完成执行"具象为跨层迷宫闯关。
- 关键词：HarmonyOS / ArkTS / ArkUI / Canvas 2.5D 等距 / SQLite / DeepSeek API / CPI 评分。
- 摘要写法：背景一句 + 玩法一句 + 技术栈一句 + 亮点三点（AI 生成关卡、分层渲染优化、5 表持久化）。

---

## 1. 项目背景与概念映射

- **背景**：韬定律——芯片从二维晶体管布局演进到三维堆叠通信架构；散热与跨层互连成为新瓶颈。
- **核心隐喻表**（务必放一张映射表，是全篇灵魂）：

| 游戏元素 | CPU / 微架构概念 |
|----------|-----------------|
| 玩家（控制信号） | CPU 控制单元发出的控制信号 |
| 收集碎片 | 执行 LOAD/MOV，操作数入寄存器文件 |
| 碎片三皮肤 | 寄存器 / 立即数 / 内存地址操作数 |
| ALU 门 | ADD/MUL/AND… 运算指令 |
| RAW 危险格 | 读后写数据冒险（流水线气泡） |
| VIA（CALL/RET） | 跨层跳转 = 函数调用 / 缓存访问 |
| L1/L2/MEM-VIA 延迟 1/3/6 | 三级存储命中延迟（cycle） |
| 热量 / 强制降层 | 三维堆叠散热瓶颈 |
| 动态重构 | 芯片动态路由 / 分支预测刷新 |
| 到达 EXIT | STORE / 写回（WB），指令序列执行完成 |
| CPI 评级 | Cycles Per Instruction 性能指标 |

- 写作提示：先讲"为什么选这个题"（贴合华为芯片主题 + 教学性），再讲"如何把抽象的指令执行变成可玩的迷宫"。

---

## 2. 项目结构

- 放**目录树**（直接引用 `CLAUDE.md` 的"项目架构"小节）+ 分层说明：
  - `pages/`：6 页（Index → Difficulty → Loading → Game → Result，外加 Login/History）。
  - `components/`：4 个可复用组件（MusicPanel / HoldingBar / InfoPanel / InstructionDrawer）。
  - `game/core`（引擎/状态机/地图/热量/最优解）、`game/render`（等距渲染）、`game/puzzle`（门/VIA）、`game/data`（指令模型/语义）、`game/types`。
  - `utils/`：迷宫生成、坐标、指令解析、DeepSeek、ProgramStore、DB、会话、音乐。
- 放一张**数据流图**（关键）：

```
Index ─选难度→ DifficultyPage ─difficulty→ LoadingPage
  └ DeepSeekService.generateProgram → InstructionGraph.buildPlan → ProgramStore
       └→ GamePage: MapManager(plan) + GameEngine(program) ──通关 stats──→ ResultPage → DbHelper(5表)
```

- 写作提示：强调**分层解耦**——纯逻辑（`game/**`、`utils/**` 的 `.ts`）与 ArkUI（`.ets`）分离，逻辑可单测、UI 只负责呈现。

---

## 3. 设计理念

- **三条主线**：
  1. **隐喻驱动**：每个机制都对应一个真实 CPU 概念（见第 1 章映射表），玩中学。
  2. **AI 生成关卡**：用 DeepSeek 实时生成合法汇编序列，使每局任务不同；离线 fallback 保证可演示。
  3. **关注点分离**：引擎（状态机）/ 渲染（双画布）/ 数据（5 表）/ 网络（API）各司其职，便于维护与答辩讲解。
- **难度即指令规模**：Easy/Normal/Hard 只改指令数与碎片数，不改层数——降低实现复杂度同时保留挑战梯度。
- **可演示性优先**：无 key/断网都能玩（离线预置序列）；评分既忠于设计公式又保证评级有区分度（见 4.2 / `redesign-plan.md §4.3`）。

---

## 4. ArkTS 关键技术（报告主体，逐项配代码片段）

### 4.1 页面切换 & 组件通信

- **页面路由**：`@kit.ArkUI` 的 `router.pushUrl / replaceUrl / back`；`@Entry` 页面通过 `main_pages.json` 注册。
  - 传**标量**参数用 router params（如 difficulty、通关 `VictoryStats`）；解析用 `router.getParams() as XxxParams`（配 `interface`）。
  - 代码点：`DifficultyPage.start()`、`GamePage` 通关回调 `router.replaceUrl({url:'pages/ResultPage', params: stats})`。
- **传大对象用模块单例**：本局指令程序 `InstructionProgram` + `ProgramPlan` 不走 router，存 `utils/ProgramStore.ts`（模块级变量 + getter/setter），`LoadingPage` 写、`GamePage` 读——避免 router 序列化大对象。
- **组件通信**：
  - 父→子：`@Prop`（HoldingBar 的 `heldLabels/nextInstr`、InstructionDrawer 的 `instructions/executedCount`）。
  - 子→父：回调成员（InfoPanel/InstructionDrawer 的 `onClose: () => void`）。
  - 页面内状态：`@State`（GamePage 的 HUD 字段），变化触发 ArkUI 增量刷新。
- 写作提示：对比"router params vs 模块单例 vs @Prop"三种通信方式各自的适用场景，是本节加分点。

### 4.2 迷宫渲染（**重点：渲染顺序与优化**）

- **等距坐标变换**（`utils/IsoMath.ts`）：
  - `screen_x=(col-row)·halfW+originX`，`screen_y=(col+row)·halfH+originY+layer·layerOffset`；逆变换 `screenToGrid` 用于点击命中。
- **瓦片皮肤**（`game/render/TileSet.ts`）：地板 / 墙（三面立体）/ 操作数三类 / ALU 门（算子文字）/ VIA（CALL/RET + 金银铜）/ RAW / EXIT。
- **渲染顺序与遮挡（必讲，画时序图）**：
  - 早期单画布两遍法：Pass1 地板+特殊瓦片（平面），Pass2 墙+玩家**按 `row+col` 升序 painter's 同排**，解决"玩家走到墙后该被遮挡 / 走到墙前该覆盖墙"。
  - **优化：双画布分层缓存**（`GamePage` + `IsoRenderer`）——
    - 底层 `staticCtx`：`drawMapStatic` 只画地板 + 特殊瓦片，**仅当 `GameEngine.mapVersion`（拾取/ALU/RAW/散热/重构/切层自增）或层号/尺寸变化时重画**；
    - 顶层透明 `ctx`：`drawDynamicLayer` 每帧画 残影 +（**墙 + 玩家同排 painter's 排序**）+ overlay。
    - 收益：最贵的 19×19=361 格地板 + 文字标签被缓存，移动时不再每帧重绘整图；**墙仍与玩家同排排序，保留正确遮挡**。
  - **HUD 防抖**：`syncFromEngine` 逐字段"变化才写"`@State`、持有标签按内容指纹比对——避免动画每帧重渲侧栏（曾是卡顿主因之一）。
  - **调试埋点**：`DBG` 开关输出 `frameMs / dynMs / staticMs×N`，用于区分"Canvas 绘制瓶颈"还是"ArkUI 重渲/调度瓶颈"。
- 配图建议：①两遍渲染时序图 ②双画布分层示意 ③优化前后每帧绘制量对比表。
- 代码点：`IsoRenderer.ts` 的 `drawMapStatic / drawDynamicLayer`、`GamePage` 的 `renderFrame / renderStatic / renderDynamic / computeCfg`。
- 排查记录：`docs/redesign/perf-and-bugfix.md`。

### 4.3 事件机制（setInterval 等与渲染结合）

- **主循环 = setInterval tick**（`GameEngine.startLoop`，16ms/帧）：`advance()` 推进状态机 → `onTick()` 回调（GamePage 同步 @State + `renderFrame()`）→ 若回到 IDLE 则 `stopLoop()`（**省电：静止不空转**）。
- **补间动画**：`Player.tick()` 用 `progress += speed` 做格间插值，渲染按浮点 `visualCol/visualRow`；过热时 `setSpeed(0.05)` 让动画变慢（视觉反馈）。
- **输入事件**：`PanGesture` 滑动方向 → `tryMove`；`Canvas.onTouch`（Down/Up 位移阈值区分点击/滑动）→ 点击命中 `screenToGrid` → 弹 `InfoPanel`；虚拟 D-Pad `Button.onClick`。
- **定时驱动的 UI**：LoadingPage 用 `setInterval` 推进假进度条 + 逐行打印终端日志；VIA 等待、转场、动态重构均由 tick 内的相位推进。
- 写作提示：强调"**setInterval 驱动状态机推进，状态机再触发 Canvas 重绘**"这条主链，以及 IDLE 时停表的设计。

### 4.4 SQLite & 持久化存储

- **relationalStore（SQLite）**：`utils/DbHelper.ts`，`initDb` 幂等建表。
- **5 表设计（3NF，按 `db-table-split.md`）**：
  - `users` / `titles`(1:N 称号解锁记录) / `game_sessions`(每局核心) / `cache_hits`(1 局 3 行，行存替代 l1/l2/mem 横列) / `session_analysis`(热量峰值拆原子列 + AI 长文本分离)。
  - 写入用**事务**：1×session + 3×cache_hits + 1×analysis；查询用 JOIN / `GROUP BY tier` 聚合。
  - 讲清"**为什么拆**"：消除 JSON 反范式（`heat_peak`）与同质横列（l1/l2/mem），换来 SQL 直接聚合与可扩展（加 L3 缓存只需 INSERT 行）。
- **登录态持久化**：`PersistentStorage.persistProp<number>('currentUserId')`，重启自动恢复，`EntryAbility.onWindowStageCreate` 据此选首页。
- **Preferences**：音量、用户曲目（`MusicService`）。
- 配图：5 表 ER 图（直接用 `db-table-split.md` 的 ER）。

### 4.5 多媒体 & 文件管理

- **AVPlayer 状态机**（`utils/MusicService.ts`，单例）：`idle → initialized(设源) → prepared(prepare) → playing(play)`；`stateChange` 回调里**必须显式 `prepare()`**否则卡 initialized（HarmonyOS 特性，必讲）。
- **内置曲库扫描**：`@kit.CoreFileKit` 读 `resources/rawfile/music/`；用户自选曲目用 `AudioViewPicker`。
- **跨页面共享实例**：Index 与 GamePage 都挂 `MusicPanel`，切页 AVPlayer 不销毁，播放连续。
- **文件/资源**：应用图标 `media/layered_image`（background+foreground 分层自适应图标）；可补充"图标分层机制"作为文件资源管理案例。

### 4.6 网络 & API 相关

- **NetworkKit http**：`utils/DeepSeekService.ts`（指令序列生成）与 `utils/AIComment.ts`（结算评语），OpenAI 兼容 Chat Completions。
- **流程**：构造 prompt（约束指令集/寄存器/JSON 格式）→ POST → 解析 `choices[0].message.content` →（指令）`InstructionGraph.parseInstructions` 剥离代码围栏 + 容错解析。
- **健壮性（必讲）**：`connectTimeout/readTimeout`、`responseCode` 校验、`try/finally` 释放 `httpRequest.destroy()`、**任意异常降级**（无 key/超时/解析失败 → 离线"向量内积"预置序列 / 规则占位评语）。
- 配图：API 请求-解析-降级 流程图。

---

## 5. 其它技术

### 5.1 迷宫与最优路径算法

- **迷宫生成**（`utils/MazeGenerator.ts`）：迭代版递归回溯（DFS + 厚墙），`mulberry32` 可种子化 PRNG（可复现）；并负责 VIA / GATE / FRAGMENT / THERMAL / RAW / EXIT 放置，且用 **BFS 校验连通性**（保证 pre-GATE 区有碎片、EXIT 远离起点、不死锁）。
- **最优 τ 求解**（`game/core/PathOptimizer.ts`，作 CPI 评级基准）：利用"层序被规则强制为 L0→L1→L2"，降为逐层子问题——**逐层 BFS 最短路 + 碎片访问顺序全排列 + 上行 VIA tier 枚举**取总周期最小；门两阶段（碎片<1 门锁）。复杂度可控（每层碎片少，全排列可行）。
- 写作提示：说明"为何能用全排列而非 Held-Karp"（碎片数小），体现算法权衡意识。

### 5.2 游戏状态机简介

- `GameEngine.EnginePhase`：`IDLE → MOVING → (VIA_WAIT) → TRANSITION_OUT → TRANSITION_IN`、`RESTRUCTURE_WARN → RESTRUCTURE_PULSE`。
- 画**状态转移图**：移动落地分派（碎片/ALU/RAW/散热/VIA/EXIT）、VIA 缓存等待、切层转场（shutter vs 黑屏 fade）、每 20 步重构、过热降层（**改为"尝试移动时"触发**，避免拾取碎片时被弹回）。
- 指令执行子状态：持有操作数列表、ALU 解锁、`mapVersion`、CPI 累计。

---

## 6. 不足与未来优化方向（必写，三点）

1. **多人联机协同模拟**：当前单机单人。未来可做"多控制信号协同执行同一指令序列"——多人分别负责取操作数 / 过 ALU / 写回，引入分布式状态同步（如基于分布式数据管理或自建信令），把"超标量并行/多核"具象为多人协作，CPI 改为团队协同效率评分。
2. **动态重构算法升级**：现 `Restructurer` 为避免堵死**只开墙不关墙**。未来用"**带连通性校验的增删**"——关墙前用并查集 / BFS 验证仍连通（起点→所有碎片→EXIT 可达）再提交，实现"既能加阻碍又保证不死锁"的真正动态路由，更贴合芯片动态布线。
3. **寄存器与逻辑门 UI 差异化**：现操作数仅三类皮肤、ALU 门仅算子文字。未来按具体寄存器（eax/ebx/…）与门类型（ADD/MUL/移位/位运算）做**差异化图标、配色与动效**（如 MUL 门齿轮旋转、移位门箭头流动、不同寄存器不同芯片纹理），提升识别度与表现力。

---

## 附录

- **运行说明**：WSL 写码 → DevEco Studio Build → 平板/模拟器运行；DeepSeek key 已在 `ApiConfig.ts` 本地配置（仅演示）。
- **提交规范**：`docs/git-format.md`（Conventional Commits）。
- **过程文档**：`docs/redesign/`（重构计划、排查记录）、`答辩/db-table-split.md`（5 表拆解）、`答辩/项目概要_ArkTS特性与TS功能分析.md`。
