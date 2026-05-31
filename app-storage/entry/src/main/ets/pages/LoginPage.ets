// 登录页：昵称输入 + 游客快速入口
// 芯片主题深色 UI，与主菜单风格统一

import { router } from '@kit.ArkUI';
import { initDb } from '../utils/DbHelper';
import { loginByNickname, loginAsGuest } from '../utils/UserSession';

@Entry
@Component
struct LoginPage {
  @State nickname: string = '';
  @State errMsg: string = '';
  @State loading: boolean = false;

  aboutToAppear(): void {
    // 确保数据库已初始化
    initDb(getContext(this)).catch((e: Error) => {
      this.errMsg = '数据库初始化失败：' + e.message;
    });
  }

  // 昵称登录
  private async doLogin(): Promise<void> {
    const name: string = this.nickname.trim();
    if (name === '') {
      this.errMsg = '请输入昵称';
      return;
    }
    if (name.length > 12) {
      this.errMsg = '昵称不超过 12 个字符';
      return;
    }
    // 不允许以 "游客#" 开头（保留给游客）
    if (name.startsWith('游客#')) {
      this.errMsg = '该昵称格式为系统保留';
      return;
    }
    this.loading = true;
    this.errMsg = '';
    try {
      await loginByNickname(name);
      router.replaceUrl({ url: 'pages/Index' });
    } catch (e) {
      this.errMsg = '登录失败，请重试';
      this.loading = false;
    }
  }

  // 游客登录
  private async doGuestLogin(): Promise<void> {
    this.loading = true;
    this.errMsg = '';
    try {
      await loginAsGuest();
      router.replaceUrl({ url: 'pages/Index' });
    } catch (e) {
      this.errMsg = '游客登录失败，请重试';
      this.loading = false;
    }
  }

  build() {
    Column() {
      // 标题区
      Text('TauRealmMaze')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .fontColor('#22d3a8')
        .margin({ bottom: 8 })

      Text('韬略 · 芯片迷宫')
        .fontSize(13)
        .fontColor('#88a0b8')
        .margin({ bottom: 48 })

      // 登录卡片
      Column() {
        Text('输入昵称进入')
          .fontSize(16)
          .fontColor('#cfe3ff')
          .margin({ bottom: 16 })

        // 昵称输入框
        TextInput({ placeholder: '请输入昵称（1-12 字符）', text: this.nickname })
          .width(260)
          .height(44)
          .fontSize(15)
          .fontColor('#e8f4ff')
          .placeholderColor('#5a7088')
          .backgroundColor('#0d1424')
          .borderRadius(6)
          .border({ width: 1, color: '#22d3a844' })
          .padding({ left: 12, right: 12 })
          .onChange((value: string) => {
            this.nickname = value;
          })
          .onSubmit(() => {
            this.doLogin();
          })
          .margin({ bottom: 8 })

        // 错误提示
        if (this.errMsg !== '') {
          Text(this.errMsg)
            .fontSize(12)
            .fontColor('#ff6b6b')
            .margin({ bottom: 8 })
        }

        // 确认按钮
        Button('确认登录')
          .fontSize(15)
          .fontColor('#0a0e1a')
          .backgroundColor('#22d3a8')
          .width(260)
          .height(42)
          .enabled(!this.loading)
          .onClick(() => {
            this.doLogin();
          })
          .margin({ bottom: 12 })

        // 分隔线
        Row() {
          Divider().color('#2a3a50').layoutWeight(1)
          Text('或')
            .fontSize(12)
            .fontColor('#5a7088')
            .margin({ left: 12, right: 12 })
          Divider().color('#2a3a50').layoutWeight(1)
        }
        .width(260)
        .margin({ bottom: 12 })

        // 游客入口
        Button('游客模式')
          .fontSize(14)
          .fontColor('#88a0b8')
          .backgroundColor('#1a2238')
          .width(260)
          .height(40)
          .enabled(!this.loading)
          .onClick(() => {
            this.doGuestLogin();
          })

        Text('游客数据仅保存在本地')
          .fontSize(11)
          .fontColor('#3a4a60')
          .margin({ top: 8 })
      }
      .padding(32)
      .backgroundColor('#111928')
      .borderRadius(12)
      .border({ width: 1, color: '#22d3a822' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#0a0e1a')
  }
}
