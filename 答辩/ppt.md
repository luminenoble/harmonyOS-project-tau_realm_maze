# TauRealmMaze 答辩 PPT — 分页脚本

> 每页给出 **标题 / 要点（直接做 bullet）/ 配图建议 / 讲稿提示**。
> 顺序严格按要求：项目结构 → 设计理念 → ArkTS 技术（页面切换&组件通信、迷宫渲染【重点】、事件机制、SQLite&持久化、多媒体&文件、网络&API）→ 其它技术（迷宫最优算法、游戏状态机）→ 不足与未来。
> 数据库按 `db-table-split.md` 的 **5 表**讲（视作已实现）。建议 18–20 页，控制 12–15 分钟。

---

## P1 · 封面
- 标题：**TauRealmMaze —— 在芯片里执行一条 CPU 指令**
- 副标题：基于华为"韬定律"的 HarmonyOS 平板解谜游戏
- 署名 / 学号 / 日期；底图用游戏等距截图
- 讲稿：一句话——"玩家是一段控制信号，闯关 = 把一条机器指令在三级存储中跑完。"

## P2 · 一分钟看懂玩法（概念映射）
- 左：游戏截图（玩家、碎片、ALU 门、VIA、热量条、指令抽屉）
- 右：**映射表**（精简版）
  - 玩家=控制信号 · 碎片=操作数(LOAD) · 门=ALU运算 · VIA=缓存跳转(CALL/RET) · 热量=堆叠散热 · EXIT=写回(WB) · 评分=CPI
- 讲稿：强调"玩中学微架构"，难度=指令数（Easy9/Normal12/Hard15）。

## P3 · 项目结构（目录树）
- 贴**目录树**（`pages / components / game{core,render,puzzle,data,types} / utils / resources`）
- 一句话标注每层职责；高亮"**纯逻辑 .ts 与 ArkUI .ets 分离**"
- 配图：分层色块图
- 讲稿：6 页面 + 4 组件 + 引擎/渲染/数据三大块。

## P4 · 数据流（从选难度到结算）
- 流程图：
  `Index → Difficulty → Loading(DeepSeek生成→解析→ProgramStore) → Game(MapManager+GameEngine) → Result → DB(5表)`
- 讲稿：突出"AI 生成关卡"和"模块单例跨页传程序"两个设计点。

## P5 · 设计理念
- 三条主线（每条一行）：
  1. **隐喻驱动**——每个机制对应真实 CPU 概念
  2. **AI 生成关卡**——DeepSeek 实时出题 + 离线 fallback 保演示
  3. **关注点分离**——引擎/渲染/数据/网络解耦
- 讲稿：可演示性优先（无网也能玩）；难度只改规模不改结构。

---

## P6 · ArkTS①：页面切换 & 组件通信
- **路由**：`router.pushUrl/replaceUrl/back` + `main_pages.json` 注册；标量参数走 router params（difficulty、通关 stats）
- **大对象走模块单例**：`ProgramStore` 存本局指令程序，Loading 写 / Game 读（避免 router 序列化大对象）
- **组件通信**：父→子 `@Prop`（HoldingBar/Drawer）；子→父 回调 `onClose`；页面内 `@State`
- 配图：三种通信方式对照小表
- 讲稿：为什么 router 传不了大对象、单例如何补位。

## P7 · ArkTS②：迷宫渲染【重点·渲染顺序】
- **等距变换**：`screen_x=(col−row)·halfW`，`screen_y=(col+row)·halfH+layer·offset`；逆变换做点击命中
- **遮挡难题**：玩家走到墙后要被挡、走到墙前要盖住墙
- **解法：painter's 同排排序**——墙块 + 玩家放一个数组按 `row+col` 升序绘制，玩家 `+0.001` 偏移定前后
- 配图：①两遍渲染时序图 ②"玩家被前方墙遮挡 vs 覆盖后方墙"对比截图
- 讲稿：这是 2.5D 等距的核心，错了角色就会"穿墙/被吞"。

## P8 · ArkTS②：迷宫渲染【重点·性能优化】
- 问题：19×19=361 格，**每帧全量重绘**（地板+墙+文字标签）→ 移动卡顿
- **优化 = 双画布分层缓存**：
  - 底层 `staticCtx`：地板+特殊瓦片，**仅 mapVersion/层/尺寸变化才重画**
  - 顶层透明 `ctx`：残影+（墙+玩家 painter's）+overlay，每帧重画
- **HUD 防抖**：`@State` 逐字段"变化才写"，持有标签指纹比对
- **调试**：`DBG` 输出 `frameMs/dynMs/staticMs×N` 定位瓶颈
- 配图：优化前后"每帧绘制量"对比表 + DBG 面板截图
- 讲稿：缓存静态层 + 墙仍与玩家同排 = 既快又不丢遮挡。

## P9 · ArkTS③：事件机制（setInterval × 渲染）
- **主循环**：`GameEngine` 用 `setInterval(16ms)` 跑 tick：`advance()` 推状态机 → `onTick` 同步@State + `renderFrame()` → 回 IDLE 即 `stopLoop()`（静止不空转）
- **补间**：`Player.tick()` 浮点插值，过热 `setSpeed` 变慢
- **输入**：PanGesture 滑动 / Canvas.onTouch 点击命中 / D-Pad onClick
- 配图：`setInterval → 状态机 → Canvas 重绘` 主链图
- 讲稿：定时器驱动状态机、状态机驱动渲染，是整个游戏的心跳。

## P10 · ArkTS④：SQLite & 持久化（5 表）
- relationalStore 建 **5 表**（3NF）：`users / titles / game_sessions / cache_hits / session_analysis`
- 拆解动机：消除 `heat_peak` JSON 反范式、`l1/l2/mem` 同质横列 → SQL 可直接聚合、可扩展
- 写入用**事务**（1 session + 3 cache_hits + 1 analysis）
- 登录态 `PersistentStorage` 持久化；音量/曲目 `Preferences`
- 配图：5 表 ER 图（取自 `db-table-split.md`）
- 讲稿：从 2 表到 5 表的范式权衡，体现数据库设计意识。

## P11 · ArkTS⑤：多媒体 & 文件管理
- **AVPlayer 状态机**：`idle→initialized→prepared→playing`；`stateChange` 里**必须显式 prepare()**（HarmonyOS 坑点）
- 内置曲库扫描 `rawfile/music/`；用户曲目 `AudioViewPicker`
- 跨页面共享单例：切页不销毁、播放连续
- 资源：应用图标 `layered_image`（background+foreground 分层自适应图标）
- 讲稿：讲那个"不调 prepare 就没声音"的踩坑，最能体现实战。

## P12 · ArkTS⑥：网络 & API（DeepSeek）
- NetworkKit http，OpenAI 兼容 Chat Completions
- 两处调用：**生成指令序列**（DeepSeekService）+ **结算评语**（AIComment）
- 健壮性：超时/状态码校验 / `try-finally destroy()` / **失败全降级**（离线向量内积序列 + 规则占位评语）
- JSON 容错：剥离 ``` 代码围栏、字段缺失兜底（InstructionGraph）
- 配图：请求→解析→降级 流程图 + 终端风格 Loading 截图
- 讲稿：演示"断网也能玩"，强调工程健壮性。

---

## P13 · 其它技术①：迷宫与最优路径算法
- **生成**：迭代递归回溯 + mulberry32 可复现 PRNG；BFS 校验连通性（pre-GATE 有碎片、EXIT 远离起点、不死锁）
- **最优 τ**（CPI 评级基准）：层序被规则强制 L0→L1→L2 → 逐层子问题：**BFS 最短路 + 碎片顺序全排列 + VIA tier 枚举**取最小
- 配图：BFS 距离热力示意 / 逐层分解图
- 讲稿：为何全排列可行（碎片数小），体现算法权衡。

## P14 · 其它技术②：游戏状态机
- **状态图**：`IDLE→MOVING→(VIA_WAIT)→TRANSITION_OUT/IN`、`RESTRUCTURE_WARN→PULSE`
- 落地分派：碎片/ALU/RAW/散热/VIA/EXIT
- 关键修复：**过热降层改在"尝试移动时"触发**（拾取碎片不再被弹回起点）
- 配图：EnginePhase 状态转移图
- 讲稿：状态机让"移动/等待/转场/重构"互不打架。

---

## P15 · 现场演示（建议穿插）
- 选难度 → 终端加载 → 收集操作数 → 过 ALU 门 → CALL 切层 → 写回结算 → CPI 评级 + AI 评语
- 备：若现场无网，自动走离线向量内积，照样完整演示。

## P16 · 不足与未来优化方向
- **① 多人联机协同模拟**：多控制信号协作执行同一序列（取数/运算/写回分工），引入状态同步，把"超标量/多核并行"具象为多人协同，CPI→团队效率。
- **② 动态重构算法升级**：现仅"开墙不堵路"防死锁；未来用**并查集/BFS 连通性校验**实现"可加阻碍且保证不堵死"的真正动态路由。
- **③ 寄存器/逻辑门 UI 差异化**：按具体寄存器（eax/ebx…）与门类型（MUL/移位/位运算）做差异化图标、配色与动效，提升识别度与表现力。

## P17 · 总结
- 一句话：用一款等距迷宫，把"一条 CPU 指令的执行"讲清楚了
- 技术亮点回顾：AI 生成关卡 · 双画布分层渲染 · 5 表持久化 · 全链路降级
- 致谢 / Q&A

---

### 配图清单（提前准备）
1. 游戏主界面等距截图（标注各元素）
2. 概念映射表
3. 目录树分层图 + 数据流图
4. 两遍/分层渲染时序图 + 遮挡对比截图 + DBG 面板
5. setInterval→状态机→渲染 主链图
6. 5 表 ER 图
7. AVPlayer 状态机图
8. DeepSeek 请求→解析→降级 流程图 + Loading 终端截图
9. EnginePhase 状态转移图
10. 未来方向示意（多人协同 / 动态阻碍 / UI 差异化）
