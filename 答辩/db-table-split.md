# 数据库表拆解分析

## 当前现状：2 张表

### `users`
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增主键 |
| nickname | TEXT UNIQUE | 昵称 |
| is_guest | INTEGER | 是否游客（0/1） |
| title_index | INTEGER | 当前称号索引 |
| created_at | INTEGER | 注册时间戳 |
| last_login | INTEGER | 最后登录时间戳 |

### `game_records`
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 关联 users.id |
| steps | INTEGER | 移动步数 |
| tau_via | INTEGER | VIA 延迟累计 |
| tau | INTEGER | 总 τ = steps + tau_via |
| rating | TEXT | 评级 S/A/B/C |
| l1_count | INTEGER | L1 缓存命中次数 |
| l2_count | INTEGER | L2 缓存命中次数 |
| mem_count | INTEGER | DRAM 访问次数 |
| heat_peak | TEXT(JSON) | 各层热量峰值 `[L0, L1, L2]` |
| ai_comment | TEXT | AI 结算评语 |
| instr_type | TEXT | 运算场景（如 "1×2 向量内积"） |
| played_at | INTEGER | 通关时间戳 |

- `heat_peak` 将数组 JSON 序列化为 TEXT 存储，属反范式设计
- `l1/l2/mem` 三个同质列横向展开，相当于把"缓存层级统计"作为嵌入属性

---

## 拆解为 5 张表

按"一个实体一张表 + 一个多值依赖一张表"的原则：

### 1. `users` — 用户身份

```
id        INTEGER PK
nickname  TEXT UNIQUE NOT NULL
is_guest  INTEGER DEFAULT 0
created_at INTEGER
last_login INTEGER
```

**与现有一致**，仅去掉 `title_index`（称号独立）。

---

### 2. `titles` — 称号记录

```
id         INTEGER PK
user_id    INTEGER FK → users.id
title_index INTEGER        -- 0~4，TITLE_LIST 索引
unlocked_at INTEGER        -- 解锁时间戳
```

**拆分理由**：称号与用户是 1:N 关系（用户可解锁多个称号，当前显示哪一个由 max title_index 决定）。现设计 `title_index` 嵌入 users 只存"当前选择"，丢失了"何时解锁"的信息，拆出后可记录解锁历史。同时支持未来扩展（如称号条件不再是纯评级驱动）。

---

### 3. `game_sessions` — 游戏局核心指标

```
id         INTEGER PK
user_id    INTEGER FK → users.id
steps      INTEGER          -- 步数
tau_via    INTEGER          -- VIA 延迟累计
tau        INTEGER          -- 总 τ
rating     TEXT             -- S/A/B/C
played_at  INTEGER          -- 通关时间
```

**拆分理由**：`game_records` 原表有 14 列，其中 `steps / tau_via / tau / rating / played_at` 是每局必有的核心字段，与用户直接关联。其余字段属于"结算分析明细"，拆到子表。

---

### 4. `cache_hits` — 缓存命中明细

```
id          INTEGER PK
session_id  INTEGER FK → game_sessions.id
tier        INTEGER        -- 0=L1 / 1=L2 / 2=MEM
hit_count   INTEGER        -- 该级命中次数
```

**拆分理由**：原 `l1_count / l2_count / mem_count` 三列是同质数据横向展开，违反范式。拆为行存储后：
- 新增缓存层级（如 L3）只需 INSERT 新行，不改表结构
- 查询"某局 L1 命中率"时用 `WHERE tier=0` 聚合，语义更清晰
- 每条记录对应一局中一个缓存层级的统计，1 局 = 3 行

---

### 5. `session_analysis` — 结算分析数据

```
id          INTEGER PK
session_id  INTEGER FK → game_sessions.id
heat_l0     INTEGER        -- Layer 0 热量峰值
heat_l1     INTEGER        -- Layer 1 热量峰值
heat_l2     INTEGER        -- Layer 2 热量峰值
instr_type  TEXT           -- 运算场景
hazards     INTEGER        -- RAW 冒险次数
ai_comment  TEXT           -- AI 评语
```

**拆分理由**：原 `heat_peak` 是 JSON 文本（`[85, 60, 30]`），反范式。拆为三列后可直接用 SQL 聚合（如 `SELECT MAX(heat_l0) FROM session_analysis`），不再依赖应用层 `JSON.parse`。`ai_comment` 体量较大（最长 220 token），与基础统计分离可避免 `SELECT * FROM game_records` 时拖着长文本。

---

## 五表关系 ER 图

```
users (1) ────< (N) titles
  │
  └──< (N) game_sessions (1) ────< (3) cache_hits
                         │
                         └─── (1:1) session_analysis
```

---

## 拆与不拆的权衡

| 方面 | 当前 2 表 | 拆为 5 表 |
|------|----------|----------|
| 查询复杂度 | 单表 `SELECT` + 代码层 `JSON.parse` | 需要 2-3 表 JOIN |
| 写入复杂度 | 1 条 `INSERT` | 1 条到 `game_sessions` + 3 条到 `cache_hits` + 1 条到 `session_analysis`，需事务 |
| 扩展性 | 加缓存层级需 ALTER TABLE | 加缓存层级只需 INSERT 新行 |
| SQL 聚合能力 | `heat_peak` 是 JSON，SQL 无法直接聚合 | 全部原子列，可直接 `AVG` / `MAX` / `GROUP BY` |
| 存储效率 | 1 行 1 局，宽表 | 5 行 1 局（1+3+1），总字节略多（主键+外键开销） |
| 适合场景 | 课程演示、快速原型 | 正式上线、需做数据统计面板 |

**结论**：当前 2 表设计适合课程作业阶段（查询简单、写入一步完成）。拆为 5 表后更符合 3NF，适合扩展统计分析功能（如"近 10 局平均 L1 命中率趋势"），但需要在 `insertGameRecord` 处加事务包装。若答辩中被问到"数据库如何优化"，可据此说明已知晓范式设计，只是 MVP 阶段有意保持简单。
