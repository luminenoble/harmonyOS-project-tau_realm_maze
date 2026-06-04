# TauRealmMaze — 项目概要（答辩参考）

## 项目简介

TauRealmMaze（韬略·芯片迷宫）是一款基于 HarmonyOS ArkTS 开发的 2.5D 等距视角解谜游戏，以华为"韬定律"（芯片从二维平面布局演进到三维堆叠通信架构）为概念原型。玩家扮演一段数据包，在多层芯片迷宫中收集信号碎片、激活逻辑门、穿越层间 VIA 通孔，以最低 τ 值（总时延）完成指令执行。

---

## 一、项目使用的 ArkTS 特性

### 1. 前端框架 — ArkUI（Stage 模型）

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `@Entry` + `@Component` | 所有页面文件 (`GamePage.ets`, `Index.ets`, `LoginPage.ets`, `ResultPage.ets`, `HistoryPage.ets`) | 声明式 UI 组件体系，`@Entry` 标记页面入口，`@Component` 标记可复用组件 |
| `@State` 响应式状态 | 所有页面和组件 | 状态-视图自动绑定，状态变化自动触发 UI 刷新（如 `@State currentLayer: number`） |
| `@Prop` 父子传参 | `HoldingBar.ets`, `InfoPanel.ets`, `InstructionDrawer.ets` | 父组件向子组件单向传递数据 |
| `@Builder` 构建函数 | `GamePage.ets`（`Sidebar()`, `DPad()`, `TitlePickerDialog()`）、`ResultPage.ets` | 自定义可复用 UI 片段，支持在 `build()` 中按需组合 |
| 内置 UI 组件 | 全局 | `Button`, `Text`, `Row`, `Column`, `Stack`, `List`, `ListItem`, `Scroll`, `Progress`, `Slider`, `Divider`, `TextInput`, `Canvas`, `Blank` |
| `ForEach` 循环渲染 | `HistoryPage.ets`, `Index.ets`, `MusicPanel.ets`, `InstructionDrawer.ets` | 动态列表渲染，带 key 函数优化 diff |
| 条件渲染 | `GamePage.ets`（`if (this.showInfo)`, `if (this.showDrawer)`） | 基于状态的条件显示/隐藏 |
| `FlexAlign` / `HorizontalAlign` / `Alignment` | 全局布局 | Flex 布局对齐控制 |
| `TextOverflow.Ellipsis` | `MusicPanel.ets`, `HistoryPage.ets` | 文本溢出省略号处理 |

### 2. 页面路由与导航 — `@kit.ArkUI` Router

| 特性 | 具体使用 | 说明 |
|------|---------|------|
| `router.pushUrl()` | `Index.ets` → `DifficultyPage` / `HistoryPage` | 压栈跳转，保留返回栈 |
| `router.replaceUrl()` | `LoginPage` → `Index`；`GamePage` → `ResultPage`；`ResultPage` → `DifficultyPage` / `Index` | 替换当前页，不保留返回栈（登录后不可回退、结算后不可回退） |
| `router.back()` | `GamePage.ets`, `HistoryPage.ets` | 返回上一页 |
| `router.getParams()` | `ResultPage.ets` | 从路由参数获取通关数据 |

### 3. 绘制工具 — Canvas 2D API

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `CanvasRenderingContext2D` | `GamePage.ets`, `IsoRenderer.ts`, `UIOverlay.ts`, `TileSet.ts` | HarmonyOS Canvas 2D 渲染上下文，实现完整的 2.5D 等距游戏画面 |
| `RenderingContextSettings` | `GamePage.ets` | Canvas 抗锯齿等配置 |
| 分层双画布架构 | `GamePage.ets` | 静态画布（staticCtx，地图变化时才重绘）+ 动态画布（ctx，每帧重绘残影/玩家/overlay），实现高性能离屏缓存 |
| 完整 Canvas API | `TileSet.ts`, `IsoRenderer.ts`, `UIOverlay.ts` | `beginPath` / `moveTo` / `lineTo` / `arc` / `closePath` / `fill` / `stroke` / `fillRect` / `strokeRect` / `clearRect` / `fillText` / `measureText` / `save` / `restore` / `globalAlpha` / `fillStyle` / `strokeStyle` / `lineWidth` / `font` / `textAlign` / `textBaseline` |
| `.onReady()` | `GamePage.ets` | Canvas 就绪回调，触发首次渲染 |

### 4. 事件机制

| 特性 | 具体使用 | 说明 |
|------|---------|------|
| `.onClick()` | 所有按钮 | 点击事件处理 |
| `.onTouch()` + `TouchEvent` | `GamePage.ets` | 触摸事件：`TouchType.Down`（记录初始坐标）、`TouchType.Up`（计算偏移，区分滑动/点击）；`changedTouches` / `touches` 获取触点坐标 |
| `.gesture()` + `PanGesture` | `GamePage.ets` | 滑动手势识别，`PanDirection.All` 全方向，`GestureEvent.offsetX/offsetY` 获取滑动偏移 |
| `.onChange()` | `LoginPage.ets`（TextInput）、`MusicPanel.ets`（Slider） | 输入值变化事件 |
| `.onSubmit()` | `LoginPage.ets` | 软键盘回车提交 |
| `.onPageShow()` | `Index.ets` | 页面生命周期 — 每次页面显示时刷新用户信息（从历史页返回后称号变化） |
| `aboutToAppear()` / `aboutToDisappear()` | 所有页面和组件 | 组件生命周期：初始化数据 / 注册监听器；清理资源 / 注销监听器 |

### 5. 数据库 — `@kit.ArkData` relationalStore（SQLite）

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `relationalStore.getRdbStore()` | `DbHelper.ts` | 获取/创建 RDB 存储实例 |
| `relationalStore.StoreConfig` | `DbHelper.ts` | 数据库配置：名称、安全级别 `SecurityLevel.S1` |
| `executeSql()` | `DbHelper.ts` | 执行 DDL（`CREATE TABLE IF NOT EXISTS`、`ALTER TABLE`） |
| `insert()` | `DbHelper.ts` | 插入用户记录 / 游戏记录，通过 `ValuesBucket` 传值 |
| `query()` + `RdbPredicates` | `DbHelper.ts` | 条件查询 + 排序（`equalTo`, `greaterThanOrEqualTo`, `orderByDesc`） |
| `update()` | `DbHelper.ts` | 更新用户的 `last_login` 和 `title_index` |
| `ResultSet` | `DbHelper.ts` | 结果集遍历（`goToFirstRow`, `goToNextRow`, `getLong`, `getString`, `getColumnIndex`） |

建了两张表：
- `users`：id / nickname / is_guest / title_index / created_at / last_login
- `game_records`：id / user_id / steps / tau_via / tau / rating / l1_count / l2_count / mem_count / heat_peak(JSON) / ai_comment / instr_type / played_at

### 6. 持久化存储 — Preferences + PersistentStorage/AppStorage

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `preferences.getPreferences()` | `MusicService.ts` | 音乐设置持久化：音量、用户添加曲目列表（JSON 序列化） |
| `pref.get()` / `pref.put()` / `pref.flush()` | `MusicService.ts` | 读写 + 落盘 |
| `PersistentStorage.persistProp()` | `UserSession.ts` | `currentUserId` 跨应用重启持久化，重启自动恢复登录态 |
| `AppStorage.setOrCreate()` / `AppStorage.get()` | `UserSession.ts` | 全局读写当前用户 ID，跨页面无需传参 |

### 7. 多媒体 — `@kit.MediaKit` AVPlayer

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `media.createAVPlayer()` | `MusicService.ts` | 创建 AVPlayer 实例 |
| AVPlayer 状态机 | `MusicService.ts` | HarmonyOS 特有：`idle → initialized(设源后) → prepared(prepare后) → playing(play后)`；`stateChange` 回调中必须显式调 `prepare()`，否则永远卡在 initialized |
| `player.on('stateChange', ...)` | `MusicService.ts` | 监听状态变化（initialized / prepared / completed / error），自动切下一曲 |
| `player.fdSrc` | `MusicService.ts` | 内置曲目通过 rawfile 文件描述符播放 |
| `player.url` | `MusicService.ts` | 用户自选曲目通过 URI 播放 |
| `player.play()` / `pause()` / `reset()` / `setVolume()` | `MusicService.ts` | 播放控制 |

### 8. 文件系统 — `@kit.CoreFileKit` + `@kit.LocalizationKit`

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `picker.AudioViewPicker` | `MusicPanel.ets` | 系统音频文件选择器，用户自选音乐 |
| `resourceManager.getRawFd()` | `MusicService.ts` | 获取 rawfile 的文件描述符（用于 AVPlayer fdSrc） |
| `resourceManager.getRawFileListSync()` | `MusicService.ts` | 扫描 `resources/rawfile/music/` 目录，自动加载内置曲目 |

### 9. 网络 — `@kit.NetworkKit` HTTP

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `http.createHttp()` | `AIComment.ts` | 创建 HTTP 客户端 |
| `httpRequest.request()` | `AIComment.ts` | POST 请求到 DeepSeek API（OpenAI 兼容格式），带 `Authorization: Bearer` +
请求体 JSON + `connectTimeout` / `readTimeout` |
| `http.HttpResponse` | `AIComment.ts` | 解析响应码和 body |
| `httpRequest.destroy()` | `AIComment.ts` | 释放 HTTP 请求资源 |

### 10. 系统 UI — AlertDialog

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `AlertDialog.show()` | `GamePage.ets` | 系统级弹窗：拾取碎片科普、终点未就绪提示、RAW 数据冒险警告 |

### 11. 其他 ArkTS 内置能力

| 特性 | 具体使用位置 | 说明 |
|------|-------------|------|
| `setInterval()` / `clearInterval()` | `GameEngine.ts` | 游戏主循环定时器（16ms tick） |
| `getContext(this)` | 多个页面 | 组件内获取 AbilityContext（用于 DB 初始化、Preferences 等） |
| `Context` (from `@kit.AbilityKit`) | `DbHelper.ts`, `MusicService.ts` | 能力上下文类型，传入 `initDb()` / `init()` |
| `Date.now()` | 全局 | 时间戳（数据库记录 / RNG 种子 / 时间筛选） |
| `JSON.stringify()` / `JSON.parse()` | `DbHelper.ts`, `MusicService.ts`, `AIComment.ts`, `InstructionGraph.ts` | 复杂数据序列化 |

---

## 二、纯 TypeScript/JavaScript 实现的算法与逻辑

以下逻辑完全不依赖 HarmonyOS 专有 API，是标准的 TS/JS 算法实现：

### 1. 迷宫生成算法（MazeGenerator.ts）
- **迭代版递归回溯算法**（DFS）：从起点 (1,1) 出发，随机选择未访问的距离-2 邻居，凿穿中间墙，直到所有可达 cell 被访问
- **可种子化 PRNG**（mulberry32 变体）：自定义 `Rng` 类，支持固定种子复现地图，避免依赖 `Math.random()`
- **BFS 可达性检测**：数组队列 + 头指针（避免 `shift()` O(n)），返回布尔掩码矩阵
- **BFS 距离图**：计算每个 cell 到起点的最短步数（用于 EXIT 远点选取）
- **Fisher-Yates 洗牌**：多个地方复用（方向随机化、候选随机化）
- **VIA 三级缓存轮转分配**：L1:L2:MEM = 1:2:3 的比例跨层全局递增轮转
- **死锁防护**：GATE 放置时试放 + BFS 校验 pre-GATE 区可达 FLOOR ≥ 1；FRAGMENT 强制 ≥1 落在 pre-GATE 区

### 2. 等距坐标变换（IsoMath.ts）
- 网格 → 屏幕：`screen_x = (col - row) * tileHalfW + originX`，`screen_y = (col + row) * tileHalfH + originY + layer * layerOffset`
- 屏幕 → 网格：逆变换，用于触摸点击命中检测（浮点 col/row，调用方取整）

### 3. 最优路径求解（PathOptimizer.ts）
- **逐层递归 DP**：把"全碎片收集 + 终点"转化为"逐层子问题"（层序被 VIA 锁定规则强制为 L0→L1→L2）
- **全排列枚举**：每层碎片访问顺序的所有排列，枚举最小步数
- **VIA tier 枚举**：每层遍历全部上行 VIA 候选（不同 tier → 不同延迟），递归求下层最優解
- **门锁两阶段 BFS**：入口→首碎片按门锁 BFS，其余按门开 BFS；全门锁不可达时回退门开
- **复杂度**：碎片数 ≤4/层，排列 ≤24；VIA 候选 ≤6/层；三层总共 ≤ 24 × 6³ ≈ 5000 种路径，在一帧内可解

### 4. 游戏主循环状态机（GameEngine.ts）
- **七阶段有限状态机**：`IDLE → MOVING → VIA_WAIT → TRANSITION_OUT → TRANSITION_IN → RESTRUCTURE_WARN → RESTRUCTURE_PULSE`
- **Tick 驱动动画**：`setInterval(16ms)` 逐帧推进，非 IDLE 时持续运行，IDLE 时自动停止 loop（省电）
- **观察者模式**：`TickCallback` / `FragmentPickedCallback` / `ExitHintCallback` / `VictoryCallback` / `HazardCallback` 五种回调，解耦引擎与 UI
- **VIA 三级缓存延迟模型**：L1 延迟 1 周期 × 12 tick ≈ 200ms / L2 延迟 3 × 12 ≈ 600ms / MEM 延迟 6 × 12 ≈ 1200ms
- **散热系统逻辑**：三层独立热量（0–100），底层积热速率 ×2，≥60 减速 / ≥90 强制弹层；散热通道 -30；强制弹层的落点找最近 FLOOR 而非打回起点
- **动态重构逻辑**：每 20 步触发，WARN→PULSE 两阶段动效（红色警告 + 青绿脉冲），仅开墙不关路

### 5. 指令序列解析与语义标注（InstructionGraph.ts）
- **DAG 构建**：遍历指令序列，分类 LOAD/MOV（→操作数碎片）、ALU 指令（→运算门）、STORE（→EXIT，不入池）
- **操作数分类**：按 token 前缀判断 `[` = 地址 / `#` = 立即数 / 其他 = 寄存器
- **JSON 解析容错**：剥离 Markdown 代码围栏（```json ... ```），截取首个 `[` 到末个 `]`，字段缺失兜底
- **地图语义标注**：ProgramPlan 的 operand 池 / ALU 序列通过 MapManager.applyPlan() round-robin 标注到已生成的 FRAGMENT / GATE 瓦片

### 6. AI 结算评语（AIComment.ts）
- **Prompt 构造**：将 CPI、VIA 命中分布、缓存层级选择对比、热量峰值、数据冒险次数等格式化为 CPU 微架构工程师视角 prompt
- **规则降级实现**：无 API key 或网络失败时，按多条件分支生成占位评语（CPI 分段评语 / VIA 分布观察 / 热管理观察 / 绕路观察 / 冒险观察）
- **容错设计**：DeepSeek 调用失败 → 静默降级占位，结算页永不卡死

### 7. 数据库业务逻辑（DbHelper.ts）
- **单例模式**：模块级 `rdbStore` 变量，首次 `initDb()` 创建后全局复用
- **CRUD 完整实现**：用户创建/查找/更新登录时间/更新称号；游戏记录插入/条件查询（评级 + 时间范围）/最佳评级查询
- **称号解锁系统**：评级 S→首席架构师 / A→高级 / B→芯片工程师 / C→初级
- **时间范围筛选**：today（当天 0:00 起）/ week（本周一起）/ month（本月 1 日起），纯 Date 运算
- **数据兼容**：ALTER TABLE 补列容错（旧记录无 instr_type 列兜底）

### 8. 用户会话管理（UserSession.ts）
- **登录态持久化**：`PersistentStorage` + `AppStorage` 双重保障（重启恢复 + 全局可读）
- **游客随机昵称**：`游客#XXXX`（4 位随机数），重名时递归重试
- **称号范围控制**：`selectTitle()` 仅允许在已解锁范围内切换

### 9. 音乐服务（MusicService.ts）
- **单例模式**：模块级 `_instance`，`getMusicService()` 懒初始化
- **观察者模式**：多页面可同时注册 `MusicStateCallback`，状态变化时统一通知
- **AVPlayer 状态机适配**：HarmonyOS 的 idle→initialized→prepared→playing 流转，`stateChange` 回调中自动 `prepare()` + `play()`
- **曲目持久化**：用户添加的曲目 JSON 序列化到 Preferences
- **降级扫描**：`getRawFileListSync` 不可用时硬编码 fallback 列表

### 10. 动态重构算法（Restructurer.ts）
- **候选墙筛选**：仅选择水平或垂直方向两侧均为非 WALL 的内部墙壁
- **安全约束**：只开墙不关路，杜绝堵死玩家的可能
- **Fisher-Yates 随机选 k 个**

### 11. 其他纯 TS 逻辑
- **数据模型与枚举**：`TileType` / `FragmentKind` / `AluOp` / `Difficulty` / `ViaTier` 等
- **难度配置表**：Easy(9 指令/2 碎片 per 层) / Normal(12/3) / Hard(15/4)
- **语义映射层**：游戏术语 ↔ CPU 微架构术语（FRAGMENT=LOAD 操作数 / THERMAL=PIPELINE FLUSH / RESTRUCTURE=BRANCH MISPRED 等）
- **CPI 评级公式**：`cpi = tau / optimalTau`，S≤1.2 / A≤2.0 / B≤4.0 / C
- **科普文本池**：12 条芯片知识，顺序取模循环

---

## 三、架构特点总结

| 维度 | 实现方式 |
|------|---------|
| UI 框架 | ArkUI Stage 模型（@Entry/@Component/@State/@Prop/@Builder） |
| 页面导航 | ArkUI Router（pushUrl / replaceUrl / back / getParams） |
| 渲染 | Canvas 2D API 分层双画布（静态离屏缓存 + 动态每帧刷新） |
| 持久化 | relationalStore(SQLite) + Preferences + PersistentStorage/AppStorage |
| 多媒体 | AVPlayer 状态机 + AudioViewPicker + rawfile 扫描 |
| 网络 | @kit.NetworkKit HTTP → DeepSeek API（OpenAI 兼容） |
| 事件 | TouchEvent + PanGesture + onClick/onChange/onSubmit |
| 游戏逻辑 | 全部用纯 TS 实现：迷宫生成(DFS+BFS)、最优路径(DP+全排列)、状态机、散热系统、指令解析、动态重构 |
| 设计模式 | 单例（MusicService / DbHelper）、观察者（回调解耦）、分层渲染 |
