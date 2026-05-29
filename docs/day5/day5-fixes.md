> 注：由 Claude Code (Opus 4.7) 协助排查与修复。
# Day 5 修复记录

## Fix 1 · GATE 随机位置导致玩家死锁

### 现象
开发者反馈："测试中有些时候被堵死"——进入游戏后，玩家走到逻辑门前，HUD 仍是 `◆ 0/3`，无法通过；探索完所有可达区域后也找不到任何碎片，回退也走不出。

### 根因

递归回溯生成的迷宫是**完美树**：除外圈外墙外，所有 FLOOR cell 通过一棵无环路径树连接到根 (1,1)。这意味着 **除"叶子"外的每个 FLOOR cell 都是 cut vertex**——一旦把它换成不可通行（如 locked GATE），就会把剩余 FLOOR 切成两半。

Day 5 原始 `placeGates` 把 1 个 GATE 随机塞到任一 FLOOR cell 上，没有任何连通性校验。同时 `placeFragments` 也是纯随机抽。两者叠加，存在如下"全死锁"路径：

```
                (1,1) [起点]
                  │
                FLOOR
                  │
                [GATE]   ← 随机落点是 cut vertex
                  ├── FRAGMENT  ─┐
                  ├── FRAGMENT   ├── 全部碎片都被切到 GATE 后侧
                  └── FRAGMENT  ─┘
```

13×13 上约 36 FLOOR，若 GATE 子树含 k 个 cell，"3 碎片全在子树"的概率近似 `C(k,3)/C(35,3)`。
k=15 时已约 7%；玩家观感"有时被堵死"完全可解释。

### 方案 A：BFS 校验 + 强制 pre-GATE 区碎片

1. **调换放置顺序**：`placeVias → placeGates → placeFragments`（原本 GATE 在 FRAGMENT 之后）
2. **placeGates 试放 + 回滚**：每次试放 GATE 后做一次以 (1,1) 为源、把 GATE/WALL 当障碍的 BFS；要求 pre-GATE 区至少 1 个非起点 FLOOR cell；不达标则回退到 FLOOR，换下一个候选
3. **placeFragments 强制约束**：用同一套 BFS 把 FLOOR 候选分为 `preFloor` / `postFloor`；先从 preFloor 抽 1 个作碎片，剩余从合集随机

### 为什么够用

- **GATE 解锁阈值 = 1**：玩家只要拾到任意 1 个 pre 区碎片即可推门
- **门后通了之后整层 FLOOR 联通**：因为迷宫本身是连通树，移除 GATE 障碍后所有 FLOOR 都能到。所以碎片数从 1 涨到 3 也必然可拾完，**上行 VIA（阈值 3）也必然可解锁**
- VIA 锁不需要额外 BFS 校验

### 代码改动

```
utils/MazeGenerator.ts
├── + bfsReachable(layer, sc, sr) → boolean[][]  // 队列 head 指针，避免 shift O(n)
├── + isPassableForBfs(tile) → boolean            // WALL / GATE 拦住
├── + hasReachableFloor(layer, visited)           // placeGates 校验工具
├── + shuffleInPlace(arr, rng)                    // 替代散落各处的 Fisher-Yates
├── ~ placeGates                                  // 改为"试放 + BFS 校验 + 回滚"
└── ~ placeFragments                              // 改为"pre/post 切分 + 强制 1 个 pre"

game/core/MapManager.ts
└── ~ 构造调用顺序：placeVias → placeGates → placeFragments
```

### 验收点

- 连续 20 次重生：每层 GATE 前都至少有 1 个碎片可达；从未出现"撞 GATE 时碎片为 0"
- TS 语法预检（`tsc --noEmit`）无报错
- 不影响 Day 4 已工作的切层逻辑（VIA 配对与锁定均未改）

### 风险与未覆盖场景

- **极端布局**：若整层 FLOOR 只有 1 条无分叉的"长走廊"，所有候选 GATE 都会切断起点 → 全部回滚 → 该层 0 个 GATE。这种地图本身极少见（递归回溯通常产生多个叉路），且无 GATE 不影响通关，可接受
- **多 GATE 场景（perLayer > 1）**：当前校验只考虑"放下当前 GATE 后 pre 区非空"，不保证多 GATE 之间相互不锁死。MVP 只放 1 个，Day 9 提高难度需复审
