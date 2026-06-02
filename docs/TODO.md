# TauRealmMaze - 开发工作流程（8天计划）

> AI 辅助开发，目标：HarmonyOS ArkTS + Canvas 实现 2.5D 等距迷宫解谜游戏
>
> **工程路径**：`D:\wsl-share\harmony-game\app-storage\`（WSL：`/mnt/d/wsl-share/harmony-game/app-storage/`）
> **编译执行**：DevEco Studio（Windows）负责，由用户进行；Claude Code（WSL）负责代码编写

---

## Day 1 — 环境搭建 & 等距渲染验证 ⚡关键里程碑 ✅ 已完成（2026-05-26）

**目标：** 在 Canvas 上渲染出一块静态等距菱形地图，确认技术路线可行。

- [x] DevEco Studio 确认工程已建立于 `app-storage\`，应用名称设为 `TauRealmMaze`，包名建议 `com.taorealmmaze.app`
- [x] 确认 WSL 可访问 `/mnt/d/wsl-share/harmony-game/app-storage/entry/src/main/ets/`（`ls` 验证）
- [x] 新建 `GamePage.ets`，挂载 Canvas 组件
- [x] 实现 `IsoMath.ts`：网格坐标 ↔ 屏幕坐标互转
- [x] 用 Canvas 绘制 5×5 静态等距菱形地图（地板瓦片）
- [x] 验收标准：菱形网格正确显示，无坐标错位
- [x] 附加：`Index.ets` 改造为主菜单 + 路由跳转；`IsoRenderer.ts` 抽出绘制函数；`docs/day1/day1-plan.md` 内部蓝图；git 仓库初始化并合并远端 MIT LICENSE

> **编译检测方式**：Claude Code 写完代码 → 你在 DevEco Studio `Build → Make Module` → 报错截图/粘贴给 Claude Code → 循环修复
>
> ⚠️ 如果渲染效果不理想，Day 2 早上决定是否切换降级方案（分层2D俯视图）

---

## Day 2 — 迷宫生成 & 地图数据结构

**目标：** 实现随机迷宫生成，并在等距视角下正确渲染墙体。

- [x] 实现 `MazeGenerator.ts`（递归回溯算法，输出二维网格通道数组）
- [x] 定义瓦片类型枚举：`FLOOR / WALL / VIA / GATE / FRAGMENT`
- [x] 实现 `TileSet.ts`：各瓦片的 Canvas 绘制方法（几何图形，无需图片资源）
- [x] 将迷宫数据渲染到等距视图，包含墙体遮挡排序（Painter's Algorithm）
- [x] 验收标准：随机迷宫每次不同，墙体前后遮挡关系正确

---

## Day 3 — 玩家移动 & 输入控制 ✅ 已完成（2026-05-27）

**目标：** 玩家可以在地图内移动，碰撞检测正常。

- [x] 实现 `Player.ts`：位置状态、移动方法、动画帧
- [x] 在 Canvas 上绘制玩家角色（简单几何体，如青绿色菱形）
- [x] 实现触摸/滑动输入：上下左右四方向移动（可选：屏幕虚拟方向键）
- [x] 碰撞检测：阻止玩家穿越墙体
- [x] 实现 `GameEngine.ts` 主循环（requestAnimationFrame 模式）
- [x] 验收标准：玩家在迷宫内流畅移动，不穿墙
- [x] 附加：玩家以浮点 visual 坐标参与 painter's 排序，墙脚遮挡正确；`aboutToDisappear` 停 timer 防泄漏；底部虚拟 D-pad 兼容模拟器

---

## Day 4 — 多层地图 & 层间跳跃（Via 节点）⚡关键里程碑 ✅ 已完成（2026-05-27）

**目标：** 实现 3 层地图结构，玩家可通过 Via 节点上下切层。

- [x] 扩展 `MapManager.ts`：管理 3 层独立迷宫网格
- [x] 在每层地图上放置 Via 节点（上行/下行区分）
- [x] 实现层切换逻辑：玩家踩上 Via → 全屏淡入淡出 → 切换到相邻层
- [x] 切层时保持玩家在新层的合法起始位置
- [x] 实现 `UIOverlay.ts`：HUD 显示当前层数（Layer 0/1/2）
- [x] 验收标准：3层地图可互相切换，层数 HUD 正确更新
- [x] 附加：视觉调整（蓝地板 + 黑金墙 + 墙高降到 0.45x）；切层后画面模糊 bug 修复（详见 `docs/day4/day4-fixes.md`）

---

## Day 5 — 解谜元素：信号碎片 & 逻辑门 ✅ 已完成（2026-05-28）

**目标：** 加入核心解谜内容，游戏有了目标和交互。

- [x] 在地图随机位置放置"信号碎片"道具（每层 3 个）
- [x] 玩家走到碎片位置自动拾取，HUD 计数更新
- [x] 实现 `GateLogic.ts`：逻辑门障碍，需集齐指定数量碎片才能通过（阈值 1）
- [x] 实现 `ViaUnlock.ts`：部分 Via 节点默认锁定，满足条件后解锁（上行 VIA 阈值 3）
- [x] 简单文本弹窗（ArkUI AlertDialog）：拾取碎片时显示芯片知识一句话科普
- [x] 验收标准：收集碎片 → 解锁逻辑门 → 通向下一区域，流程完整
- [x] 附加：`ChipFacts.ts` 12 条科普；Tile 增 `locked` 字段；HUD 顶栏+Canvas 角标双源显示「Layer/碎片」
- [x] 修复：GATE 随机位置导致死锁 → BFS 校验 + 强制 1 碎片在 pre-GATE 区（`docs/day5/day5-fixes.md`）
- [x] 平台切换：从手机布局切到**平板专用横屏**（左侧 HUD 栏 + 右下浮动 D-Pad），不再适配手机（`docs/day5/day5-tablet.md`）

---

## Day 6 — 动态地图 & 散热机制 ⚡关键里程碑 ✅ 已完成（2026-05-29）

**目标：** 每 20 步触发地图局部重构；引入散热系统作为核心压力机制（映射三维堆叠散热瓶颈）。

### 动态地图 ✅（2026-05-29）
- [x] 在 `GameEngine.ts` 中实现步数计数器（跨层共享，切层不计步）
- [x] 局部重构算法（`Restructurer.ts`）：每轮开 2 WALL + 试关 2 FLOOR；BFS 校验玩家可达全部 FRAGMENT/VIA 且 pre-GATE 区仍有碎片
- [x] 重构前：红色 sin 脉冲 + 中央"信号重路由中..."文字（~480ms）
- [x] 重构后：opened 青绿 / closed 红高亮叠层，alpha 1→0 渐隐（~480ms）
- [x] 确保重构后玩家所在格不变为墙（候选过滤 + BFS 双保险）
- [x] 附加：HUD 侧栏"下一次重构 N 步"倒计时；MazeGenerator.bfsReachable 提为 public + gatesBlock 参数

### 散热系统（`HeatManager.ts`）✅（2026-05-29）
- [x] 新建 `game/core/HeatManager.ts`：维护每层独立热量值（0–100）
- [x] 玩家在同层每步 +热量（中层 +2，底层 ×2 = +4）
- [x] 踩踏散热通道（`THERMAL_VIA` 瓦片）：当前层热量 -30，瓦片不消耗
- [x] 热量 ≥ 80 触发"过热减速"（Player.setSpeed 0.1 → 0.05，动画时长翻倍）
- [x] 热量 ≥ 100 强制弹出当前层（Layer > 0 时弹到下层 (1,1)，原层清零；Layer 0 仅 cap）
- [x] HUD 新增热量条：ArkUI Progress 组件，蓝→黄→红阶梯色 + 过热文字
- [x] `MapManager` 每层随机放置 2 个 `THERMAL_VIA` 散热节点
- [x] 验收标准：散热条实时响应，过热弹层可复现，底层明显比顶层热
- [x] 附加：`docs/day6/day6-heat.md` 内部蓝图

---

## Day 7 — VIA 分级 & τ评级结算 ⚡关键里程碑 ✅ 已完成（2026-05-30）

**目标：** 实现 VIA 三级延迟模型；完善游戏完整流程并加入 τ 结算评级。

### VIA 三级缓存模型 ✅（2026-05-30）
- [x] 扩展 `ViaUnlock.ts`：VIA 分三类
  - L1-VIA（黄金色，稀少，延迟 1 步）
  - L2-VIA（银色，中等，延迟 3 步）
  - MEM-VIA（铜色，普通，延迟 6 步）
- [x] 踩上 VIA 时显示进度条动画（"时钟周期等待"），延迟结束后切层
- [x] `MapManager` 按比例分配三类 VIA（L1:L2:MEM = 1:2:3，全局 6 槽轮转）
- [x] `TileSet.ts` 更新三种 VIA 的视觉样式（金/银/铜）

### τ 评级结算（`ResultPage.ets`）✅（2026-05-30）
- [x] 通关条件：收集全部碎片 + 到达 Layer 2 终点（`EXIT` 瓦片）
- [x] 结算统计：总步数、VIA 类型分布（L1/L2/MEM 各用次数）、热量峰值、τ 值（总时钟周期 = 步数 + VIA 延迟累计）
- [x] τ 评级：S（≤ 80）/ A（≤ 120）/ B（≤ 180）/ C，界面显示"你的路径相当于走线优化了 X%"
- [x] 页面路由配置：主菜单 → 游戏 → 结算 → 返回主菜单
- [x] 验收标准：完整游戏流程可跑通，τ 值随路径效率变化
- [x] 附加：HUD 侧栏新增"τ 时延累计 / 总碎片"两行；EXIT 远离起点 BFS 选址；`docs/day7/day7-plan.md` 内部蓝图

---

## Day 8 — AI 结算评语接口 & 视觉润色 ✅ 已完成（2026-05-30）

**目标：** 接入 AI 评语接口（演示版占位 + 真实接口预留）；提升整体视感。

### AI 结算评语（方案 A）✅（2026-05-30）
- [x] 新建 `utils/AIComment.ts`：`AIPromptStats` 结构 + `buildAIPrompt` 模板
- [x] `ResultPage.ets` 增加"芯片工程师评语"卡片，aboutToAppear 异步调 `getAIComment` 后填充
- [x] 接口预留：`AIComment.ts` 导出 `getAIComment(stats): Promise<string>`，内部规则驱动占位；注释 `// Day 9: 替换为真实 API 调用`
- [x] 评语示例格式："你的路径过度依赖 MEM-VIA（3 次）……Layer 0 热量峰值 92，下次记得绕路踩散热通道。"

### 视觉润色 ✅（2026-05-30）
- [x] 玩家移动尾迹：身后 3 格短暂残影，颜色随层级冷暖渐变（Layer 0 橙红 → Layer 2 冷蓝）
- [x] τ 仪表盘：HUD 侧栏常驻显示（Day 7 已加，Day 8 同框继承）
- [x] 层视觉差异：底层（器件层）橙红暖色调；顶层（互联层）冷蓝色调（`drawFloor` 加 layer 参数）
- [x] 逻辑折叠动画优化：VIA 切层走 shutter（上下黑条收拢 + 中央青绿折痕）；强制弹层保留原 fade
- [x] 附加：`docs/day7/day7-fixes.md` 散热块单次消耗修复；`docs/day8/day8-plan.md` 内部蓝图
- [ ] （可选）背景氛围音效 / 移动电子音 — 跳过

---

## 关键里程碑总览

| 天数 | 里程碑 | 风险 |
|------|--------|------|
| Day 1 | 等距渲染跑通 | ⚠️ 高（技术验证） |
| Day 4 | 3层地图+Via切换 | 中 |
| Day 6 | 动态地图 + 散热系统稳定 | 中 |
| Day 7 | VIA三级延迟 + τ结算完整流程 | 中 |
| Day 8 | AI评语接口预留 + 视觉润色 | 低 |

## Claude Code 使用规范（WSL 内）

```bash
# Claude Code 启动路径（每次开发前 cd 到此）
cd /mnt/d/wsl-share/harmony-game/app-storage

# 常用文件路径前缀
entry/src/main/ets/pages/       # ArkUI 页面
entry/src/main/ets/game/        # 游戏逻辑
entry/src/main/ets/utils/       # 工具函数
entry/src/main/resources/       # 资源文件
```

Claude Code 只负责读写 `.ets` / `.ts` / `.json5` 文件，**不执行任何编译命令**。编译统一由你在 DevEco Studio（Windows）执行。

## 降级策略

- **等距渲染失败** → Day 2 切换分层2D俯视图，节省2天时间补其他功能
- **动态地图死局** → 简化为仅开启新通道，不封闭已有通道
