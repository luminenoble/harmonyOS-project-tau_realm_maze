// 主菜单页：游戏标题 + 韬定律背景介绍 + 进入游戏按钮
import { router } from '@kit.ArkUI';

@Entry
@Component
struct Index {
  build() {
    Column() {
      // 游戏标题
      Text('TauRealmMaze')
        .fontSize(32)
        .fontWeight(FontWeight.Bold)
        .fontColor('#22d3a8')
        .margin({ bottom: 12 })

      // 副标题：项目主题
      Text('韬略 · 芯片迷宫')
        .fontSize(14)
        .fontColor('#88a0b8')
        .margin({ bottom: 8 })

      // 概念介绍：韬定律从 2D 到 3D 的演进
      Text('从二维平面晶体管布局\n到三维堆叠通信架构')
        .fontSize(12)
        .fontColor('#5a7088')
        .textAlign(TextAlign.Center)
        .margin({ bottom: 48 })

      // 进入游戏：路由跳转到 GamePage
      Button('进入芯片世界')
        .fontSize(16)
        .fontColor('#0a0e1a')
        .backgroundColor('#22d3a8')
        .width(200)
        .height(44)
        .onClick(() => {
          router.pushUrl({ url: 'pages/GamePage' });
        })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#0a0e1a')
  }
}
