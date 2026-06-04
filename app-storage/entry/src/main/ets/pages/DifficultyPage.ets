// 难度选择页（new-design 2.1）：Easy / Normal / Hard
// 选定后跳转 LoadingPage（携带难度），由加载页向 DeepSeek 请求指令序列
import { router } from '@kit.ArkUI';
import { Difficulty, DIFFICULTY_CONFIGS, DifficultyConfig } from '../game/data/Instruction';

// 跳转 LoadingPage 携带的参数
interface StartParams {
  difficulty: number;
}

@Entry
@Component
struct DifficultyPage {
  // 难度卡片配色（Easy 青绿 / Normal 金 / Hard 橙红）
  private accentOf(d: Difficulty): string {
    if (d === Difficulty.EASY) {
      return '#22d3a8';
    }
    if (d === Difficulty.NORMAL) {
      return '#ffd24a';
    }
    return '#ff6b6b';
  }

  // 跳加载页，传难度
  private start(d: Difficulty): void {
    const params: StartParams = { difficulty: d as number };
    router.pushUrl({
      url: 'pages/LoadingPage',
      params: params
    });
  }

  @Builder
  DiffCard(cfg: DifficultyConfig) {
    Column() {
      Text(cfg.label)
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .fontColor(this.accentOf(cfg.difficulty))
        .margin({ bottom: 8 })
      Text(cfg.instrCount + ' 条指令')
        .fontSize(14)
        .fontColor('#e8f4ff')
        .margin({ bottom: 4 })
      Text('并行宽度 ≤ ' + cfg.maxWidth + ' · 每层 ' + cfg.fragmentsPerLayer + ' 操作数')
        .fontSize(11)
        .fontColor('#5a7088')
        .margin({ bottom: 4 })
      Text(cfg.scene)
        .fontSize(12)
        .fontColor('#88a0b8')
    }
    .width(200)
    .height(160)
    .padding(16)
    .backgroundColor('#0d1424')
    .borderRadius(12)
    .border({ width: 1, color: this.accentOf(cfg.difficulty) + '66' })
    .justifyContent(FlexAlign.Center)
    .onClick(() => {
      this.start(cfg.difficulty);
    })
  }

  build() {
    Column() {
      Text('选择难度')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .fontColor('#22d3a8')
        .margin({ bottom: 6 })
      Text('难度决定 AI 生成的指令数与并行宽度（层数固定 3 层）')
        .fontSize(12)
        .fontColor('#5a7088')
        .margin({ bottom: 40 })

      Row() {
        ForEach(DIFFICULTY_CONFIGS, (cfg: DifficultyConfig, idx: number) => {
          this.DiffCard(cfg)
        }, (cfg: DifficultyConfig, idx: number) => idx.toString())
      }
      .justifyContent(FlexAlign.Center)

      Button('← 返回')
        .fontSize(14)
        .backgroundColor('#1a2238')
        .fontColor('#88a0b8')
        .height(40)
        .width(160)
        .margin({ top: 48 })
        .onClick(() => {
          router.back();
        })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#0a0e1a')
  }
}
