// 游戏主页面：Canvas 宿主，承载等距地图渲染
// Day 1 阶段仅渲染 5×5 静态地板，Day 2 起接入迷宫数据与瓦片类型
import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawIsoGrid, DEFAULT_TILE_STYLE } from '../game/render/IsoRenderer';

@Entry
@Component
struct GamePage {
  // Canvas 2D 上下文，启用抗锯齿（true）
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  // Day 1 MVP 参数：5×5 网格 + 深蓝近黑 PCB 底色
  private readonly GRID_COLS: number = 5;
  private readonly GRID_ROWS: number = 5;
  private readonly BG_COLOR: string = '#0a0e1a';

  // 渲染入口：清屏 → 计算居中原点 → 绘制地板网格
  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    // 清屏铺底色
    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    // 原点放在画布水平中心、垂直 100px 处，使菱形地图整体居中
    const cfg: IsoConfig = new IsoConfig(32, 16, -24, w / 2, 100);
    drawIsoGrid(this.ctx, this.GRID_COLS, this.GRID_ROWS, 0, cfg, DEFAULT_TILE_STYLE);
  }

  build() {
    Column() {
      // 顶部 HUD：返回按钮 + 当前层数指示
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

      // Canvas 渲染区：占据剩余空间，onReady 在画布就绪时触发首次绘制
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
