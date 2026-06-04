// 顶部「持有寄存器」状态条（new-design 六）
// 展示控制信号当前持有的操作数、下一条待执行指令、指令进度
// 纯展示组件，数据由 GamePage 通过 @Prop 注入

@Component
export struct HoldingBar {
  // 当前持有操作数标签（拾取的寄存器/立即数/地址值）
  @Prop heldLabels: string[];
  // 下一条待执行指令文案（如 "MUL ecx, eax, ebx"）
  @Prop nextInstr: string;
  // 指令进度文案（如 "3 / 8"）
  @Prop progressText: string;

  build() {
    Row() {
      // 下一步指令
      Column() {
        Text('下一步')
          .fontSize(10)
          .fontColor('#5a7088')
        Text(this.nextInstr.length > 0 ? this.nextInstr : '—')
          .fontSize(13)
          .fontColor('#ffd166')
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .width(180)

      // 持有操作数 chips
      Row() {
        Text('持有')
          .fontSize(10)
          .fontColor('#5a7088')
          .margin({ right: 6 })
        if (this.heldLabels.length === 0) {
          Text('（空）')
            .fontSize(12)
            .fontColor('#5a7088')
        } else {
          ForEach(this.heldLabels, (label: string, idx: number) => {
            Text(label)
              .fontSize(12)
              .fontColor('#0a0e1a')
              .backgroundColor('#4aa3ff')
              .borderRadius(4)
              .padding({ left: 6, right: 6, top: 2, bottom: 2 })
              .margin({ right: 4 })
          }, (label: string, idx: number) => idx + '-' + label)
        }
      }
      .layoutWeight(1)

      // 指令进度
      Column() {
        Text('指令进度')
          .fontSize(10)
          .fontColor('#5a7088')
        Text(this.progressText)
          .fontSize(13)
          .fontColor('#22d3a8')
      }
      .alignItems(HorizontalAlign.End)
      .width(80)
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 8, bottom: 8 })
    .backgroundColor('#0d1424cc')
    .borderRadius(8)
  }
}
