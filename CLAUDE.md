# TauRealmMaze - HarmonyOS 课程作业

## 项目背景

本项目以**华为"韬定律"**（Tao's Law）为概念原型：芯片设计从二维平面晶体管布局演进到三维堆叠通信架构。游戏将这一技术跃迁具象化为冒险解谜玩法——玩家在芯片内部穿梭，从平面电路层（2D）逐步解锁纵向堆叠层（3D），最终完成跨维度的信号通路。

## 技术栈

| 层级 | 技术 |
|------|------|
| 开发语言 | ArkTS |
| UI 框架 | ArkUI（Stage 模型） |
| 渲染 | Canvas 2D API（实现伪 3D 等距视角） |
| 运行平台 | HarmonyOS 5.x（手机） |
| 构建工具 | DevEco Studio（Windows，编译打包） |
| AI 辅助 | Claude Code（WSL2 Ubuntu，代码编写/审查） |

## 目录结构（工作区）

```
D:\wsl-share\harmony-game\        ← 工作区根目录（WSL 挂载路径：/mnt/d/wsl-share/harmony-game）
├── CLAUDE.md                     ← 本文件，项目说明
├── TODO.md                       ← 10天开发工作流
└── app-storage\                  ← DevEco Studio 工程根目录
    ├── entry\
    ├── AppScope\
    ├── build-profile.json5
    └── ...
```

## WSL + Claude Code 协作规范

### 分工原则

| 角色 | 工具 | 职责 |
|------|------|------|
| Claude Code（WSL） | `/mnt/d/wsl-share/harmony-game/` | 编写/修改 ArkTS 源码、生成算法文件、读写项目文件 |
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

- **视角**：2.5D 等距菱形视角（Isometric），用 Canvas 实现坐标变换
- **地图结构**：多层叠加，每层为独立的二维网格；层间通过"堆叠通孔"（Via）节点连通
- **动态地图**：每隔固定回合，部分通道会自动重构（类移动迷宫机制），象征芯片动态路由
- **解谜元素**：收集"信号碎片"、激活"逻辑门"开关、解锁层间 Via 节点
- **场景交互**：点击交互对象触发简短说明文本（芯片知识科普），无战斗系统

## 项目架构（DevEco 工程内部）

```
app-storage/entry/
└── src/main/
    ├── ets/
    │   ├── pages/
    │   │   ├── Index.ets          # 主菜单页
    │   │   ├── GamePage.ets       # 游戏主页面（Canvas 宿主）
    │   │   └── ResultPage.ets     # 通关/失败结算页
    │   ├── game/
    │   │   ├── core/
    │   │   │   ├── GameEngine.ts  # 游戏主循环、状态机
    │   │   │   ├── MapManager.ts  # 地图生成、动态重构
    │   │   │   └── Player.ts      # 玩家状态、移动逻辑
    │   │   ├── render/
    │   │   │   ├── IsoRenderer.ts # 等距坐标变换与绘制
    │   │   │   ├── TileSet.ts     # 瓦片定义（地板/墙/Via/道具）
    │   │   │   └── UIOverlay.ts   # HUD（层数、步数、信号碎片数）
    │   │   └── puzzle/
    │   │       ├── GateLogic.ts   # 逻辑门谜题
    │   │       └── ViaUnlock.ts   # 层间跳跃解锁条件
    │   └── utils/
    │       ├── MazeGenerator.ts   # 随机迷宫生成（递归回溯算法）
    │       └── IsoMath.ts         # 等距坐标与屏幕坐标互转工具
    └── resources/
        ├── rawfile/               # 地图数据 JSON
        └── media/                 # 像素风瓦片图（芯片电路风格）
```

## 视觉风格

- **主色调**：深蓝/黑底 + 青绿电路线（模拟 PCB 电路板）
- **瓦片风格**：像素风几何图形，无需复杂美术资源
- **层切换动效**：Canvas 渐变淡入淡出，模拟堆叠层翻转
- **动态地图特效**：通道关闭时闪烁红色警告，新通道开启时青绿脉冲

## 地图参数（MVP）

| 参数 | 值 |
|------|----|
| 层数 | 3 层（Layer 0-2） |
| 单层网格 | 12 × 12 |
| Via 节点数/层 | 2-3 个 |
| 动态重构周期 | 每 20 步触发一次 |
| 信号碎片数/层 | 3 个 |

## 备选降级方案

若等距渲染在 DevEco Canvas 上遇到性能瓶颈：
- 退化为**分层 2D 俯视图**，层间切换用全屏过渡动画表达
- 视觉上用颜色区分不同层（蓝/绿/橙）

## 参考资料

- HarmonyOS Canvas API 文档
- 韬定律（Tao's Law）相关技术论文
- 等距渲染数学原理：`screen_x = (col - row) * tileHalfW`, `screen_y = (col + row) * tileHalfH + layer * layerOffset`
