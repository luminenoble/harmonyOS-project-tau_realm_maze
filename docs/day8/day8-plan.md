> 注：本计划由 Claude Code (Opus 4.7) 生成，作为 Day 8 工作的内部蓝图。
# Day 8 — AI 评语接口预留 & 视觉润色

> 目标：在 ResultPage 接入 "芯片工程师评语" 区，演示版用占位实现 + 接口预留；
> 同时给整局视觉做一次"质感升级"：玩家尾迹 / 层冷暖渐变 / VIA 折叠转场。

## 一、目标拆解

| 子目标 | 输出物 | 验收点 |
|--------|--------|--------|
| AI 评语接口 | `utils/AIComment.ts` | 导出 `getAIComment(stats): Promise<string>`；占位实现根据 stats 拼可读评语 |
| 评语 prompt 模板 | 同上 | `buildAIPrompt(stats): string` 输出 "芯片工程师 + 韬定律视角"的结构化文本 |
| 结算页评语区 | `pages/ResultPage.ets` 增 `aiComment` 状态 | aboutToAppear 异步调 `getAIComment`；loading→正文切换不闪烁 |
| 玩家尾迹 | `Player.trail` + `PlayerRenderer.drawTrail` | 移动后身后 3 格残影，alpha 阶梯衰减；切层清空 |
| 层冷暖渐变 | `TileSet.drawFloor` 接 layer 参数 | Layer 0 暖橙底 / Layer 1 中性 / Layer 2 冷蓝；HUD 标题色不变 |
| VIA 折叠动画 | `UIOverlay.drawShutterFold` + GameEngine 区分转场类型 | VIA 切层用上下 shutter 收缩到中央；强制弹层仍用原 fade |

## 二、设计决策

### 2.1 AIComment 接口分层

```typescript
// 与 GameEngine.VictoryStats 平行，只取 ResultPage 真正需要的字段
export interface AIPromptStats {
  steps: number;
  tauVia: number;
  tau: number;
  l1: number;
  l2: number;
  mem: number;
  heatPeak: number[];
  rating: string;       // S/A/B/C，由 ResultPage 算完传入
}

// 演示版：拼字符串；接口签名稳定，Day 9+ 替换为真实 LLM 调用即可
export async function getAIComment(stats: AIPromptStats): Promise<string>

// 给真实 API 用的 prompt 模板；演示版内部不调用但保留导出，方便后续调试
export function buildAIPrompt(stats: AIPromptStats): string
```

**为什么 async/Promise 而不是同步 string？**
真实接口必然是网络请求（异步）。演示版用 `Promise.resolve(placeholder)` 兼容。
ResultPage 用 `await` 写就能直接切到真实实现，零改动。

### 2.2 占位评语生成策略

不抽随机文本（CLAUDE.md 写的"从 ChipFacts.ts 随机取句"在数据敏感度上太弱，玩家看到与自己路径无关的评语会觉得"AI 在敷衍"）。
改成**规则驱动**的"伪 AI"：根据 stats 命中条件输出对应段落。

判定条件（示例）：

| 条件 | 输出段落 |
|------|---------|
| `mem > l1 + l2` | "你的路径过度依赖 MEM-VIA（X 次），相当于频繁走主存路径，τ 因此偏高。建议在 Layer 1 寻找 L1 通孔。" |
| `l1 >= 2 && tau <= 80` | "L1-VIA 利用充分（X 次），走线接近黄金路径。" |
| `Math.max(...heatPeak) >= 80` | "底层热量峰值 X，已逼近过热阈值。下次记得绕路踩散热通道。" |
| `Math.max(...heatPeak) < 60 && rating === 'S'` | "热管理优秀（峰值仅 X），路径与冷却兼顾。" |
| `steps >= 100` | "走线步数 X，存在显著绕路；可在 Layer 1 寻找横向直达通道。" |
| 默认兜底 | "数据传输完成，τ = X cycles。" |

输出格式：开头一句概览 + 1-2 句具体观察。整体不超过 3 行（结算页空间有限）。

### 2.3 玩家尾迹

`Player.ts` 新增字段：
```typescript
trail: number[][]   // 最近 N 个网格坐标 [[col, row], ...]
```

`startMove()` 末尾：把当前 `fromCol/fromRow` push 到 trail；超过 `TRAIL_LEN`（=3）丢弃最早一个。
切层（含 VIA / 弹层）后清空 trail：在 `GameEngine.advance` 的 TRANSITION_OUT swap 后调 `player.clearTrail()`。

渲染：`PlayerRenderer.drawTrail(ctx, trail, cfg, layer, layerColor)`
- 按队列顺序倒序遍历（最新→最旧），透明度从 0.5 → 0.15 阶梯衰减
- 每格画一个缩小的菱形（半径 0.6×halfW），填色用当前层冷暖色

`IsoRenderer.drawMap` 在 Pass 1（地板）画完后、Pass 2（立体）画之前画 trail，让玩家本体盖在最新 trail 上。

### 2.4 层冷暖渐变

CLAUDE.md：底层（Layer 0，器件层）橙红暖色调；顶层（Layer 2，互联层）冷蓝色调。

实现：`TileSet.drawFloor` 加 `layer` 参数（可选，default 1 = 中性）。
内部 switch：
- `layer === 0`：填 `#2a1410`（深棕红，"器件层" 暖底）；描边 `#a06848`
- `layer === 1`：保持原 `#0c1a36` / `#5a8cd0`（中性蓝，"逻辑层"）
- `layer === 2`：填 `#0a2840`（深青蓝，"互联层" 冷底）；描边 `#7fb5ff`

只改 FLOOR；WALL 顶面（金）保留不变，避免视觉割裂——"器件 / 逻辑 / 互联"的差异通过地板传达，墙体保持统一。

VIA / GATE / FRAGMENT / EXIT 内部依然先调 `drawFloor`，所以会自动跟随层色。

### 2.5 VIA 折叠动画（shutter）

现状：TRANSITION_OUT/IN 都是全屏黑 fade，体验"硬切"。
目标：模拟"芯片层翻页"——上下两条黑色 shutter 从顶/底向中心合拢，覆盖完玩家瞬间，再向外打开。

实现：
1. `UIOverlay.drawShutterFold(ctx, w, h, progress)`：根据 progress 0..1 画上下两条黑色矩形
   - top shutter：高 `h/2 × progress`，从顶部贴下
   - bottom shutter：高 `h/2 × progress`，从底部贴上
   - progress=1 时两条 shutter 完全合拢 = 全黑
2. `GameEngine` 新增字段 `_isViaTransition: boolean`：
   - 进 VIA_WAIT → TRANSITION_OUT 时 `= true`
   - force-pop 进 TRANSITION_OUT 时 `= false`
3. 暴露 getter `isViaTransition` 给渲染层
4. `GamePage.renderMap` 末尾：
   - `isViaTransition && isTransitioning()` → 调 `drawShutterFold`
   - 否则用旧的 `drawFade`

TRANSITION_OUT 用 progress = transitionT，TRANSITION_IN 用 1 - transitionT，自动镜像。

### 2.6 ResultPage 评语区布局

在评级牌正下方加一个卡片：
```
┌─ 芯片工程师评语 ─────────────────┐
│ 你的路径过度依赖 MEM-VIA（3 次） │
│ Layer 0 热量峰值 92，下次留意散热 │
└──────────────────────────────────┘
```

loading 占位："正在分析走线..."（一个旋转的圆点或省略号动画）。
异常兜底：getAIComment 抛错或 timeout → 显示 "评语生成失败，请重试"。
演示版不会真抛错（占位是同步 resolve），但保留 try/catch。

### 2.7 Day 8 不做的事

- 不接真实 LLM API（接口预留，实际 import 由 Day 9/10 决定）
- 不做背景音效（CLAUDE.md 标"可选"，时间预算压在视觉上）
- 不做"层冷暖"渐变到 WALL 顶（金色仍统一）
- 不做尾迹"形变" / "粒子化"特效（菱形 + alpha 阶梯足够）

## 三、文件清单

### 新增
```
app-storage/entry/src/main/ets/utils/AIComment.ts
docs/day8/day8-plan.md
```

### 修改
- `game/core/Player.ts` — `trail` 字段 + `clearTrail()`；`startMove` 末尾 push
- `game/render/PlayerRenderer.ts` — `drawTrail(ctx, trail, cfg, layer, color)`
- `game/render/TileSet.ts` — `drawFloor(ctx, cx, cy, halfW, halfH, layer?)` 加 layer 参数；`drawTile` 透传 layer
- `game/render/IsoRenderer.ts` — `drawMap` 透传 layer 到 drawFloor / drawTile；Pass 1 末尾画 trail
- `game/render/UIOverlay.ts` — 新增 `drawShutterFold(ctx, w, h, progress)`
- `game/core/GameEngine.ts` — `_isViaTransition` 标志 + getter；TRANSITION_OUT swap 后 `player.clearTrail()`
- `pages/GamePage.ets` — 转场分支：`isViaTransition` 走 shutter，否则 fade
- `pages/ResultPage.ets` — 评语卡片 + aboutToAppear async 调 `getAIComment`
- `docs/TODO.md` — Day 8 勾选 + 完成日期

## 四、实施步骤

1. **AIComment.ts**：buildAIPrompt + getAIComment 占位 + AIPromptStats interface
2. **Player.ts**：trail 字段 + clearTrail
3. **PlayerRenderer.ts**：drawTrail
4. **TileSet.ts**：drawFloor 加 layer 参数 → 三套色
5. **IsoRenderer.ts**：drawMap 透传 layer + Pass 1 末尾画 trail
6. **UIOverlay.ts**：drawShutterFold
7. **GameEngine.ts**：_isViaTransition + clearTrail 触发点
8. **GamePage.ets**：转场分派
9. **ResultPage.ets**：评语区 + async aboutToAppear
10. **TODO**：勾选

## 五、验收清单

- [ ] DevEco Build 通过
- [ ] 移动后看到身后 3 格菱形残影，阶梯渐隐
- [ ] Layer 0 地板暖色调，Layer 2 地板冷色调，对比明显
- [ ] 踩 VIA 切层：上下黑色 shutter 收拢 → 切层 → 展开（"折叠"质感）
- [ ] 过热弹层切层：仍是原黑屏 fade（区分于 VIA 主动切层）
- [ ] 通关进 ResultPage：评级牌下出现评语卡片
- [ ] 不同 stats 触发不同评语（多用 MEM vs 多用 L1 → 文本明显不同）
- [ ] 评语首屏有 loading 占位（≤300ms 切到正文）

## 六、风险与回退

| 风险 | 触发条件 | 应对 |
|------|----------|------|
| Promise 在 ArkUI aboutToAppear 中行为未知 | HarmonyOS ArkTS 异步语义边界 | 演示版用 `Promise.resolve` 立即 resolve，避免依赖 setTimeout / setInterval；真实 API 接入时再补 try/catch |
| 层色让 VIA / EXIT 反差不足 | Layer 0 暖底 + EXIT 青绿 ≈ 对比仍够 | 验收时如果某层瓦片识别困难，加描边亮度补偿 |
| Trail 在切层期未清造成"残影粘新层" | TRANSITION_OUT swap 时机错过 | 在 swap 后立刻 clearTrail；GameEngine.stop / 重生本局也 clear |
| Shutter 与重构 WARN 红屏叠加 | 切层瞬间正好 step % 20 === 0 | maybeStartRestructure 已经被 isViaWaiting 阻断；OK |
| AI 评语过长溢出卡片 | 占位文本拼接超长 | 卡片用 `wordBreak` + 限高 80vp + 多余 ellipsis |

## 七、后续衔接

- Day 9 测试期把"AIComment 真实 API"留作 stretch goal：演示用占位，时间够再补
- Day 10 README 演示视频里可以单帧高亮"shutter 折叠"和"评语生成"两个差异点
