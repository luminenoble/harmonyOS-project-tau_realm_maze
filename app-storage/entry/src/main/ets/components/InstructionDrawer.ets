// 右侧参考文档抽屉（new-design 5.2）：本局指令序列 + 执行进度
// 已执行指令绿色高亮，当前待执行黄色强调，未执行灰色
// 纯展示组件，可见性由 GamePage 控制（条件渲染）

import { Instruction } from '../game/data/Instruction';

@Component
export struct InstructionDrawer {
  // 本局指令序列
  @Prop instructions: Instruction[];
  // 已执行指令数（前 executedCount 条视为完成）
  @Prop executedCount: number;
  // 运算场景描述（如 "1×2 向量内积"）
  @Prop instrType: string;
  // 是否离线预置序列（UI 标注）
  @Prop fromFallback: boolean;
  // 关闭回调
  onClose: () => void = () => {};

  // 一条指令的颜色：已执行绿 / 当前黄 / 未来灰
  private lineColor(seq: number): string {
    if (seq <= this.executedCount) {
      return '#22d3a8';
    }
    if (seq === this.executedCount + 1) {
      return '#ffd166';
    }
    return '#5a7088';
  }

  build() {
    Column() {
      // 标题行
      Row() {
        Text('本局指令序列')
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor('#22d3a8')
          .layoutWeight(1)
        Text('×')
          .fontSize(20)
          .fontColor('#88a0b8')
          .onClick(() => {
            this.onClose();
          })
      }
      .width('100%')

      Row() {
        Text(this.instrType)
          .fontSize(12)
          .fontColor('#88a0b8')
        if (this.fromFallback) {
          Text('OFFLINE')
            .fontSize(10)
            .fontColor('#ff9a40')
            .backgroundColor('#2a1410')
            .borderRadius(3)
            .padding({ left: 4, right: 4 })
            .margin({ left: 8 })
        }
      }
      .width('100%')
      .margin({ top: 4, bottom: 10 })

      Divider()
        .color('#22d3a833')
        .margin({ bottom: 8 })

      // 指令列表（可滚动）
      Scroll() {
        Column() {
          ForEach(this.instructions, (ins: Instruction, idx: number) => {
            Text('[' + ins.index + '] ' + ins.mnemonic + ' ' + ins.operands
                + '   ; ' + ins.comment)
              .fontSize(12)
              .fontColor(this.lineColor(ins.index))
              .lineHeight(20)
              .width('100%')
              .textAlign(TextAlign.Start)
          }, (ins: Instruction, idx: number) => idx + '-' + ins.index)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Auto)

      Divider()
        .color('#22d3a833')
        .margin({ top: 8, bottom: 8 })

      Text('当前进度: ' + this.executedCount + ' / ' + this.instructions.length + ' 已执行')
        .fontSize(12)
        .fontColor('#e8f4ff')
    }
    .width(300)
    .height('100%')
    .padding(16)
    .backgroundColor('#0d1424f7')
    .border({ width: 1, color: '#22d3a833' })
    .alignItems(HorizontalAlign.Start)
  }
}
