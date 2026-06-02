// 音乐面板组件：浮动按钮 + 展开式播放列表/控制面板
// 可复用于 Index.ets 和 GamePage.ets，右下角定位

import { picker } from '@kit.CoreFileKit';
import { getMusicService, MusicService, MusicTrack, MusicStateCallback } from '../utils/MusicService';

@Component
export struct MusicPanel {
  // 面板展开状态
  @State showPanel: boolean = false;
  // 播放状态镜像（从 MusicService 同步）
  @State isPlaying: boolean = false;
  @State volume: number = 50;
  @State currentIndex: number = -1;
  @State playlist: MusicTrack[] = [];
  @State currentTrackName: string = '';

  // 服务引用
  private svc: MusicService = getMusicService();
  // 状态同步回调
  private stateCallback: MusicStateCallback = () => {
    this.syncState();
  };

  aboutToAppear(): void {
    this.svc.addListener(this.stateCallback);
    this.syncState();
  }

  aboutToDisappear(): void {
    this.svc.removeListener(this.stateCallback);
  }

  // 从 MusicService 同步状态到 @State
  private syncState(): void {
    this.isPlaying = this.svc.isPlaying;
    this.volume = this.svc.volume;
    this.currentIndex = this.svc.currentIndex;
    this.playlist = this.svc.playlist.slice(); // 浅拷贝触发刷新
    const track: MusicTrack | null = this.svc.currentTrack;
    this.currentTrackName = track !== null ? track.name : '';
  }

  // 打开文件选择器添加音乐
  private async pickAudioFile(): Promise<void> {
    try {
      const audioPicker: picker.AudioViewPicker = new picker.AudioViewPicker();
      const result: string[] = await audioPicker.select();
      if (result.length > 0) {
        // 从 URI 提取文件名作为显示名
        const uri: string = result[0];
        const segments: string[] = uri.split('/');
        const fileName: string = segments[segments.length - 1];
        const displayName: string = decodeURIComponent(fileName);
        await this.svc.addUserTrack(uri, displayName);
      }
    } catch (e) {
      // 用户取消选择或权限不足，静默处理
    }
  }

  // 浮动音乐按钮（始终显示）
  @Builder
  FloatingButton() {
    Button(this.isPlaying ? '♫' : '♪')
      .width(44)
      .height(44)
      .fontSize(20)
      .fontColor('#22d3a8')
      .backgroundColor('#1a2238dd')
      .borderRadius(22)
      .border({ width: 1, color: '#22d3a833' })
      .onClick(() => {
        this.showPanel = !this.showPanel;
      })
  }

  // 播放控制条：上一曲 / 播放暂停 / 下一曲
  @Builder
  PlaybackControls() {
    Row() {
      Button('◀◀')
        .width(44)
        .height(36)
        .fontSize(12)
        .fontColor('#88a0b8')
        .backgroundColor('#1a2238')
        .onClick(() => {
          this.svc.prev();
        })

      Button(this.isPlaying ? '⏸' : '▶')
        .width(52)
        .height(36)
        .fontSize(16)
        .fontColor('#22d3a8')
        .backgroundColor('#1a2238')
        .margin({ left: 8, right: 8 })
        .onClick(() => {
          this.svc.togglePlay();
        })

      Button('▶▶')
        .width(44)
        .height(36)
        .fontSize(12)
        .fontColor('#88a0b8')
        .backgroundColor('#1a2238')
        .onClick(() => {
          this.svc.next();
        })
    }
    .justifyContent(FlexAlign.Center)
    .width('100%')
  }

  // 音量滑块
  @Builder
  VolumeControl() {
    Row() {
      Text('🔊')
        .fontSize(14)
        .fontColor('#5a7088')
        .margin({ right: 8 })
      Slider({
        value: this.volume,
        min: 0,
        max: 100,
        step: 1,
        style: SliderStyle.OutSet
      })
        .layoutWeight(1)
        .trackColor('#1a2238')
        .selectedColor('#22d3a8')
        .blockColor('#22d3a8')
        .onChange((value: number) => {
          this.svc.setVolume(value);
        })
      Text(this.volume.toString())
        .fontSize(12)
        .fontColor('#5a7088')
        .width(30)
        .textAlign(TextAlign.End)
    }
    .width('100%')
    .padding({ left: 8, right: 8 })
  }

  // 播放列表
  @Builder
  PlaylistView() {
    Column() {
      // 列表头 + 添加按钮
      Row() {
        Text('播放列表')
          .fontSize(13)
          .fontColor('#88a0b8')
          .layoutWeight(1)
        Button('+ 添加')
          .fontSize(12)
          .fontColor('#22d3a8')
          .backgroundColor('#1a223800')
          .height(28)
          .onClick(() => {
            this.pickAudioFile();
          })
      }
      .width('100%')
      .padding({ bottom: 8 })

      // 曲目列表（可滚动）
      Scroll() {
        Column() {
          ForEach(this.playlist, (track: MusicTrack, index: number) => {
            Row() {
              // 内置标记
              if (track.builtin) {
                Text('★')
                  .fontSize(11)
                  .fontColor('#ffd166')
                  .margin({ right: 6 })
              }
              // 曲名（当前播放高亮）
              Text(track.name)
                .fontSize(13)
                .fontColor(index === this.currentIndex ? '#22d3a8' : '#88a0b8')
                .fontWeight(index === this.currentIndex ? FontWeight.Bold : FontWeight.Normal)
                .layoutWeight(1)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })

              // 用户添加的曲目显示删除按钮
              if (!track.builtin) {
                Button('✕')
                  .width(28)
                  .height(28)
                  .fontSize(12)
                  .fontColor('#ff6b6b')
                  .backgroundColor('#1a223800')
                  .onClick(() => {
                    this.svc.removeTrack(index);
                  })
              }
            }
            .width('100%')
            .height(40)
            .padding({ left: 8, right: 4 })
            .backgroundColor(index === this.currentIndex ? '#1a223888' : '#00000000')
            .borderRadius(6)
            .onClick(() => {
              this.svc.playAt(index);
            })
          }, (track: MusicTrack, index: number) => index.toString() + track.name)
        }
      }
      .constraintSize({ maxHeight: 200 })
      .width('100%')
    }
  }

  // 展开的面板主体
  @Builder
  PanelContent() {
    Column() {
      // 当前播放信息
      Text(this.currentTrackName.length > 0 ? this.currentTrackName : '未播放')
        .fontSize(14)
        .fontColor(this.currentTrackName.length > 0 ? '#e8f4ff' : '#5a7088')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
        .textAlign(TextAlign.Center)
        .margin({ bottom: 12 })

      // 播放控制
      this.PlaybackControls()

      // 音量
      this.VolumeControl()

      // 分隔线
      Divider()
        .color('#22d3a833')
        .margin({ top: 10, bottom: 10 })

      // 播放列表
      this.PlaylistView()
    }
    .width(300)
    .padding(16)
    .backgroundColor('#111928ee')
    .borderRadius(12)
    .border({ width: 1, color: '#22d3a833' })
  }

  build() {
    Column() {
      // 展开面板（在按钮上方）
      if (this.showPanel) {
        this.PanelContent()
      }
      // 浮动按钮
      this.FloatingButton()
    }
    .alignItems(HorizontalAlign.End)
  }
}
