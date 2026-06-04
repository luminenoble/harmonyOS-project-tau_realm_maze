# TauRealmMaze - HarmonyOS 课程作业

## 项目背景

本项目以**华为"韬定律"**（Tao's Law）为概念原型：芯片设计从二维平面晶体管布局演进到三维堆叠通信架构。游戏将这一技术跃迁具象化为冒险解谜玩法——玩家在芯片内部穿梭，从平面电路层（2D）逐步解锁纵向堆叠层（3D），最终完成跨维度的信号通路。

## 技术栈

| 层级 | 技术 |
|------|------|
| 开发语言 | ArkTS |
| UI 框架 | ArkUI（Stage 模型） |
| 渲染 | Canvas 2D API（实现伪 3D 等距视角） |
| 运行平台 | HarmonyOS 5.x（**平板专用**，Day 5 末切换后不再适配手机） |
| 构建工具 | DevEco Studio（Windows，编译打包） |
| AI 辅助 | Claude Code（WSL2 Ubuntu，代码编写/审查） |

## 目录结构（工作区）

```
D:\wsl-share\harmony-game\        ← 工作区根目录（WSL 挂载路径：/mnt/d/wsl-share/harmony-game）
├── CLAUDE.md                     ← 本文件，项目说明
├── LICENSE                       ← MIT 协议（来自远端 GitHub 仓库）
├── .gitignore                    ← 忽略 oh_modules / build / .preview / local.properties 等
├── docs\                         ← 开发过程文档（按天分目录 + 项目级规范）
│   ├── TODO.md                   ← 10 天开发工作流（每日勾选进度）
│   ├── git-format.md             ← Git 提交信息与分支命名规范（Conventional Commits 风格）
│   ├── day1\
│   │   └── day1-plan.md          ← Day 1 实施蓝图（Claude Code 生成）
│   ├── day2\
│   └── ...                       ← 每日新建 dayN\ 子目录存放当日计划/笔记
└── app-storage\                  ← DevEco Studio 工程根目录
    ├── entry\
    ├── AppScope\
    ├── build-profile.json5
    └── ...
```

### docs/ 目录约定

- `docs/TODO.md`：10 天开发工作流总表，每日完成后勾选并标注日期
- `docs/git-format.md`：Git 提交信息（`<type>(<scope>): <subject>`）与分支命名（`<type>/<desc>`）规范，所有提交/分支命名以此为准
- `docs/dayN/`：每个开发日的工作子目录
  - 开工前 Claude Code 先在 `docs/dayN/dayN-plan.md` 写实施计划（目标拆解、文件清单、技术要点、风险），再开始编码
  - 调研、设计草图、问题排查记录也按天归档到对应子目录
- `docs/<feature>/`：feature 子目录（如 `docs/music/`、`docs/DB/`），存放跨天的专题计划与排查笔记

### 远端仓库

GitHub: `https://github.com/luminenoble/harmonyOS-project-tau_realm_maze.git`（origin/main）

提交信息与分支命名遵循 `docs/git-format.md`。

## WSL + Claude Code 协作规范

### 分工原则

| 角色 | 工具 | 职责 |
|------|------|------|
| Claude Code（WSL） | `/mnt/d/wsl-share/harmony-game/` | 编写/修改 ArkTS 源码、生成算法文件、读写项目文件,英文思考,中文回答 |
| 开发者（Windows） | DevEco Studio | 编译、真机调试、模拟器运行、打包 .hap |

### WSL 访问工程文件

Windows 路径 `D:\wsl-share\harmony-game\app-storage\` 在 WSL 内对应：
```
/mnt/d/wsl-share/harmony-game/app-storage/
```
Claude Code 直接读写此路径下的 `.ets` / `.ts` / `.json5` 文件。

### 编译检测流程

Claude Code **不执行编译**，ArkTS 编译严格依赖 DevEco Studio 的 SDK 工具链，WSL 内无法独立运行。协作流程如下：

```
Claude Code 修改代码
        ↓
你在 DevEco Studio 按 Build → Make Module
        ↓
查看 Build Output 报错信息
        ↓
截图或粘贴错误给 Claude Code 修复
        ↓
循环直到 Build 成功
```

### 代码注释规范

> ⚠️ **项目级约定**：本项目用于课程作业 + 学习展示，需要 AI 生成的代码具备可读性。
> 此规则**覆盖** Claude Code 默认的"无注释"策略。

Claude Code 生成的所有 `.ets` / `.ts` 文件应包含**简单注释**：

- 文件顶部 1-2 行说明该文件职责
- 每个导出的类 / 接口 / 函数前用单行注释说明用途
- 关键算法、坐标公式、魔法数字应有 inline 注释
- 注释保持简洁（中文优先），避免长篇 docstring 和"显而易见"的废话
- 重要 TODO / 后续阶段才会用到的占位逻辑，标注 `// Day N: ...` 提示

示例：
```typescript
// 等距坐标互转：网格 ↔ 屏幕
// screen_x = (col - row) * tileHalfW + originX
export function gridToScreen(col: number, row: number, cfg: IsoConfig): ScreenPoint {
  // ...
}
```

### 语法预检（可选加速）

虽然无法完整编译，WSL 内可用 `npx @typescript-eslint/parser` 做基础 TS 语法检查（ArkTS 是 TS 超集，大多数语法错误可提前发现）：
```bash
# 在 WSL 内安装一次
npm install -g typescript

# 检查单个文件语法（忽略 ArkTS 专有装饰器报错属正常）
tsc --noEmit --allowJs --target ES2017 \
  /mnt/d/wsl-share/harmony-game/app-storage/entry/src/main/ets/game/core/GameEngine.ts
```

## 核心玩法设定（指令序列重构版，见 `docs/redesign/`）

> 重构后玩家身份从"数据包"升级为 **控制信号 / 一条机器指令序列**；详见 `docs/redesign/new-design.md` 与 `redesign-plan.md`。

- **核心隐喻**：玩家 = CPU 控制单元发出的**控制信号**，在三维堆叠芯片中穿行，**执行一段 AI 生成的合法汇编指令序列**（LOAD/MOV 取操作数 → ALU 运算 → STORE 写回）
- **关卡来源（DeepSeek API）**：每局开始按难度向 DeepSeek 请求一段合法汇编序列；解析为操作数池 + ALU 序列后分配到地图。API 不可用时降级为离线"向量内积"预置序列（`DeepSeekService.ts` / `InstructionGraph.ts`）
- **难度**：Easy 9 条 / Normal 12 条 / Hard 15 条指令；难度只改指令数与每层碎片数，层数恒为 3
- **视角**：2.5D 等距菱形视角（Isometric），Canvas 坐标变换
- **碎片 = 操作数**：收集碎片 = 执行一条 LOAD/MOV，操作数入"持有寄存器"列表；三类皮肤——寄存器（蓝）/ 立即数（金）/ 内存地址（橙）
- **ALU 门**：障碍门承载一条运算指令（ADD/MUL/AND/...），需持有操作数才能通过 = 执行该 ALU，通过后生成结果寄存器
- **RAW 数据冒险格**：踩上失效一个持有寄存器（模拟读后写流水线气泡），需重新 LOAD
- **VIA 三级缓存模型**（皮肤更新为 CALL/RET）：L1（金/延迟1）/ L2（银/延迟3）/ MEM（铜/延迟6）；上行=CALL 跨层跳转、下行=RET 返回；踩上显示"时钟周期等待"进度条
- **CPI 评分**：展示 `CPI = (步数 + VIA延迟) / 总指令数`（new-design 第七节）；S/A/B/C **评级**用校准比值 `τ/最优τ`（PathOptimizer 求解，量级与阈值匹配，见 `docs/redesign/redesign-plan.md §4.3`）
- **散热系统**（映射三维堆叠散热瓶颈）：每层独立热量（0–100），**三层独立积热速率 [2, 1.5, 1]**；≥60 减速、≥90 强制降层（落到下层最近 FLOOR，不再打回起点）；散热通道 THERMAL_VIA 踩踏降热 30
- **动态地图**：每 20 步触发局部通道重构（仅开墙不堵路），重构前红色警告、重构后青绿脉冲
- **信息面板**：点击碎片/门/VIA/RAW/散热弹出右侧信息卡；右上角抽屉常驻显示本局指令序列与执行进度
- **AI 结算评语**：结算把指令类型/CPI/缓存选择/RAW 次数喂给 DeepSeek 生成"微架构工程师"点评；无 key/失败时规则占位（`AIComment.ts`）

## 用户系统 & 数据持久化（SQLite）

基于 HarmonyOS `@kit.ArkData` 的 `relationalStore`，本地 SQLite 持久化用户与游戏记录。

- **入口**：`utils/DbHelper.ts`（数据库初始化 + CRUD），`utils/UserSession.ts`（登录态 + 当前用户缓存）
- **页面**：`pages/LoginPage.ets`（昵称登录/游客模式），`pages/HistoryPage.ets`（历史记录 + 称号解锁）
- **登录态持久化**：`PersistentStorage.persistProp<number>('currentUserId')`，重启后自动恢复；`EntryAbility.onWindowStageCreate` 据此决定首页（已登录 → `Index`，否则 → `LoginPage`）
- **数据表（已拆为 5 表，符合 3NF，见 `答辩/db-table-split.md`）**：
  - `users`（id / nickname / is_guest / created_at / last_login）—— 用户身份
  - `titles`（id / user_id FK / title_index / unlocked_at）—— 称号解锁记录（1:N）
  - `game_sessions`（id / user_id FK / steps / tau_via / tau / rating / played_at）—— 每局核心指标
  - `cache_hits`（id / session_id FK / tier / hit_count）—— 缓存命中明细（1 局 3 行，替代原 l1/l2/mem 横向列）
  - `session_analysis`（id / session_id FK / heat_l0/l1/l2 / instr_type / hazards / ai_comment）—— 结算分析（热量峰值拆为原子列、AI 长文本分离）
  - 写入需事务包装（1 条 session + 3 条 cache_hits + 1 条 analysis）；ER：`users 1─N titles`、`users 1─N game_sessions 1─{3 cache_hits, 1 session_analysis}`
- **称号系统**：基于历史最佳评级（S/A/B/C）解锁等级称号，由 `TITLE_LIST` + `getMaxTitleIndex` 控制可选范围
- **DB 初始化**：`EntryAbility.onCreate` 调 `initDb(this.context)` 异步建表，幂等

## 音乐播放系统

基于 `@kit.MediaKit` 的 `AVPlayer` + `@kit.CoreFileKit` 的 `AudioViewPicker`，支持内置曲库 + 用户自选音乐，跨页面共享同一播放实例。

- **入口**：`utils/MusicService.ts`（单例服务，AVPlayer 状态机管理 / 播放列表 / 音量 / Preferences 持久化），`components/MusicPanel.ets`（可复用浮动音乐面板组件）
- **初始化**：`EntryAbility.onCreate` 调 `getMusicService().init(this.context)`，扫描 `resources/rawfile/music/` 作为内置曲目（不可删除），并从 Preferences 恢复用户曲目和音量
- **AVPlayer 状态机**（HarmonyOS 特性）：`idle → initialized (设源后) → prepared (prepare() 后) → playing (play() 后)`；`stateChange` 回调中必须显式调 `prepare()`，否则永远卡在 initialized 不出声
- **持久化**：`@kit.ArkData` 的 `preferences`，保存音量（KEY_VOLUME）与用户添加的曲目（KEY_USER_TRACKS，JSON 序列化）
- **UI 接入**：`Index.ets` 和 `GamePage.ets` 右下角均挂载 `MusicPanel` 组件；切页面时 AVPlayer 实例不销毁，播放连续

## 项目架构（DevEco 工程内部）

```
app-storage/entry/
└── src/main/
    ├── ets/
    │   ├── pages/
    │   │   ├── Index.ets          # 主菜单页（称号选择 + 音乐面板，进入跳难度页）
    │   │   ├── LoginPage.ets      # 登录页（昵称登录 / 游客模式）
    │   │   ├── DifficultyPage.ets # 难度选择页（Easy/Normal/Hard）
    │   │   ├── LoadingPage.ets    # 终端风格加载页（DeepSeek 生成指令序列 + 解析）
    │   │   ├── HistoryPage.ets    # 历史记录页（游戏记录 + 称号解锁）
    │   │   ├── GamePage.ets       # 游戏主页面（双画布分层渲染 + HUD + 组件挂载）
    │   │   └── ResultPage.ets     # 通关结算页（CPI 评级 & AI 评语）
    │   ├── components/
    │   │   ├── MusicPanel.ets        # 可复用音乐面板（浮动按钮 + 展开式控制 / 列表）
    │   │   ├── HoldingBar.ets        # 顶部"持有寄存器"状态条
    │   │   ├── InfoPanel.ets         # 右侧点击信息卡片
    │   │   └── InstructionDrawer.ets # 右侧指令序列抽屉（执行进度高亮）
    │   ├── game/
    │   │   ├── core/
    │   │   │   ├── GameEngine.ts  # 主循环 / 状态机 / 指令执行 / CPI / mapVersion
    │   │   │   ├── MapManager.ts  # 多层地图生成 + ProgramPlan 语义标注
    │   │   │   ├── Player.ts      # 玩家状态、移动补间、持有操作数、残影
    │   │   │   ├── HeatManager.ts # 每层热量（三层速率）、过热减速/弹层
    │   │   │   ├── Restructurer.ts# 动态重构（仅开墙）
    │   │   │   └── PathOptimizer.ts# 理论最优 τ 求解（评级基准）
    │   │   ├── render/
    │   │   │   ├── IsoRenderer.ts # 等距绘制：drawMapStatic（静态层缓存）/ drawDynamicLayer（墙+玩家 painter's）
    │   │   │   ├── TileSet.ts     # 瓦片皮肤（操作数三类 / ALU 门 / VIA CALL-RET / RAW）
    │   │   │   ├── PlayerRenderer.ts# 玩家与残影绘制
    │   │   │   └── UIOverlay.ts   # 转场 / 警告 / VIA 进度条等覆盖层
    │   │   ├── puzzle/
    │   │   │   ├── GateLogic.ts   # ALU 门通过判定（按持有操作数）
    │   │   │   └── ViaUnlock.ts   # VIA 解锁（阈值=本层碎片总数）& 延迟模型
    │   │   ├── data/
    │   │   │   ├── Instruction.ts # 指令/操作数/ALU/难度模型与工具
    │   │   │   ├── Semantics.ts   # 机器指令语义映射 + CPI 评级阈值
    │   │   │   └── ChipFacts.ts   # 芯片科普文案
    │   │   └── types/
    │   │       └── TileType.ts    # 瓦片枚举 + Tile（含指令语义元数据）
    │   └── utils/
    │       ├── MazeGenerator.ts   # 随机迷宫（递归回溯）+ 各类瓦片放置
    │       ├── IsoMath.ts         # 网格 ↔ 屏幕坐标互转
    │       ├── InstructionGraph.ts# 指令 JSON 解析 → ProgramPlan（操作数池 + ALU 序列）
    │       ├── DeepSeekService.ts # DeepSeek 指令序列生成 + 离线 fallback
    │       ├── ProgramStore.ts    # 本局指令程序跨页共享（模块单例）
    │       ├── ApiConfig.ts       # DeepSeek key / endpoint / model
    │       ├── AIComment.ts       # AI 结算评语（DeepSeek + 规则占位降级）
    │       ├── DbHelper.ts        # SQLite：5 表 CRUD（users/titles/sessions/cache_hits/analysis）
    │       ├── UserSession.ts     # 登录态持久化 + 当前用户缓存 + 称号管理
    │       └── MusicService.ts    # 音乐服务单例（AVPlayer / 播放列表 / 音量 / 持久化）
    └── resources/
        ├── rawfile/
        │   └── music/             # 内置音乐资源（启动时自动扫描加载）
        └── media/                 # 应用图标（layered_image：background+foreground）/ startIcon
```

## 视觉风格

- **层色调差异**：底层（Layer 0，器件层）橙红暖色调；中层渐变；顶层（Layer 2，互联层）冷蓝色调
- **主色调**：深蓝/黑底 + 青绿电路线（模拟 PCB 电路板）
- **瓦片风格**：像素风几何图形，无需复杂美术资源
- **VIA 颜色**：L1 黄金色 / L2 银色 / MEM 铜色 / THERMAL 青白冷光
- **玩家尾迹**：移动后身后 3 格残影，颜色随层级冷暖渐变
- **层切换动效**：进入 VIA 时叠加缩放的折叠动画（模拟平面折叠），等待进度条显示时钟周期
- **动态地图特效**：通道关闭时闪烁红色警告，新通道开启时青绿脉冲
- **HUD**：τ 仪表盘（步数 + VIA延迟累计）+ 热量条（蓝→黄→红）

## 地图参数（指令重构版）

| 参数 | 值 |
|------|----|
| 层数 | 3 层（Layer 0-2），不随难度变化 |
| 单层网格 | **19 × 19**（逻辑 9×9 cell + 厚墙） |
| VIA 节点数/层 | 3-4 个（L1:L2:MEM ≈ 1:2:3） |
| THERMAL_VIA 数/层 | 2-3 个 |
| RAW 数据冒险格/层 | 1-2 个 |
| 信号碎片数/层 | 难度化：Easy 2 / Normal 3 / Hard 4 |
| 动态重构周期 | 每 20 步触发一次（仅开墙不堵路） |
| VIA 延迟（时钟周期） | L1=1 / L2=3 / MEM=6 |
| 过热阈值 | **60（减速）/ 90（强制降层）** |
| 三层积热速率/步 | **Layer 0=+2 / 1=+1.5 / 2=+1**（4:3:2 耐久比） |

## 渲染与性能（重点）

- **分层画布缓存**：`GamePage` 用两张同尺寸 Canvas——底层 `staticCtx`（地板 + 特殊瓦片，仅 `GameEngine.mapVersion` / 层号 / 尺寸变化时重画）+ 顶层透明 `ctx`（残影 + 墙 + 玩家 + overlay，每帧重画）。最贵的 19×19 地板与文字标签被缓存，移动时只重画动态层。
- **绘制顺序与遮挡**：静态层只画地板/特殊瓦片；动态层 `drawDynamicLayer` 把**墙块与玩家放进同一数组按 `row+col` 升序 painter's 排序**，玩家加 `+0.001` 偏移 → 走墙后被前方墙遮挡、走墙前覆盖后方墙（正确的等距前后遮挡）。
- **HUD 防抖**：`syncFromEngine` 逐字段"变化才写"`@State`、持有标签按内容指纹比对，避免动画期间每帧重渲整个侧栏。
- **调试**：GamePage 右上 `DBG` 开关输出 `frameMs / dynMs / staticMs×N`（console.info `[perf]` + 面板），区分 Canvas 绘制 vs 调度/重渲 瓶颈。
- 排查记录见 `docs/redesign/perf-and-bugfix.md`。

## 备选降级方案

若等距渲染在 DevEco Canvas 上遇到性能瓶颈：
- 退化为**分层 2D 俯视图**，层间切换用全屏过渡动画表达
- 视觉上用颜色区分不同层（蓝/绿/橙）

## 参考资料

- HarmonyOS Canvas API 文档
- 韬定律（Tao's Law）相关技术论文
- 等距渲染数学原理：`screen_x = (col - row) * tileHalfW`, `screen_y = (col + row) * tileHalfH + layer * layerOffset`
