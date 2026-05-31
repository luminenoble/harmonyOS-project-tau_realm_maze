// 用户会话管理：登录态持久化 + 当前用户信息缓存
// 使用 PersistentStorage 保存 userId，应用重启后自动恢复

import {
  UserRecord, findUserById, findUserByNickname,
  createUser, touchUserLogin, getBestRating,
  getMaxTitleIndex, TITLE_LIST, updateUserTitle
} from './DbHelper';

// PersistentStorage 键名
const KEY_USER_ID: string = 'currentUserId';

// ─── 初始化（在 EntryAbility.onCreate 中调用） ───

// 注册持久化属性；-1 表示未登录
export function initSession(): void {
  PersistentStorage.persistProp<number>(KEY_USER_ID, -1);
}

// ─── 登录 / 登出 ───

// 用昵称登录（已有用户直接登录，不存在则创建）
export async function loginByNickname(nickname: string): Promise<UserRecord> {
  let user: UserRecord | null = await findUserByNickname(nickname);
  if (user === null) {
    const id: number = await createUser(nickname, false);
    user = (await findUserById(id))!;
  } else {
    await touchUserLogin(user.id);
  }
  AppStorage.setOrCreate<number>(KEY_USER_ID, user.id);
  return user;
}

// 游客登录：自动生成随机昵称
export async function loginAsGuest(): Promise<UserRecord> {
  const tag: string = Math.floor(Math.random() * 9000 + 1000).toString();
  const nickname: string = '游客#' + tag;

  // 极小概率重名，循环重试
  let user: UserRecord | null = await findUserByNickname(nickname);
  if (user !== null) {
    return loginAsGuest();
  }

  const id: number = await createUser(nickname, true);
  user = (await findUserById(id))!;
  AppStorage.setOrCreate<number>(KEY_USER_ID, user.id);
  return user;
}

// 登出：清除持久化的 userId
export function logout(): void {
  AppStorage.setOrCreate<number>(KEY_USER_ID, -1);
}

// ─── 状态查询 ───

// 是否已登录
export function isLoggedIn(): boolean {
  const uid: number | undefined = AppStorage.get<number>(KEY_USER_ID);
  return uid !== undefined && uid >= 0;
}

// 获取当前用户 ID（未登录返回 -1）
export function getCurrentUserId(): number {
  return AppStorage.get<number>(KEY_USER_ID) ?? -1;
}

// 获取当前用户完整信息（异步，需查库）
export async function getCurrentUser(): Promise<UserRecord | null> {
  const uid: number = getCurrentUserId();
  if (uid < 0) {
    return null;
  }
  return findUserById(uid);
}

// ─── 称号相关 ───

// 获取用户可选称号列表（基于历史最佳评级）
export async function getUnlockedTitles(userId: number): Promise<string[]> {
  const best: string = await getBestRating(userId);
  const maxIdx: number = getMaxTitleIndex(best);
  return TITLE_LIST.slice(0, maxIdx + 1);
}

// 获取用户当前称号文本
export async function getCurrentTitle(userId: number): Promise<string> {
  const user: UserRecord | null = await findUserById(userId);
  if (user === null) {
    return TITLE_LIST[0];
  }
  // 确保 titleIndex 不超过已解锁范围
  const best: string = await getBestRating(userId);
  const maxIdx: number = getMaxTitleIndex(best);
  const idx: number = Math.min(user.titleIndex, maxIdx);
  return TITLE_LIST[idx];
}

// 切换称号（仅限已解锁范围内）
export async function selectTitle(userId: number, titleIndex: number): Promise<boolean> {
  const best: string = await getBestRating(userId);
  const maxIdx: number = getMaxTitleIndex(best);
  if (titleIndex < 0 || titleIndex > maxIdx) {
    return false;
  }
  await updateUserTitle(userId, titleIndex);
  return true;
}
