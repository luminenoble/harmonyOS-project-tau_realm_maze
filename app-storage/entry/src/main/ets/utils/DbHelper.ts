// 数据库助手：封装 relationalStore 的初始化、建表与 CRUD 操作
// 单例模式，首次调用 init(context) 后即可全局使用

import { relationalStore } from '@kit.ArkData';
import { Context } from '@kit.AbilityKit';

// 数据库配置
const DB_NAME: string = 'TauRealmMaze.db';
const DB_SECURITY: relationalStore.SecurityLevel = relationalStore.SecurityLevel.S1;

// ─── 数据模型 ───

// 用户记录
export interface UserRecord {
  id: number;
  nickname: string;
  isGuest: boolean;
  titleIndex: number;    // 当前选择的称号索引
  createdAt: number;
  lastLogin: number;
}

// 游戏记录
export interface GameRecord {
  id: number;
  userId: number;
  steps: number;
  tauVia: number;
  tau: number;
  rating: string;
  l1Count: number;
  l2Count: number;
  memCount: number;
  heatPeak: number[];
  aiComment: string;
  playedAt: number;
}

// 历史记录查询过滤条件
export interface RecordFilter {
  rating?: string;       // 'S'/'A'/'B'/'C'，不传则不筛选
  timeRange?: string;    // 'today'/'week'/'month'，不传则全部
}

// ─── 称号系统 ───

// 称号列表（索引即 titleIndex）
export const TITLE_LIST: string[] = [
  '见习工程师',
  '初级芯片工程师',
  '芯片工程师',
  '高级芯片工程师',
  '首席芯片架构师'
];

// 评级到可解锁的最高称号索引映射
const RATING_TO_TITLE: Record<string, number> = {
  'C': 1,
  'B': 2,
  'A': 3,
  'S': 4
};

// 根据历史最佳评级计算可解锁的最高称号索引
export function getMaxTitleIndex(bestRating: string): number {
  if (bestRating === '') {
    return 0;
  }
  return RATING_TO_TITLE[bestRating] ?? 0;
}

// ─── 数据库单例 ───

let rdbStore: relationalStore.RdbStore | null = null;

// 初始化数据库（在 EntryAbility 或首个页面调用一次）
export async function initDb(context: Context): Promise<void> {
  if (rdbStore !== null) {
    return;
  }
  const config: relationalStore.StoreConfig = {
    name: DB_NAME,
    securityLevel: DB_SECURITY
  };
  rdbStore = await relationalStore.getRdbStore(context, config);

  // 建 users 表
  await rdbStore.executeSql(
    'CREATE TABLE IF NOT EXISTS users (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'nickname TEXT NOT NULL UNIQUE, ' +
    'is_guest INTEGER DEFAULT 0, ' +
    'title_index INTEGER DEFAULT 0, ' +
    'created_at INTEGER, ' +
    'last_login INTEGER)'
  );

  // 建 game_records 表
  await rdbStore.executeSql(
    'CREATE TABLE IF NOT EXISTS game_records (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'user_id INTEGER NOT NULL, ' +
    'steps INTEGER, ' +
    'tau_via INTEGER, ' +
    'tau INTEGER, ' +
    'rating TEXT, ' +
    'l1_count INTEGER, ' +
    'l2_count INTEGER, ' +
    'mem_count INTEGER, ' +
    'heat_peak TEXT, ' +
    'ai_comment TEXT, ' +
    'played_at INTEGER)'
  );
}

// 获取 store 实例（必须先 initDb）
function getStore(): relationalStore.RdbStore {
  if (rdbStore === null) {
    throw new Error('DbHelper: 数据库未初始化，请先调用 initDb()');
  }
  return rdbStore;
}

// ─── 用户 CRUD ───

// 创建用户，返回用户 ID
export async function createUser(nickname: string, isGuest: boolean): Promise<number> {
  const now: number = Date.now();
  const bucket: relationalStore.ValuesBucket = {
    nickname: nickname,
    is_guest: isGuest ? 1 : 0,
    title_index: 0,
    created_at: now,
    last_login: now
  };
  const rowId: number = await getStore().insert('users', bucket);
  return rowId;
}

// 按昵称查找用户（登录用）
export async function findUserByNickname(nickname: string): Promise<UserRecord | null> {
  const predicates = new relationalStore.RdbPredicates('users');
  predicates.equalTo('nickname', nickname);
  const result = await getStore().query(predicates,
    ['id', 'nickname', 'is_guest', 'title_index', 'created_at', 'last_login']);

  if (!result.goToFirstRow()) {
    result.close();
    return null;
  }
  const user = parseUserRow(result);
  result.close();
  return user;
}

// 按 ID 查找用户
export async function findUserById(id: number): Promise<UserRecord | null> {
  const predicates = new relationalStore.RdbPredicates('users');
  predicates.equalTo('id', id);
  const result = await getStore().query(predicates,
    ['id', 'nickname', 'is_guest', 'title_index', 'created_at', 'last_login']);

  if (!result.goToFirstRow()) {
    result.close();
    return null;
  }
  const user = parseUserRow(result);
  result.close();
  return user;
}

// 更新用户的 last_login 时间
export async function touchUserLogin(userId: number): Promise<void> {
  const predicates = new relationalStore.RdbPredicates('users');
  predicates.equalTo('id', userId);
  const bucket: relationalStore.ValuesBucket = { last_login: Date.now() };
  await getStore().update(bucket, predicates);
}

// 更新用户选择的称号索引
export async function updateUserTitle(userId: number, titleIndex: number): Promise<void> {
  const predicates = new relationalStore.RdbPredicates('users');
  predicates.equalTo('id', userId);
  const bucket: relationalStore.ValuesBucket = { title_index: titleIndex };
  await getStore().update(bucket, predicates);
}

// 从结果集解析一行用户数据
function parseUserRow(rs: relationalStore.ResultSet): UserRecord {
  return {
    id: rs.getLong(rs.getColumnIndex('id')),
    nickname: rs.getString(rs.getColumnIndex('nickname')),
    isGuest: rs.getLong(rs.getColumnIndex('is_guest')) === 1,
    titleIndex: rs.getLong(rs.getColumnIndex('title_index')),
    createdAt: rs.getLong(rs.getColumnIndex('created_at')),
    lastLogin: rs.getLong(rs.getColumnIndex('last_login'))
  };
}

// ─── 游戏记录 CRUD ───

// 插入一条游戏记录
export async function insertGameRecord(
  userId: number, steps: number, tauVia: number, tau: number,
  rating: string, l1: number, l2: number, mem: number,
  heatPeak: number[], aiComment: string
): Promise<number> {
  const bucket: relationalStore.ValuesBucket = {
    user_id: userId,
    steps: steps,
    tau_via: tauVia,
    tau: tau,
    rating: rating,
    l1_count: l1,
    l2_count: l2,
    mem_count: mem,
    heat_peak: JSON.stringify(heatPeak),
    ai_comment: aiComment,
    played_at: Date.now()
  };
  return await getStore().insert('game_records', bucket);
}

// 查询用户的游戏记录（支持筛选 + 按时间倒序）
export async function queryGameRecords(userId: number, filter?: RecordFilter): Promise<GameRecord[]> {
  const predicates = new relationalStore.RdbPredicates('game_records');
  predicates.equalTo('user_id', userId);

  // 评级筛选
  if (filter?.rating !== undefined && filter.rating !== '') {
    predicates.equalTo('rating', filter.rating);
  }

  // 时间范围筛选
  if (filter?.timeRange !== undefined && filter.timeRange !== '') {
    const cutoff: number = getTimeCutoff(filter.timeRange);
    if (cutoff > 0) {
      predicates.greaterThanOrEqualTo('played_at', cutoff);
    }
  }

  // 按通关时间倒序
  predicates.orderByDesc('played_at');

  const result = await getStore().query(predicates,
    ['id', 'user_id', 'steps', 'tau_via', 'tau', 'rating',
      'l1_count', 'l2_count', 'mem_count', 'heat_peak', 'ai_comment', 'played_at']);

  const records: GameRecord[] = [];
  if (result.goToFirstRow()) {
    do {
      records.push(parseRecordRow(result));
    } while (result.goToNextRow());
  }
  result.close();
  return records;
}

// 获取用户历史最佳评级（S > A > B > C）
export async function getBestRating(userId: number): Promise<string> {
  const predicates = new relationalStore.RdbPredicates('game_records');
  predicates.equalTo('user_id', userId);
  const result = await getStore().query(predicates, ['rating']);

  // 评级优先级：S=4, A=3, B=2, C=1
  const priority: Record<string, number> = { 'S': 4, 'A': 3, 'B': 2, 'C': 1 };
  let best: string = '';
  let bestPri: number = 0;

  if (result.goToFirstRow()) {
    do {
      const r: string = result.getString(result.getColumnIndex('rating'));
      const p: number = priority[r] ?? 0;
      if (p > bestPri) {
        bestPri = p;
        best = r;
      }
    } while (result.goToNextRow());
  }
  result.close();
  return best;
}

// 获取用户记录总数
export async function getRecordCount(userId: number): Promise<number> {
  const predicates = new relationalStore.RdbPredicates('game_records');
  predicates.equalTo('user_id', userId);
  const result = await getStore().query(predicates, ['id']);
  const count: number = result.rowCount;
  result.close();
  return count;
}

// 从结果集解析一行游戏记录
function parseRecordRow(rs: relationalStore.ResultSet): GameRecord {
  let heatPeak: number[] = [0, 0, 0];
  try {
    const raw: string = rs.getString(rs.getColumnIndex('heat_peak'));
    heatPeak = JSON.parse(raw) as number[];
  } catch (_e) {
    // JSON 解析失败兜底
  }
  return {
    id: rs.getLong(rs.getColumnIndex('id')),
    userId: rs.getLong(rs.getColumnIndex('user_id')),
    steps: rs.getLong(rs.getColumnIndex('steps')),
    tauVia: rs.getLong(rs.getColumnIndex('tau_via')),
    tau: rs.getLong(rs.getColumnIndex('tau')),
    rating: rs.getString(rs.getColumnIndex('rating')),
    l1Count: rs.getLong(rs.getColumnIndex('l1_count')),
    l2Count: rs.getLong(rs.getColumnIndex('l2_count')),
    memCount: rs.getLong(rs.getColumnIndex('mem_count')),
    heatPeak: heatPeak,
    aiComment: rs.getString(rs.getColumnIndex('ai_comment')),
    playedAt: rs.getLong(rs.getColumnIndex('played_at'))
  };
}

// 时间范围 → 截止时间戳
function getTimeCutoff(range: string): number {
  const now: number = Date.now();
  const d: Date = new Date(now);
  if (range === 'today') {
    // 今天 0:00
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'week') {
    // 本周一 0:00（周日为第 7 天）
    const day: number = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'month') {
    // 本月 1 日 0:00
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return 0;
}
