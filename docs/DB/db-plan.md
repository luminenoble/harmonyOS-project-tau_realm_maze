# 数据库功能实施计划

## 目标

为 TauRealmMaze 加入本地 SQLite 持久化层，支持用户登录/游客登录、游戏记录存储与查询。

## 技术选型

- `@ohos.data.relationalStore`（HarmonyOS 关系型数据库，底层 SQLite）
- `PersistentStorage` + `AppStorage`（登录态持久化）

## 数据库表设计

### users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 用户 ID |
| nickname | TEXT NOT NULL UNIQUE | 昵称 |
| is_guest | INTEGER DEFAULT 0 | 1=游客 |
| title_index | INTEGER DEFAULT 0 | 当前选择的称号索引 |
| created_at | INTEGER | 创建时间戳 (ms) |
| last_login | INTEGER | 最后登录时间戳 (ms) |

### game_records 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 记录 ID |
| user_id | INTEGER NOT NULL | 关联 users.id |
| steps | INTEGER | 总步数 |
| tau_via | INTEGER | VIA 延迟累计 |
| tau | INTEGER | 总 τ 值 |
| rating | TEXT | S/A/B/C |
| l1_count | INTEGER | L1-VIA 使用次数 |
| l2_count | INTEGER | L2-VIA 使用次数 |
| mem_count | INTEGER | MEM-VIA 使用次数 |
| heat_peak | TEXT | 各层热量峰值 JSON，如 "[45,62,38]" |
| ai_comment | TEXT | AI 评语文本 |
| played_at | INTEGER | 通关时间戳 (ms) |

## 称号系统

根据用户历史最佳评级解锁称号，用户可在已解锁范围内自由选择：

| 索引 | 称号 | 解锁条件 |
|------|------|---------|
| 0 | 见习工程师 | 默认（无记录） |
| 1 | 初级芯片工程师 | 有通关记录（C 级及以上） |
| 2 | 芯片工程师 | 最佳评级 ≥ B |
| 3 | 高级芯片工程师 | 最佳评级 ≥ A |
| 4 | 首席芯片架构师 | 最佳评级 = S |

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `utils/DbHelper.ts` | 数据库单例：建表、CRUD |
| 新增 | `utils/UserSession.ts` | 登录态管理 + 称号计算 |
| 新增 | `pages/LoginPage.ets` | 登录/游客入口 |
| 新增 | `pages/HistoryPage.ets` | 历史记录（评级筛选 + 时间筛选） |
| 修改 | `pages/Index.ets` | 主菜单显示用户信息 + 历史入口 |
| 修改 | `pages/ResultPage.ets` | 通关自动存记录 |
| 修改 | `entryability/EntryAbility.ets` | PersistentStorage 初始化 |
| 修改 | `resources/base/profile/main_pages.json` | 注册新页面路由 |

## 用户流程

```
应用启动 → EntryAbility 初始化 PersistentStorage
  ├─ 有登录态 (currentUserId ≥ 0) → Index
  └─ 无登录态 → LoginPage
       ├─ 输入昵称 + 确认 → 创建/查找用户 → Index
       └─ 游客登录 → 自动生成 "游客#xxxx" → Index

Index 主菜单
  ├─ 显示昵称 + 当前称号
  ├─ "进入芯片世界" → GamePage → ResultPage（自动存记录）→ 可跳转 HistoryPage
  ├─ "历史记录" → HistoryPage（评级/时间筛选）
  └─ "切换用户" → LoginPage

HistoryPage
  ├─ 筛选栏：评级（全部/S/A/B/C）+ 时间（全部/今天/本周/本月）
  └─ 记录列表：τ、评级、VIA 分布、AI 评语摘要、通关时间
```
