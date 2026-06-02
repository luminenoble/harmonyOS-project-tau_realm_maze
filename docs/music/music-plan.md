# Day 9 实施计划：音乐播放系统

## 目标

为 TauRealmMaze 添加完整的背景音乐播放功能，支持内置曲库 + 用户自选音乐，覆盖主菜单页和游戏页。

---

## 功能需求拆解

### 1. 内置音乐自动加载
- 将 `tmp/` 下的 mp3 文件部署到 `resources/rawfile/music/`
- 应用启动时通过 `resourceManager.getRawFileList('music')` 扫描目录
- 自动填充为内置播放列表（不可删除，标记为 builtin）

### 2. 用户自选音乐
- 通过 HarmonyOS `AudioViewPicker` 打开系统文件管理器
- 选中的音频文件 URI 加入播放列表
- 用户添加的曲目可以从列表删除

### 3. 播放控制
- 播放 / 暂停
- 上一曲 / 下一曲（列表循环）
- 音量滑块（0–100）
- 曲目播放完毕自动切下一曲

### 4. 状态持久化
- 使用 `@kit.ArkData` 的 `preferences` API 保存：
  - 用户添加的曲目列表（URI + 显示名）
  - 音量值
- 跨页面保持播放状态（单例 AVPlayer 不随页面销毁）

### 5. UI 交互
- 右下角浮动音乐按钮（♪ 图标），点击展开/收起面板
- 面板内容：
  - 当前播放曲名
  - ◀ 播放/暂停 ▶ 控制条
  - 音量滑块
  - 播放列表（滚动）：内置标 ★、用户曲目可 ✕ 删除
  - 「+ 添加音乐」按钮（调起文件选择器）
- 主菜单页（Index.ets）和游戏页（GamePage.ets）均接入

---

## 新增文件清单

| 文件 | 职责 |
|------|------|
| `ets/utils/MusicService.ts` | 音乐服务单例：AVPlayer 管理、播放列表、音量、持久化 |
| `ets/components/MusicPanel.ets` | 可复用音乐面板组件（浮动按钮 + 展开面板 UI） |
| `resources/rawfile/music/*.mp3` | 内置音乐资源（从 tmp/ 复制） |

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `ets/pages/Index.ets` | Stack 最外层接入 MusicPanel |
| `ets/pages/GamePage.ets` | 右侧 Stack 内接入 MusicPanel |
| `ets/entryability/EntryAbility.ets` | onCreate 中初始化 MusicService |

---

## 技术要点

### AVPlayer 生命周期
```
createAVPlayer → fdSrc/url 赋值 → prepared(自动) → play()
                                                    ↕
                                                 pause()
播放结束 → 'completed' 回调 → 切下一曲
```

### rawfile 音乐读取
```typescript
// 获取 rawfile 目录列表
const files: string[] = resourceManager.getRawFileListSync('music');
// 获取单个文件的 fd
const rawFd = await resourceManager.getRawFd('music/' + filename);
avPlayer.fdSrc = { fd: rawFd.fd, offset: rawFd.offset, length: rawFd.length };
```

### 用户文件选取
```typescript
import { picker } from '@kit.CoreFileKit';
const audioPicker = new picker.AudioViewPicker();
const result = await audioPicker.select();
// result[0] 为选中文件 URI
```

### 跨页面播放不中断
MusicService 为模块级单例，AVPlayer 实例在进程生命周期内持续存在。
页面切换时 MusicPanel 组件重新挂载，`aboutToAppear` 中从 MusicService 同步当前状态即可。

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| `getRawFileList` 在某些 API 版本不可用 | 降级为硬编码内置文件名列表 |
| `AudioViewPicker` 返回临时 URI 重启失效 | 将文件复制到应用沙箱目录持久化 |
| AVPlayer 状态机异常（多次 play/pause 竞争） | 严格按状态机转换，加 isReady 守卫 |
| 游戏页 Canvas 手势与面板点击冲突 | 面板使用高 zIndex + 独立点击区域 |

---

## UI 视觉规格

- 浮动按钮：40×40 vp，圆形，`#1a2238` 底 + `#22d3a8` 字
- 面板背景：`#111928ee`（半透明深色），圆角 12，宽 300 vp
- 配色沿用项目主色调：青绿 `#22d3a8` / 暗蓝 `#1a2238` / 灰 `#5a7088`
- 当前播放曲目高亮 `#22d3a8`，其余 `#88a0b8`
