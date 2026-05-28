# Day 4 — 调试与修复记录

> 关联：`day4-plan.md`；本文档记录 Day 4 实测发现的两个问题及定位/修复过程。

## 修复 1：视觉拥挤（路 ↔ 墙难分）

### 现象

13×13 迷宫在手机模拟器上瓦片缩到 8–10px，墙高与瓦片半宽 1:1 导致后排路面被前排墙体压住；地板与墙体共用青绿色相，远看融为一体。

### 修复

| 改动点 | 旧值 | 新值 |
|--------|------|------|
| 地板填充 | `#0d3b3b`（暗青绿） | `#0c1a36`（极暗蓝） |
| 地板描边 | `#22d3a8`（青绿） | `#5a8cd0`（亮蓝） |
| 墙体顶面 | `#22d3a8`（青绿） | `#e0b35e`（金） |
| 墙体右面 | `#177a6a` | `#6a4f1e`（暗金） |
| 墙体左面 | `#0f4f48` | `#2a1e0a`（近黑棕） |
| 墙高 | `halfW`（1×） | `halfW * 0.45`（保底 4px） |

冷蓝路 + 暖金墙的色相对立 + 墙高减半，小屏可读性显著提升。

文件：`game/render/TileSet.ts`、`pages/GamePage.ets`

---

## 修复 2：切层后画面"模糊 / 双重曝光"

### 现象

踩 Via 切到下一层后，画面看上去像两层叠加渲染（残影 / 半透明感），但引擎仍接受输入与移动。退出页面再进入可恢复。

### 排查过程

**初步假设：`setInterval` 句柄类型错位 → timer 泄漏 → 多帧并发渲染**

加入诊断日志：每个 engine 实例编号、`startLoop` 打印 `handle / typeof handle / isNumber`、`tickFromLoop` 用闭包捕获 `localId` 检测 GHOST TICK、`stopLoop` 记录 `clearInterval`。

**实测日志关键摘录**：

```
[engine#4] tryMove ACCEPT -1 0 → 9 11
[engine#4] startLoop NEW handle= 42 typeof= number isNumber= true   ← number 类型正常
[engine#4] phase 1 → 2 T= 0        ← MOVING → TRANSITION_OUT
[engine#4] swap layer 0 → 1        ← OUT 完成换层
[engine#4] phase 2 → 3 T= 0        ← 进入 IN
[engine#4] phase 3 → 0 T= 1        ← IN 完成 → IDLE
[engine#4] stopLoop clearInterval id= 42
```

**结论**：
- `setInterval` 返回 number，**没有泄漏**
- 状态机完整走完 MOVING → OUT → swap → IN → IDLE → stopLoop
- 无 GHOST TICK，timer 干净停止
- 之后 `tryMove REJECT wall at 9 12` 证明引擎处于 IDLE 接受输入

排除 timer 泄漏 / 状态机 / 输入路径，**根因聚焦到 Canvas 渲染状态**。

### 根因

`drawFade` 用 `globalAlpha < 1` 在前一帧画过半透明黑层。在 HarmonyOS Canvas 上，`globalAlpha` 的 getter/setter 在 save/restore 边界上不可靠：

```ts
// 旧代码
const prev: number = ctx.globalAlpha;   // 可能返回 undefined / 异常
ctx.globalAlpha = a;
ctx.fillRect(0, 0, w, h);
ctx.globalAlpha = prev;                 // 恢复失败 → alpha 残留 < 1
```

下一帧 `renderMap` 开头的 `ctx.fillRect(BG_COLOR)` 在残留 alpha 下没能完全覆盖前一帧像素，于是前后两帧的内容叠加 → 视觉"模糊 / 双重曝光"。

### 修复

**A. `renderMap` 入口三连防御**

```ts
this.ctx.globalAlpha = 1;             // 强制 alpha 复位
this.ctx.clearRect(0, 0, w, h);       // 像素归零
this.ctx.fillStyle = this.BG_COLOR;
this.ctx.fillRect(0, 0, w, h);        // 铺底色
```

**B. `drawFade` 用 `save/restore` + 显式 reset 双重保险**

```ts
ctx.save();
ctx.globalAlpha = a;
ctx.fillStyle = COLOR_FADE;
ctx.fillRect(0, 0, w, h);
ctx.restore();
ctx.globalAlpha = 1;                  // 防 save/restore 不可靠
```

**C. 移除诊断 log**：已完成定位使命，清出控制台。

文件：`pages/GamePage.ets`、`game/render/UIOverlay.ts`、`game/core/GameEngine.ts`

### 教训 / 沉淀

- HarmonyOS Canvas 的 `globalAlpha` 行为与浏览器有差异，**任何修改 ctx 全局状态的函数都应自带强制复位**，不能仅依赖 `save/restore`
- 每帧入口做"清状态 + 清像素 + 铺底色"三连防御，开销可忽略但能根除一整类残留 bug
- 诊断 log 应按可独立 grep 的前缀组织（`[engine#N]`），定位完成后及时移除
