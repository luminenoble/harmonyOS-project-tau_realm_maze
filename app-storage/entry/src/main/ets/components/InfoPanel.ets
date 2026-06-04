// 右侧点击信息卡片（new-design 5.1）
// 点击地图元素（碎片/VIA/ALU门/RAW/散热）时由 GamePage 条件渲染本组件
// 纯展示：标题 + 多行正文 + 关闭按钮；不遮挡主视角（固定右侧窄栏）

@Component
export struct InfoPanel {
  // 卡片标题（如 "MUL 门"）
  @Prop title: string;
  // 正文（多行，已由调用方拼好 \n）
  @Prop body: string;
  // 强调色（按元素类型着色）
  @Prop accent: string;
  // 关闭回调
  onClose: () => void = () => {};

  build() {
    Column() {
      // 标题行 + 关闭
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.accent)
          .layoutWeight(1)
        Text('×')
          .fontSize(20)
          .fontColor('#88a0b8')
          .onClick(() => {
            this.onClose();
          })
      }
      .width('100%')
      .margin({ bottom: 12 })

      Divider()
        .color('#22d3a833')
        .margin({ bottom: 12 })

      // 正文
      Text(this.body)
        .fontSize(13)
        .fontColor('#cfe3ff')
        .lineHeight(20)
        .textAlign(TextAlign.Start)
        .width('100%')
    }
    .width(240)
    .padding(16)
    .backgroundColor('#111928f2')
    .borderRadius(10)
    .border({ width: 1, color: this.accent })
    .alignItems(HorizontalAlign.Start)
  }
}
