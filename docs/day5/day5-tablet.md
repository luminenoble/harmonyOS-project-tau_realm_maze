> 注：由 Claude Code (Opus 4.7) 执行的 Day 5 末平台切换记录。
# Day 5 · 平板专用布局切换

## 背景与决定

Day 1-5 一直按手机竖屏布局开发：HUD 顶栏 + Canvas 中段 + 虚拟方向键底栏，纵向 Column 堆叠。Day 5 末由开发者决定**切换到平板专用排版，不再适配手机**。

理由：
- 平板大屏让 13×13 等距迷宫的视觉表达更舒展；菱形 tile 不再受手机宽度压扁
- 横屏布局可把信息（层数 / 碎片数）固化在左侧侧栏，玩家视线不需要频繁上下移动
- 右下浮动 D-Pad 落在拇指自然弧线上，握持平板时单手即可操控
- 平板用户基本是横屏使用，不存在"竖屏体验"需求

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 设备声明 | `module.json5` deviceTypes | DevEco 构建产物仅含 tablet 包 |
| 横屏布局 | `GamePage.ets` Row 根 | 左侧 240vp 信息栏 + 右侧游戏区 |
| 浮动操控 | Stack + `DPad` Builder | D-Pad 浮于 Canvas 右下，不再占独立行 |
| Canvas 视觉 | `halfW` 上限 | 上限从 28 → 40 vp，平板上菱形不再"看着像缩略图" |
| 文档同步 | CLAUDE.md / TODO / 本文 | 平台标签更新；后续开发不再按手机假设 |

## 二、设计决策

### 2.1 根布局

```
┌─────────────┬──────────────────────────────────┐
│  ← 返回     │                                  │
│             │                                  │
│ TauRealmMaze│                                  │
│ 韬略·芯片迷宫│           Canvas                 │
│             │         (整张游戏区)             │
│ 当前层      │                                  │
│ Layer X/2   │                                  │
│             │                       ↑          │
│ 信号碎片    │                     ← ↓ →        │
│ ◆ X/Y       │                  (浮动 D-Pad)    │
│             │                                  │
│ ↻ 重生本局  │                                  │
└─────────────┴──────────────────────────────────┘
   240 vp                  layoutWeight(1)
```

- **Row 根**：`width('100%').height('100%')`
- **左侧 Sidebar**：固定 240vp 宽，深底色 `#0d1424`（略亮于主背景 `#0a0e1a`，形成"控制台"分隔感）
- **右侧 Stack**：`layoutWeight(1)`，`alignContent: BottomEnd`，Canvas 全屏铺底 + D-Pad 浮层

### 2.2 Sidebar 内容编排（自上而下）

1. `← 返回` 按钮（顶部 40vp）
2. 留空 36vp
3. 标题 `TauRealmMaze` + 副标题 `韬略 · 芯片迷宫`
4. 留空 32vp
5. 标签 `当前层` + 大字 `Layer X / 2`
6. 留空 24vp
7. 标签 `信号碎片` + 大字 `◆ X / Y`（黄色 `#ffd166`，与碎片色一致）
8. `Blank()` 撑开
9. 底部 `↻ 重生本局` 按钮（40vp）

文字层级用 12 vp 灰色（标签）+ 20 vp 青绿（数值）。

### 2.3 D-Pad 浮动设计

- 用 ArkUI `@Builder` 抽出 `DPad()`
- `Column` 内两个 Row：上方"↑"、下方"← ↓ →"
- 按钮尺寸 56 × 48 vp，半透明背景 `#1a2238dd`（4 位 hex 末尾 `dd` 即 alpha ≈ 87%），透出 Canvas 远景
- 父级 `margin({ right: 40, bottom: 40 })`，离屏边留呼吸空间

滑动手势仍挂在右侧 Stack 上（PanGesture），D-Pad 与滑动并存：D-Pad 适合精细操作，滑动适合快速横扫。

### 2.4 Canvas 内 HUD 撤除

平板布局把层数与碎片计数全部移到左侧 Sidebar。Canvas 内不再叠加 `drawLayerLabel` / `drawFragmentBadge`，避免与 D-Pad 浮层在右下重叠。两个函数留在 `UIOverlay.ts` 不删除，便于未来调试或 Canvas 截图时复用。

### 2.5 halfW 上限放宽

手机布局曾把 `halfW` 限制在 28 vp 以避免迷宫超出 360-420 vp 的窄屏宽度。平板游戏区净宽 ≈ 760-1000 vp，按 `(w-40)/26` 计算 maxHalfW 落在 28-38 区间，上限 28 会把上限钉死、菱形整体偏小。

新上限 40 vp：
- 760 vp 屏：halfW = 27（受 maxHalfW 约束）
- 960 vp 屏：halfW = 35
- 1240 vp 屏：halfW = 40（上限触发）

下限保持 8 vp 以容忍极小窗口（虽然平板不该出现）。

## 三、文件清单

### 修改

- `app-storage/entry/src/main/module.json5` — deviceTypes `["phone"]` → `["tablet"]`
- `app-storage/entry/src/ohosTest/module.json5` — 同上
- `app-storage/entry/src/main/ets/pages/GamePage.ets` — 整体重写 build()；新增 `@Builder Sidebar() / DPad()`；renderMap 撤除 Canvas HUD 叠加；halfW 上限 28 → 40
- `CLAUDE.md` — 技术栈表"运行平台"行注明平板专用
- `docs/TODO.md` — Day 5 末尾追加"平台切换"标注

### 新增

- `docs/day5/day5-tablet.md` — 本文

### 不动

- `Index.ets` — 主菜单 Column 居中布局对横屏纵屏都自适应，无需改
- `UIOverlay.ts` — `drawLayerLabel` / `drawFragmentBadge` 保留为可复用工具，新页面用 ArkUI Text 显示同样信息
- `IsoRenderer.ts` / `TileSet.ts` / `GameEngine.ts` 等核心渲染 / 逻辑层 — 与设备形态无关

## 四、验收清单

- [ ] DevEco Build 通过；构建产物 deviceType = tablet
- [ ] 平板（或平板模拟器）启动：横屏显示，左侧栏 240 vp 宽
- [ ] HUD 数值（Layer / ◆）拾取碎片或切层后即时刷新
- [ ] Canvas 区菱形迷宫显著放大；不再有"中心一小块、四周大量空白"的观感
- [ ] D-Pad 触屏可点；同时滑动手势仍生效
- [ ] AlertDialog 弹科普显示位置正常（系统级居中弹窗）
- [ ] 在手机模拟器尝试安装：deviceType 不匹配会被 DevEco 提示拒绝（符合预期）

## 五、不做的事

- 不做手机布局回退（项目决议：彻底切到平板）
- 不锁定屏幕方向：当前依赖平板默认横屏；如果平板用户竖握，Row 布局仍能工作但视觉拥挤（可接受）
- 不做大屏栅格响应式（如 8寸 / 11寸 / 12寸 各自布局）— Sidebar 固定 240vp + 右侧 layoutWeight(1) 已经足够弹性
- 不做暗黑 / 明亮模式 — 项目主题就是深色 PCB 风
