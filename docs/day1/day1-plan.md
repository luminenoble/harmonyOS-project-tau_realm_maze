> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 1 工作的内部蓝图。
# Day 1 — 环境搭建 & 等距渲染验证

> 关键里程碑：在 Canvas 上渲染出一块静态 5×5 等距菱形地图，验证技术路线可行。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| 工程结构对齐 CLAUDE.md 约定 | 新增 `game/`、`utils/` 目录骨架 | WSL `ls` 看到目录树 |
| 等距坐标数学库 | `utils/IsoMath.ts` | 网格 ↔ 屏幕坐标互转可调用 |
| Canvas 宿主页面 | `pages/GamePage.ets` | DevEco 编译通过，可路由进入 |
| 静态等距地图渲染 | GamePage 内 5×5 菱形瓦片 | 真机/模拟器看到深蓝底 + 青绿菱形网格 |
| 入口跳转 | 修改 `Index.ets` 增加"进入游戏"按钮 | 主菜单 → GamePage 跳转正常 |
| 路由配置 | `main_pages.json` 注册 GamePage | 编译不报缺失页面 |

## 二、文件清单与职责

### 新增

```
app-storage/entry/src/main/ets/
├── pages/
│   └── GamePage.ets              # Canvas 宿主，负责绘制等距地图
├── game/
│   └── render/
│       └── IsoRenderer.ts        # （Day1 占位/简版）单瓦片菱形绘制函数
└── utils/
    └── IsoMath.ts                # 等距坐标互转工具
```

### 修改

- `pages/Index.ets`：加入"进入芯片世界"按钮，路由跳转到 GamePage
- `resources/base/profile/main_pages.json`：注册 `pages/GamePage`

## 三、核心技术要点

### 3.1 等距坐标公式（IsoMath）

参考 CLAUDE.md：
```
screen_x = (col - row) * tileHalfW + originX
screen_y = (col + row) * tileHalfH + originY + layer * layerOffset
```
反推（屏幕 → 网格）：
```
dx = screen_x - originX
dy = screen_y - originY - layer * layerOffset
col = (dx / tileHalfW + dy / tileHalfH) / 2
row = (dy / tileHalfH - dx / tileHalfW) / 2
```

### 3.2 单瓦片菱形绘制（Canvas 2D）

四个顶点（以瓦片中心 (cx, cy) 计算）：
- top:    (cx, cy - tileHalfH)
- right:  (cx + tileHalfW, cy)
- bottom: (cx, cy + tileHalfH)
- left:   (cx - tileHalfW, cy)

使用 `beginPath / moveTo / lineTo / closePath / fill + stroke` 绘制。

### 3.3 默认参数

| 参数 | 值 | 说明 |
|------|----|----|
| tileHalfW | 32 px | 菱形横向半宽 |
| tileHalfH | 16 px | 菱形纵向半高（2:1 等距比例） |
| layerOffset | -24 px | 层间纵向偏移（Day1 仅 layer=0） |
| originX | canvas.width / 2 | 居中放置 |
| originY | 80 px | 顶部留白 |
| 网格大小 | 5 × 5 | Day1 只验证渲染 |
| 背景色 | `#0a0e1a`（深蓝近黑） | 模拟 PCB 板 |
| 瓦片填充 | `#0d3b3b` | 暗青绿 |
| 瓦片描边 | `#22d3a8` | 高亮青绿（电路线） |

## 四、实施步骤

1. **写 IsoMath.ts**：导出常量 + `gridToScreen` / `screenToGrid` 纯函数。
2. **写 IsoRenderer.ts**：导出 `drawDiamondTile(ctx, cx, cy, halfW, halfH, fill, stroke)`。
3. **写 GamePage.ets**：
   - 使用 `Canvas + CanvasRenderingContext2D`
   - `onReady` 中遍历 5×5 网格调用 `gridToScreen` + `drawDiamondTile`
   - 顶部加一个返回按钮回主菜单
4. **改 Index.ets**：保留 Hello 文案，加一个 Button 触发 `router.pushUrl({ url: 'pages/GamePage' })`。
5. **注册路由**：`main_pages.json` 增加 `"pages/GamePage"`。
6. **交付 DevEco 编译**：等用户在 Windows DevEco Studio 执行 Build。

## 五、验收清单

- [ ] DevEco Build 通过，无 ArkTS 编译错误
- [ ] 启动应用，主菜单显示并可点击"进入游戏"
- [ ] GamePage 显示 5×5 等距菱形网格，居中、无错位
- [ ] 返回按钮可回到主菜单
- [ ] 控制台无 Canvas 相关运行时报错

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| Canvas onReady 时机问题 | 绘制为空白 | 改用 `setTimeout` 延迟首帧 / 在 `onAreaChange` 重绘 |
| ArkTS 不支持某些 TS 语法 | 编译报错 | 移除高级泛型/装饰器，回退到基础语法 |
| 等距比例视觉异常 | 菱形过扁/过尖 | 调整 tileHalfW : tileHalfH = 2:1，必要时改为 64:32 |
| 性能问题（25 瓦片不应有） | 帧率掉到 30 以下 | Day1 不优化，记录到 Day2 评估降级 |

## 七、Day 1 不做的事

- 不引入迷宫生成（Day 2）
- 不画墙体、Via、道具（Day 2/4/5）
- 不接入玩家、输入、动画（Day 3）
- 不做多层渲染（Day 4）
- 不写 GameEngine 主循环（Day 3）
