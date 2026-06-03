# Score Algorithm 专题 · 实施计划

> 分支：`feat/score-algorithm`
> 目标：四项改进 —— ①VIA 交互触发 ②实时最优路径求解 ③DeepSeek 真实评分 ④机器指令世界观重构
> 本文档为开工蓝图，先评审后编码。

---

## 0. 总览与依赖关系

四个改动点不是平行的，存在数据依赖：

```
④ 世界观重构 (CPI 定义)  ←──┐
                            │ 复用 optimalτ
② 最优路径求解 (optimalτ) ──┴──→ ③ DeepSeek 评分 (发送 最优/玩家 路径差值)
                                  ↑
① VIA 交互触发 ─────────────────┘ (路径记录里要标记"主动激活"事件)
```

- **②是地基**：`optimalτ`（理论最小周期）既是 ④ 的 CPI 分母，也是 ③ 发给 AI 的对照基准。
- **①相对独立**，但它把"踩上去即触发"改成"落点 + 主动激活"，因此玩家路径记录需要新增"激活事件"，③ 的 prompt 才能区分"路过 vs 命中缓存"。
- **④主要是语义层/文案层改造 + 评级口径从 τ 阈值改为 CPI 比值**，机制基本不动。

建议落地顺序（也是 commit 拆分建议）：
1. `feat(via): VIA 改为交互触发`（① 独立、风险低、先验证手感）
2. `feat(score): 最优路径求解器 PathOptimizer`（② 核心算法）
3. `refactor(game): 机器指令世界观 + CPI 评级`（④ 语义重构，接 optimalτ）
4. `feat(ai): DeepSeek 真实评语接入`（③ 网络层，key 由用户补）

---

## 1. ① VIA 改为交互触发

### 现状
`GameEngine.onPlayerLanded()` 中，玩家落到 VIA 格立即 `ViaUnlock.canTrigger` → 进 `VIA_WAIT` → 切层。THERMAL_VIA、FRAGMENT 同理"踩即生效"。

### 目标
落到 VIA 格**不自动触发**，仅高亮提示"可激活"；玩家按**激活键**才进入 `VIA_WAIT`。碎片拾取（LOAD 操作数）保持踩即拾取更自然，**仅 VIA 改为交互**（与点④"穿越 VIA = 缓存命中"是显式动作的语义吻合）。逻辑门激活点④也归到"交互"，见下。

### 改动清单
| 文件 | 改动 |
|------|------|
| `game/core/GameEngine.ts` | `onPlayerLanded` 移除 VIA 自动触发分支；新增 `tryInteract(): boolean`，在 IDLE 且玩家当前格为已解锁 VIA 时执行原 VIA_WAIT 逻辑；新增 `get canInteract(): boolean` 供 UI 点亮按钮；新增 `get currentTileType` 暴露落点类型 |
| `pages/GamePage.ets` | D-Pad 中央新增「⏎ 激活 / EXEC」按钮，`onClick → engine.tryInteract()`；`@State canInteract` 随 tick 同步，按钮 disabled/高亮态切换 |
| `game/render/*` | 落点为可激活 VIA 时，给该格加脉冲描边（提示"按激活"），可在 `IsoRenderer` 或 overlay 里画 |

### 要点
- `tryInteract` 必须复用现有 `VIA_WAIT → TRANSITION_OUT` 状态机，避免引入新分支。
- EXIT 也可顺势改为"落点 + 激活 = STORE/WB 写回"，强化"指令主动提交"语义（可选，建议做，文案更顺）。
- 玩家路径记录新增事件类型 `INTERACT_VIA`（携带 tier），供 ③ 使用。

### 风险
- 手感：交互键位置与 D-Pad 冲突 → 放 D-Pad 上方居中，仅落点可交互时才 enabled。
- 旧的"踩 VIA 即走"测试用例/演示流程需同步更新文案。

---

## 2. ② 实时最优路径求解（PathOptimizer）

### 问题建模
求"收集全部碎片并到达 EXIT 的最小总周期 τ"。关键简化——**层序被游戏规则强制**：
- 上行 VIA 锁定，直到**本层 3 碎片全收集**（`ViaUnlock.UP_THRESHOLD=3`）。
- EXIT 在顶层，需**全部 9 碎片**。
- ⇒ 必然 `L0 全清 → 上行 → L1 全清 → 上行 → L2 全清 → EXIT`，无需跨层 TSP。

于是问题降为**逐层小规模子问题**：
> 在第 L 层，从入口格 `entry_L` 出发，访问本层 3 个碎片（顺序自由），最后到达"选定的上行 VIA"（或顶层的 EXIT）。
> 跨层成本 = 上行 VIA 的 tier 延迟；下一层入口 `entry_{L+1}` = 该 VIA 的 `(col,row)`（落点同坐标，见 `GameEngine` 切层逻辑）。

### 算法
对每层枚举：
1. **碎片访问顺序**：3 个碎片 → 3! = 6 种排列（暴力）。
2. **出层 VIA 选择**：本层每个上行 VIA 都试（L1/L2/MEM 权衡——近 MEM 省步但 +6 周期，远 L1 多步但 +1 周期）。
3. 段间距离用 **BFS 最短路**（网格 4 邻接，墙不可走）。

跨层用一个极小 DP / 直接递归：
```
solveLayer(L, entryCell):
  对每个本层 upVia v:
    bestSteps = min over 6 排列 of (entry→f_a→f_b→f_c→v 的 BFS 距离和)
    cost_v = bestSteps + tierDelay(v)
    子结果 = cost_v + solveLayer(L+1, v.cell)   // 顶层则 + (…→EXIT) 距离, 无 via
  返回 min
```
- 顶层无上行 VIA：访问 3 碎片后到 EXIT，加 EXIT 段 BFS 距离。
- 复杂度：3 层 × ~3 VIA × 6 排列 × BFS(13×13≈169) ≈ 数千次格访问，**毫秒级**，可实时重算。

### 门（GATE）的处理
逻辑门 `locked` 直到本层碎片 ≥1。BFS 连通性因此**分两阶段**：
- 阶段 A（0 碎片）：门不可通过，先 BFS 到"第一个可达碎片"。
- 阶段 B（≥1 碎片）：门全开，剩余段 BFS 视门为地板。
- 实现：BFS 接受参数 `gatesOpen: boolean`；排列枚举时，第一段强制用 `gatesOpen=false`，其后用 `true`。MazeGenerator 已保证至少 1 碎片在 pre-gate 区，不会死锁。

### 动态重构与"实时"
- 每 20 步地图局部重构 → 已算的 optimal 失效。
- 策略：**起局算一次 `optimalτ_initial` 作为对照基准**（公平：玩家不知道未来重构，理论最优也按初始地图算）；同时提供 `recompute()` 供调试/HUD 实时显示"当前剩余最优"。
- **最终评分基准用 `optimalτ_initial`**，避免重构让基准漂移导致评分不可复现。

### 改动清单
| 文件 | 改动 |
|------|------|
| `game/core/PathOptimizer.ts` (新建) | `static solve(map, start): OptimalResult`；导出 `optimalTau`、`optimalPath`（cell 序列 + 各层选用的 VIA tier）|
| `game/core/GameEngine.ts` | 构造时调一次 `PathOptimizer.solve` 存 `_optimalTau` / `_optimalPath`；`VictoryStats` 增加 `optimalTau` + `optimalPath` + `playerPath` 字段；移动/激活时记录 `playerPath` 事件流 |
| `utils/IsoMath.ts` 或新 `utils/Bfs.ts` | 复用/抽出 BFS 工具（避免与 Restructurer 重复实现）|

### 输出数据结构（草案）
```typescript
interface PathEvent { col: number; row: number; layer: number; kind: 'MOVE'|'FRAGMENT'|'VIA'; tier?: number; }
interface OptimalResult { optimalTau: number; events: PathEvent[]; viaChoices: number[]; } // viaChoices: 各层选的 tier
```

### 风险
- 假设"层序强制"——若后续放宽 VIA 阈值或允许跨层来回，需升级为 Held-Karp TSP。**当前 MVP 成立**，在代码注释里标注假设。
- 碎片数若改 >3/层，6 排列要换成 Held-Karp（2^n）。注释提示。

---

## 3. ④ 机器指令世界观重构 + CPI 评级

> 机制基本不动，改的是**语义命名 / 文案 / 评级口径**。集中到一处映射表，避免散落硬编码。

### CPI 评级（接 ② 的 optimalτ）
- 重新定义：`CPI = playerτ / optimalτ`（玩家周期 ÷ 理论最小周期，1.0 = 完美）。
- 阈值（点④给定）：
  - S：CPI ≤ 1.2
  - A：CPI ≤ 2.0
  - B：CPI ≤ 4.0
  - C：CPI > 4.0
- `ResultPage.rating()` 改用 CPI（替换现有 τ 绝对阈值 80/120/180）。
- "走线优化 %" 改为 `(1 - (CPI-1)) ` 类口径，或直接展示 `效率 = optimalτ/playerτ × 100%`。

### 语义映射（集中到 `game/data/Semantics.ts` 新建）
| 原概念 | 新语义 | 用处 |
|--------|--------|------|
| 玩家 | 机器指令 `LOAD R1,[addr]` | 标题/开场 |
| 收集碎片 | `LOAD/FETCH` 取操作数 | 拾取 Dialog 标题 |
| 逻辑门 | ALU `AND/OR/XOR` | 门交互文案 |
| L1-VIA | `L1$ HIT`（延迟1） | VIA 进度条/结算 |
| L2-VIA | `L2$ HIT`（延迟3） | 同上 |
| MEM-VIA | `DRAM ACCESS`（延迟6） | 同上 |
| THERMAL_VIA | `PIPELINE FLUSH` | 散热文案 |
| 动态重构 | `BRANCH MISPRED` | 重构警告横幅 |
| 关卡完成 | `STORE / WB` 写回 | 通关/EXIT |
| Layer 0 | **Register File**（最热 ×2）| HUD 层名 |
| Layer 1 | **L1/L2 Cache** | HUD 层名 |
| Layer 2 | **Memory Bus** | HUD 层名 |
| τ | **CPI** / cycles | HUD + 结算 |

### 改动清单
| 文件 | 改动 |
|------|------|
| `game/data/Semantics.ts` (新建) | 层名数组、行为术语、tier→缓存名 的常量表 + helper |
| `pages/GamePage.ets` | HUD "当前层"显示层语义名；τ→CPI/cycles；重构倒计时文案；激活按钮 EXEC |
| `pages/ResultPage.ets` | 评级改 CPI；标题"指令执行报告"；VIA 区改 L1$/L2$/DRAM；新增"理论最优 vs 实际"对比行 |
| `game/render/UIOverlay.ts` | VIA 进度条标题用缓存命中术语；重构横幅 "BRANCH MISPREDICTION" |
| `game/data/ChipFacts.ts` | 科普文案语气可微调对齐指令流水线（可选）|

### 要点
- 仅改展示与评级，**不改 HeatManager/MapManager 机制**，回归风险低。
- Register File ×2 积热已由 `HeatManager` 底层倍率实现，无需改逻辑，仅文案点明"寄存器层晶体管密度最大"。

---

## 4. ③ DeepSeek 真实评分接入

### 现状
`utils/AIComment.ts` 为规则占位，签名 `getAIComment(stats): Promise<string>` 已稳定；`buildAIPrompt` 已有 prompt 模板。`module.json5` **无网络权限**。

### 目标
真实调用 DeepSeek，把**最优路径、玩家路径、缓存选择、CPI 差值**喂给模型，返回"芯片工程师视角"评语。Key 由用户补。

### 改动清单
| 文件 | 改动 |
|------|------|
| `module.json5` | `module.requestPermissions` 增 `ohos.permission.INTERNET` |
| `utils/ApiConfig.ts` (新建) | `export const DEEPSEEK_API_KEY = '';`（用户补）+ endpoint/model 常量；附注释说明从何获取 |
| `utils/AIComment.ts` | `buildAIPrompt` 扩展：纳入 optimalτ / playerτ / CPI / 各层 VIA 选择对比 / 绕路差值；新增内部 `callDeepSeek(prompt): Promise<string>` 用 `@kit.NetworkKit` http；`getAIComment` 改为真实调用，**保留占位实现做 fallback**（无 key 或请求失败时降级）|
| `pages/ResultPage.ets` | `AIPromptStats` 扩展 optimalTau/playerPath 摘要；loading 态文案"正在请求云端指令分析…" |

### DeepSeek 调用要点
- Endpoint：`https://api.deepseek.com/chat/completions`，`model: 'deepseek-chat'`，Header `Authorization: Bearer <key>`、`Content-Type: application/json`。
- Body：`{ model, messages:[{role:'system',...},{role:'user', content: prompt}], temperature, max_tokens, stream:false }`。
- 解析：`resp.result` JSON → `choices[0].message.content`。
- HarmonyOS HTTP：`import { http } from '@kit.NetworkKit';` → `http.createHttp()` → `request(url,{method:POST,header,extraData})` → 用完 `destroy()`。
- 超时与失败：try/catch，失败回退到 `generatePlaceholderComment`，结算页永不卡死。

### Prompt 设计（发送内容）
- 玩家路径摘要：步数、各层 VIA tier 选择（L1$/L2$/DRAM 次数）、热峰、playerτ。
- 理论最优：optimalτ、最优各层应选的 VIA tier。
- 差值：CPI、超出最优多少周期、哪一层绕路最多 / 缓存选择是否次优。
- 要求：≤3 行，芯片工程师 + 流水线/CPI 语气。

### 安全/合规
- Key 不入库、不打印日志；放 `ApiConfig.ts` 并确认 `.gitignore`（或留空让用户本地填，提交保持空串）。
- 结算评语属外发数据：仅发送游戏统计，无用户隐私。

### 风险
- 模拟器/真机网络：DevEco 模拟器需允许出网；真机需 INTERNET 权限生效（已加）。
- 证书/HTTPS：DeepSeek 为标准 HTTPS，HarmonyOS 默认信任，无需额外配置。

---

## 5. 验收清单

- [ ] ① 落 VIA 不自动切层；EXEC 键可激活；非 VIA 格按钮 disabled。
- [ ] ② `PathOptimizer.solve` 起局产出 `optimalτ`，毫秒级；门/层序约束正确。
- [ ] ④ HUD/结算全部改用 Register File / L1$ / CPI 等术语；评级按 CPI 阈值。
- [ ] ③ 补 key 后真实返回评语；无 key 自动降级占位；断网不崩。
- [ ] DevEco Build 通过（WSL 不编译，由开发者侧验证循环）。

## 6. 已确认决策（用户拍板）

1. **碎片保持踩即 LOAD**；仅 VIA + EXIT 改交互触发。✅ 已实现
2. **CPI 分母用起局初始最优**（`GameEngine` 构造时求解一次，不随重构重算），保证可复现。✅ 已实现
3. **DeepSeek key 走 `ApiConfig.ts` 空串本地填**；提交保持空，无 key 自动降级占位。✅ 已实现
4. **"走线优化 %" 替换为"流水线效率 %"**（= 最优 τ / 实际 τ）。✅ 已实现

## 7. 实现记录（commit 序列，分支 feat/score-algorithm）

| commit | 内容 |
|--------|------|
| `docs(score)` | 本计划文档 |
| `feat(via)` | VIA/EXIT 交互触发：tryInteract + EXEC 按钮 + 落点金色描边 |
| `feat(score)` | PathOptimizer 最优路径求解 + GameEngine 接入 + VictoryStats 扩展 |
| `refactor(game)` | Semantics.ts 机器指令世界观 + CPI 评级 + HUD/结算术语 |
| `feat(ai)` | DeepSeek HTTP 接入 + 最优差值 prompt + INTERNET 权限 + ApiConfig |

### 关键正确性校验
- VIA 在相邻层**同坐标配对**（`MazeGenerator.placeVias`：下层上行锁定 / 上层同坐标下行解锁 / 共享 tier）
  → 求解器递归入口 `(via.col, via.row)` 落在下一层可走 VIA 格，层链正确。
- 玩家 τ = stepCount + tauVia，与 optimalτ = BFS步数和 + tier延迟和 口径一致，CPI 可比。

### 待开发者侧验证（WSL 不编译）
- DevEco Build → Make Module，按报错回灌修复。
- 潜在 ArkTS 点：`AIComment.callDeepSeek` 内 http options 的 `header` 内联对象字面量（官方文档写法，正常应通过；若报 `arkts-no-untyped-obj-literals` 再改 typed wrapper）。
- 真机/模拟器需放行出网；填入 `DEEPSEEK_API_KEY` 后验证真实评语，断网验证降级。
