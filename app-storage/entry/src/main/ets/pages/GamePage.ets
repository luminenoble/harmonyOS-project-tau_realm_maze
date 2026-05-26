import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawIsoGrid, DEFAULT_TILE_STYLE } from '../game/render/IsoRenderer';

@Entry
@Component
struct GamePage {
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  private readonly GRID_COLS: number = 5;
  private readonly GRID_ROWS: number = 5;
  private readonly BG_COLOR: string = '#0a0e1a';

  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    const cfg: IsoConfig = new IsoConfig(32, 16, -24, w / 2, 100);
    drawIsoGrid(this.ctx, this.GRID_COLS, this.GRID_ROWS, 0, cfg, DEFAULT_TILE_STYLE);
  }

  build() {
    Column() {
      Row() {
        Button('← 返回')
          .fontSize(14)
          .backgroundColor('#1a2238')
          .fontColor('#22d3a8')
          .height(36)
          .onClick(() => {
            router.back();
          })

        Text('TauRealmMaze · Layer 0')
          .fontSize(16)
          .fontColor('#22d3a8')
          .margin({ left: 16 })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 12, bottom: 12 })
      .justifyContent(FlexAlign.Start)

      Canvas(this.ctx)
        .width('100%')
        .layoutWeight(1)
        .backgroundColor(this.BG_COLOR)
        .onReady(() => {
          this.renderMap();
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.BG_COLOR)
  }
}
