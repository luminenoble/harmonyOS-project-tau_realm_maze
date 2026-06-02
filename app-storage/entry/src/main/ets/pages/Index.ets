// 主菜单页：游戏标题 + 用户信息 + 称号选择 + 进入游戏 / 历史记录 / 切换用户
import { router } from '@kit.ArkUI';
import { UserRecord, initDb } from '../utils/DbHelper';
import {
  getCurrentUserId, getCurrentUser, getCurrentTitle,
  getUnlockedTitles, selectTitle, logout
} from '../utils/UserSession';
import { MusicPanel } from '../components/MusicPanel';

@Entry
@Component
struct Index {
  @State nickname: string = '';
  @State titleText: string = '';
  @State unlockedTitles: string[] = [];
  @State showTitlePicker: boolean = false;

  aboutToAppear(): void {
    this.loadUserInfo();
  }

  // 每次页面显示时刷新用户信息（从历史记录返回后称号可能变化）
  onPageShow(): void {
    this.loadUserInfo();
  }

  // 加载当前用户信息（先确保 DB 已就绪）
  private async loadUserInfo(): Promise<void> {
    await initDb(getContext(this));
    const uid: number = getCurrentUserId();
    if (uid < 0) {
      // 未登录，跳转登录页
      router.replaceUrl({ url: 'pages/LoginPage' });
      return;
    }
    const user: UserRecord | null = await getCurrentUser();
    if (user !== null) {
      this.nickname = user.nickname;
    }
    this.titleText = await getCurrentTitle(uid);
    this.unlockedTitles = await getUnlockedTitles(uid);
  }

  // 切换称号
  private doSelectTitle(title: string, idx: number): void {
    const uid: number = getCurrentUserId();
    selectTitle(uid, idx).then((ok: boolean) => {
      if (ok) {
        this.titleText = title;
      }
      this.showTitlePicker = false;
    });
  }

  // 称号选择弹窗
  @Builder
  TitlePickerDialog() {
    Column() {
      Text('选择称号')
        .fontSize(16)
        .fontColor('#e8f4ff')
        .margin({ bottom: 16 })

      ForEach(this.unlockedTitles, (title: string, idx: number) => {
        Row() {
          Text(title)
            .fontSize(14)
            .fontColor(this.titleText === title ? '#22d3a8' : '#88a0b8')
            .layoutWeight(1)
          if (this.titleText === title) {
            Text('✓')
              .fontSize(14)
              .fontColor('#22d3a8')
          }
        }
        .width(220)
        .padding({ top: 10, bottom: 10, left: 16, right: 16 })
        .backgroundColor(this.titleText === title ? '#1a2238' : '#00000000')
        .borderRadius(6)
        .onClick(() => {
          this.doSelectTitle(title, idx);
        })
      }, (title: string, idx: number) => idx.toString())

      Button('关闭')
        .fontSize(13)
        .fontColor('#88a0b8')
        .backgroundColor('#1a2238')
        .height(34)
        .margin({ top: 16 })
        .onClick(() => {
          this.showTitlePicker = false;
        })
    }
    .padding(24)
    .backgroundColor('#111928')
    .borderRadius(12)
    .border({ width: 1, color: '#22d3a833' })
  }

  build() {
    Stack() {
      Column() {
        // 用户信息区
        Column() {
          Text(this.nickname)
            .fontSize(16)
            .fontColor('#e8f4ff')
            .margin({ bottom: 4 })
          // 称号（点击可切换）
          Row() {
            Text(this.titleText)
              .fontSize(12)
              .fontColor('#22d3a8')
            Text(' ▾')
              .fontSize(10)
              .fontColor('#5a7088')
          }
          .onClick(() => {
            this.showTitlePicker = true;
          })
        }
        .margin({ bottom: 32 })

        // 游戏标题
        Text('TauRealmMaze')
          .fontSize(32)
          .fontWeight(FontWeight.Bold)
          .fontColor('#22d3a8')
          .margin({ bottom: 12 })

        // 副标题
        Text('韬略 · 芯片迷宫')
          .fontSize(14)
          .fontColor('#88a0b8')
          .margin({ bottom: 8 })

        // 概念介绍
        Text('从二维平面晶体管布局\n到三维堆叠通信架构')
          .fontSize(12)
          .fontColor('#5a7088')
          .textAlign(TextAlign.Center)
          .margin({ bottom: 48 })

        // 进入游戏
        Button('进入芯片世界')
          .fontSize(16)
          .fontColor('#0a0e1a')
          .backgroundColor('#22d3a8')
          .width(200)
          .height(44)
          .onClick(() => {
            router.pushUrl({ url: 'pages/GamePage' });
          })
          .margin({ bottom: 16 })

        // 历史记录
        Button('历史记录')
          .fontSize(14)
          .fontColor('#88a0b8')
          .backgroundColor('#1a2238')
          .width(200)
          .height(40)
          .onClick(() => {
            router.pushUrl({ url: 'pages/HistoryPage' });
          })
          .margin({ bottom: 16 })

        // 切换用户
        Button('切换用户')
          .fontSize(12)
          .fontColor('#5a7088')
          .backgroundColor('#00000000')
          .width(200)
          .height(32)
          .onClick(() => {
            logout();
            router.replaceUrl({ url: 'pages/LoginPage' });
          })
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .backgroundColor('#0a0e1a')

      // 称号选择弹窗
      if (this.showTitlePicker) {
        Column() {
          this.TitlePickerDialog()
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor('#00000088')
        .onClick(() => {
          this.showTitlePicker = false;
        })
      }

      // 右下角音乐面板
      Column() {
        MusicPanel()
      }
      .position({ right: 24, bottom: 24 })
    }
    .width('100%')
    .height('100%')
  }
}
