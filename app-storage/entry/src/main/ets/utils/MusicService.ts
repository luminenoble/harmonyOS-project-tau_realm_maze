// 音乐播放服务：单例模式管理 AVPlayer、播放列表、音量与持久化
// 跨页面共享同一实例，页面切换不中断播放

import { media } from '@kit.MediaKit';
import { preferences } from '@kit.ArkData';
import { Context } from '@kit.AbilityKit';
import { resourceManager } from '@kit.LocalizationKit';

// ─── 数据模型 ───

// 播放列表中的一首曲目
export interface MusicTrack {
  name: string;       // 显示名（去掉扩展名）
  source: string;     // rawfile 路径（内置）或文件 URI（用户添加）
  builtin: boolean;   // 是否内置曲目（内置不可删除）
}

// 播放状态变更回调，供 UI 组件刷新
export type MusicStateCallback = () => void;

// ─── 持久化键名 ───
const PREF_STORE_NAME: string = 'music_settings';
const KEY_VOLUME: string = 'volume';
const KEY_USER_TRACKS: string = 'user_tracks';

// ─── 单例服务 ───

// 模块级单例实例
let _instance: MusicService | null = null;

// 获取 MusicService 单例（首次调用前需 init）
export function getMusicService(): MusicService {
  if (_instance === null) {
    _instance = new MusicService();
  }
  return _instance;
}

export class MusicService {
  // 播放列表
  private _playlist: MusicTrack[] = [];
  // 当前播放索引（-1 表示未选中）
  private _currentIndex: number = -1;
  // 播放状态
  private _isPlaying: boolean = false;
  // 音量 0–100
  private _volume: number = 50;
  // AVPlayer 实例
  private _player: media.AVPlayer | null = null;
  // 是否已完成初始化
  private _inited: boolean = false;
  // 上下文引用（读取 rawfile 和持久化用）
  private _context: Context | null = null;
  // Preferences 实例缓存
  private _pref: preferences.Preferences | null = null;
  // UI 状态变更回调列表（多个页面可同时监听）
  private _listeners: MusicStateCallback[] = [];
  // AVPlayer 是否就绪（prepared 状态后才能 play）
  private _playerReady: boolean = false;

  // ─── 只读属性访问 ───

  get playlist(): MusicTrack[] {
    return this._playlist;
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  get currentTrack(): MusicTrack | null {
    if (this._currentIndex >= 0 && this._currentIndex < this._playlist.length) {
      return this._playlist[this._currentIndex];
    }
    return null;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get volume(): number {
    return this._volume;
  }

  get inited(): boolean {
    return this._inited;
  }

  // ─── 初始化 ───

  // 初始化服务：创建 AVPlayer、加载内置曲目、恢复持久化设置
  async init(context: Context): Promise<void> {
    if (this._inited) {
      return;
    }
    this._context = context;

    // 创建 AVPlayer
    this._player = await media.createAVPlayer();
    this._setupPlayerCallbacks();

    // 加载持久化偏好
    this._pref = await preferences.getPreferences(context, PREF_STORE_NAME);
    const savedVol: preferences.ValueType = await this._pref.get(KEY_VOLUME, 50);
    this._volume = savedVol as number;

    // 扫描 rawfile/music/ 加载内置曲目
    await this._loadBuiltinTracks(context);

    // 恢复用户添加的曲目
    await this._loadUserTracks();

    this._inited = true;
    this._notifyListeners();
  }

  // ─── 监听器管理 ───

  // 注册状态变更回调
  addListener(cb: MusicStateCallback): void {
    this._listeners.push(cb);
  }

  // 移除回调
  removeListener(cb: MusicStateCallback): void {
    const idx: number = this._listeners.indexOf(cb);
    if (idx >= 0) {
      this._listeners.splice(idx, 1);
    }
  }

  // 通知所有监听器
  private _notifyListeners(): void {
    for (const cb of this._listeners) {
      cb();
    }
  }

  // ─── 播放控制 ───

  // 播放当前曲目（若无选中则从第一首开始）
  async play(): Promise<void> {
    if (this._playlist.length === 0) {
      return;
    }
    if (this._currentIndex < 0) {
      this._currentIndex = 0;
    }
    await this._loadAndPlay(this._currentIndex);
  }

  // 暂停
  async pause(): Promise<void> {
    if (this._player !== null && this._isPlaying) {
      await this._player.pause();
      this._isPlaying = false;
      this._notifyListeners();
    }
  }

  // 恢复播放（暂停后继续）
  async resume(): Promise<void> {
    if (this._player !== null && !this._isPlaying && this._playerReady) {
      await this._player.play();
      this._isPlaying = true;
      this._notifyListeners();
    }
  }

  // 切换播放/暂停
  async togglePlay(): Promise<void> {
    if (this._isPlaying) {
      await this.pause();
    } else if (this._playerReady && this._currentIndex >= 0) {
      await this.resume();
    } else {
      await this.play();
    }
  }

  // 下一曲
  async next(): Promise<void> {
    if (this._playlist.length === 0) {
      return;
    }
    const nextIdx: number = (this._currentIndex + 1) % this._playlist.length;
    await this._loadAndPlay(nextIdx);
  }

  // 上一曲
  async prev(): Promise<void> {
    if (this._playlist.length === 0) {
      return;
    }
    const prevIdx: number = (this._currentIndex - 1 + this._playlist.length) % this._playlist.length;
    await this._loadAndPlay(prevIdx);
  }

  // 播放指定索引的曲目
  async playAt(index: number): Promise<void> {
    if (index >= 0 && index < this._playlist.length) {
      await this._loadAndPlay(index);
    }
  }

  // 设置音量（0–100）
  async setVolume(vol: number): Promise<void> {
    this._volume = Math.max(0, Math.min(100, Math.round(vol)));
    if (this._player !== null) {
      // AVPlayer.setVolume 范围 0.0–1.0
      await this._player.setVolume(this._volume / 100);
    }
    // 持久化音量
    if (this._pref !== null) {
      await this._pref.put(KEY_VOLUME, this._volume);
      await this._pref.flush();
    }
    this._notifyListeners();
  }

  // ─── 播放列表管理 ───

  // 添加用户曲目
  async addUserTrack(uri: string, displayName: string): Promise<void> {
    // 去掉扩展名作为显示名
    const name: string = displayName.replace(/\.[^.]+$/, '');
    const track: MusicTrack = { name: name, source: uri, builtin: false };
    this._playlist.push(track);
    await this._saveUserTracks();
    this._notifyListeners();
  }

  // 删除曲目（仅允许删除用户添加的）
  async removeTrack(index: number): Promise<void> {
    if (index < 0 || index >= this._playlist.length) {
      return;
    }
    const track: MusicTrack = this._playlist[index];
    if (track.builtin) {
      return; // 内置曲目不可删除
    }

    // 若删除的是当前播放曲目，先停止
    if (index === this._currentIndex) {
      await this._stopPlayer();
      this._currentIndex = -1;
    } else if (index < this._currentIndex) {
      // 删除的在当前之前，索引前移
      this._currentIndex -= 1;
    }

    this._playlist.splice(index, 1);
    await this._saveUserTracks();
    this._notifyListeners();
  }

  // ─── 内部方法 ───

  // 扫描 rawfile/music/ 下所有文件，作为内置曲目
  private async _loadBuiltinTracks(context: Context): Promise<void> {
    const resMgr: resourceManager.ResourceManager = context.resourceManager;
    try {
      const files: string[] = resMgr.getRawFileListSync('music');
      for (const file of files) {
        // 仅加载音频文件
        if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg') ||
            file.endsWith('.flac') || file.endsWith('.m4a')) {
          const name: string = file.replace(/\.[^.]+$/, '');
          this._playlist.push({
            name: name,
            source: 'music/' + file,
            builtin: true
          });
        }
      }
    } catch (e) {
      // getRawFileList 不可用时降级：硬编码已知文件
      const fallbackFiles: string[] = [
        '05 - Greenpath.mp3',
        '09 - City of Tears.mp3',
        '11 - Crystal Peak.mp3',
        '12 - Fungal Wastes.mp3'
      ];
      for (const file of fallbackFiles) {
        const name: string = file.replace(/\.[^.]+$/, '');
        this._playlist.push({ name: name, source: 'music/' + file, builtin: true });
      }
    }
  }

  // 从 Preferences 恢复用户添加的曲目
  private async _loadUserTracks(): Promise<void> {
    if (this._pref === null) {
      return;
    }
    const raw: preferences.ValueType = await this._pref.get(KEY_USER_TRACKS, '[]');
    try {
      const items: object[] = JSON.parse(raw as string) as object[];
      for (const item of items) {
        const rec: Record<string, string> = item as Record<string, string>;
        this._playlist.push({
          name: rec['name'] ?? '未知曲目',
          source: rec['source'] ?? '',
          builtin: false
        });
      }
    } catch (e) {
      // JSON 解析失败则忽略
    }
  }

  // 持久化用户添加的曲目列表
  private async _saveUserTracks(): Promise<void> {
    if (this._pref === null) {
      return;
    }
    // 仅保存非内置曲目
    const userTracks: object[] = [];
    for (const t of this._playlist) {
      if (!t.builtin) {
        userTracks.push({ name: t.name, source: t.source });
      }
    }
    await this._pref.put(KEY_USER_TRACKS, JSON.stringify(userTracks));
    await this._pref.flush();
  }

  // 加载指定索引曲目到 AVPlayer 并播放
  private async _loadAndPlay(index: number): Promise<void> {
    if (this._player === null || this._context === null) {
      return;
    }
    if (index < 0 || index >= this._playlist.length) {
      return;
    }

    // 先重置播放器
    await this._player.reset();
    this._playerReady = false;
    this._currentIndex = index;

    const track: MusicTrack = this._playlist[index];
    if (track.builtin) {
      // 内置曲目从 rawfile 读取 fd
      const rawFd: resourceManager.RawFileDescriptor =
        await this._context.resourceManager.getRawFd(track.source);
      this._player.fdSrc = {
        fd: rawFd.fd,
        offset: rawFd.offset,
        length: rawFd.length
      };
    } else {
      // 用户添加的曲目使用 URI
      this._player.url = track.source;
    }
    // stateChange 回调中会在 prepared 状态自动 play
    this._notifyListeners();
  }

  // 停止播放器
  private async _stopPlayer(): Promise<void> {
    if (this._player !== null) {
      await this._player.reset();
      this._isPlaying = false;
      this._playerReady = false;
    }
  }

  // 设置 AVPlayer 回调
  private _setupPlayerCallbacks(): void {
    if (this._player === null) {
      return;
    }
    const player: media.AVPlayer = this._player;
    const self = this;

    // 状态机回调
    // HarmonyOS AVPlayer 状态流转：idle → initialized(设源后) → prepared(prepare 后) → playing(play 后)
    // 必须在 initialized 状态显式调 prepare()，否则永远到不了 prepared
    player.on('stateChange', (state: string) => {
      if (state === 'initialized') {
        // 设源完成，触发 prepare 进入下一状态
        player.prepare();
      } else if (state === 'prepared') {
        // 进入 prepared 状态，设置音量并自动播放
        self._playerReady = true;
        player.setVolume(self._volume / 100);
        player.play();
        self._isPlaying = true;
        self._notifyListeners();
      } else if (state === 'completed') {
        // 播放完毕，自动切下一曲
        self._isPlaying = false;
        self._playerReady = false;
        self.next();
      } else if (state === 'error') {
        // 出错时重置状态，尝试下一曲
        self._isPlaying = false;
        self._playerReady = false;
        self._notifyListeners();
      }
    });
  }
}
