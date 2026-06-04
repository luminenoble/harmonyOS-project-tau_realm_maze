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

## 核心玩法设定

- **核心隐喻**：玩家 = 一段数据包，在三维堆叠芯片（地图）中穿行，以最低τ值（时延）收集所有信号碎片
- **视角**：2.5D 等距菱形视角（Isometric），用 Canvas 实现坐标变换
- **地图结构**：多层叠加，每层为独立的二维网格；层间通过 VIA 节点竖向穿越
- **VIA 三级缓存模型**：
  - L1-VIA（黄金色，稀少）：延迟 1 步，对应 L1 缓存
  - L2-VIA（银色，中等）：延迟 3 步，对应 L2 缓存
  - MEM-VIA（铜色，普通）：延迟 6 步，对应主存储
  - 踩上 VIA 时显示"时钟周期等待"进度条动效
- **τ 最小化**：总步数 + 各 VIA 延迟累计 = 本局 τ 值；结算页显示 S/A/B/C 评级
- **散热系统**（映射三维堆叠散热瓶颈）：
  - 每层维护独立热量值（0–100），同层每步 +热量
  - 底层（Layer 0，器件层）积热速度 ×2
  - 热量 ≥ 80 触发过热减速；≥ 100 强制降层
  - 地图中散布散热通道节点（THERMAL_VIA），踩踏降热 -30
  - 不触发过热完成关卡可获得"TDP 优化"额外加分
- **动态地图**：每 20 步触发局部通道重构，象征芯片动态路由；重构前红色警告，重构后青绿脉冲
- **解谜元素**：收集"信号碎片"、激活逻辑门、解锁层间 VIA 节点
- **AI 结算评语（方案 A）**：结算时将路径数据格式化为 prompt 传入 AI，生成"芯片工程师视角"的路径评语；演示版使用占位实现，接口预留（`AIComment.ts`）
- **场景交互**：点击交互对象触发芯片知识科普文本，无战斗系统

## 用户系统 & 数据持久化（SQLite）

基于 HarmonyOS `@kit.ArkData` 的 `relationalStore`，本地 SQLite 持久化用户与游戏记录。

- **入口**：`utils/DbHelper.ts`（数据库初始化 + 用户/记录表 CRUD），`utils/UserSession.ts`（登录态 + 当前用户缓存）
- **页面**：`pages/LoginPage.ets`（昵称登录/游客模式），`pages/HistoryPage.ets`（历史记录 + 称号解锁）
- **登录态持久化**：`PersistentStorage.persistProp<number>('currentUserId')`，重启后自动恢复；`EntryAbility.onWindowStageCreate` 据此决定首页（已登录 → `Index`，否则 → `LoginPage`）
- **数据表**：`UserRecord`（id / nickname / isGuest / titleIndex / 时间戳）和 `GameRecord`（id / userId / steps / tauVia / tau / rating）
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
    │   │   ├── Index.ets          # 主菜单页（含称号选择 + 音乐面板）
    │   │   ├── LoginPage.ets      # 登录页（昵称登录 / 游客模式）
    │   │   ├── HistoryPage.ets    # 历史记录页（游戏记录 + 称号解锁）
    │   │   ├── GamePage.ets       # 游戏主页面（Canvas 宿主 + 音乐面板）
    │   │   └── ResultPage.ets     # 通关结算页（含τ评级 & AI评语）
    │   ├── components/
    │   │   └── MusicPanel.ets     # 可复用音乐面板（浮动按钮 + 展开式控制 / 列表）
    │   ├── game/
    │   │   ├── core/
    │   │   │   ├── GameEngine.ts  # 游戏主循环、状态机
    │   │   │   ├── MapManager.ts  # 地图生成、动态重构、THERMAL_VIA 布置
    │   │   │   ├── Player.ts      # 玩家状态、移动逻辑、τ累计
    │   │   │   └── HeatManager.ts # 每层热量维护、过热减速/弹层逻辑
    │   │   ├── render/
    │   │   │   ├── IsoRenderer.ts # 等距坐标变换与绘制
    │   │   │   ├── TileSet.ts     # 瓦片定义（含 L1/L2/MEM-VIA、THERMAL_VIA）
    │   │   │   └── UIOverlay.ts   # HUD（层数、步数、信号碎片数、热量条、τ仪表盘）
    │   │   └── puzzle/
    │   │       ├── GateLogic.ts   # 逻辑门谜题
    │   │       └── ViaUnlock.ts   # VIA 三级解锁 & 延迟模型
    │   └── utils/
    │       ├── MazeGenerator.ts   # 随机迷宫生成（递归回溯算法）
    │       ├── IsoMath.ts         # 等距坐标与屏幕坐标互转工具
    │       ├── AIComment.ts       # AI 结算评语接口（演示版占位，接口预留）
    │       ├── DbHelper.ts        # SQLite 数据库：用户表 / 游戏记录表 CRUD
    │       ├── UserSession.ts     # 登录态持久化 + 当前用户缓存 + 称号管理
    │       └── MusicService.ts    # 音乐服务单例（AVPlayer / 播放列表 / 音量 / 持久化）
    └── resources/
        ├── rawfile/
        │   └── music/             # 内置音乐资源（启动时自动扫描加载）
        └── media/                 # 像素风瓦片图（芯片电路风格）
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

## 地图参数（MVP）

| 参数 | 值 |
|------|----|
| 层数 | 3 层（Layer 0-2） |
| 单层网格 | 13 × 13（逻辑 6×6 cell + 厚墙，对齐递归回溯算法） |
| VIA 节点数/层 | 3-4 个（L1:L2:MEM ≈ 1:2:3） |
| THERMAL_VIA 数/层 | 2-3 个 |
| 动态重构周期 | 每 20 步触发一次 |
| 信号碎片数/层 | 3 个 |
| VIA 延迟（时钟周期） | L1=1 / L2=3 / MEM=6 |
| 过热阈值 | 80（减速）/ 100（强制降层） |
| 底层积热倍率 | ×2 |

## 备选降级方案

若等距渲染在 DevEco Canvas 上遇到性能瓶颈：
- 退化为**分层 2D 俯视图**，层间切换用全屏过渡动画表达
- 视觉上用颜色区分不同层（蓝/绿/橙）

## 参考资料

- HarmonyOS Canvas API 文档
- 韬定律（Tao's Law）相关技术论文
- 等距渲染数学原理：`screen_x = (col - row) * tileHalfW`, `screen_y = (col + row) * tileHalfH + layer * layerOffset`
