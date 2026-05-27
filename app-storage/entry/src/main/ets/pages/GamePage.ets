// 游戏主页面：Canvas 宿主，承载等距地图渲染
// Day 2：13×13 随机迷宫 + Painter's Algorithm 立体墙体
import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawMap } from '../game/render/IsoRenderer';
import { MapManager } from '../game/core/MapManager';

@Entry
@Component
struct GamePage {
  // Canvas 2D 上下文，启用抗锯齿（true）
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  // Day 2 MVP 参数：13×13 厚墙迷宫（逻辑 6×6 cell）
  private readonly GRID_COLS: number = 13;
  private readonly GRID_ROWS: number = 13;
  private readonly BG_COLOR: string = '#0a0e1a';

  // 地图数据，onReady 时构造（构造内部即调用 MazeGenerator 生成）
  private map: MapManager | null = null;

  // 渲染入口：清屏 → 自适应瓦片尺寸 → 按 painter's 顺序绘制整张地图
  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    // 清屏铺底色
    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    // 自适应瓦片半宽：保证 (cols + rows) * halfW <= 画布宽 - 边距
    // 上限 28 px，避免在大屏上瓦片过大失真
    const maxHalfW: number = Math.floor((w - 40) / (this.GRID_COLS + this.GRID_ROWS));
    const halfW: number = Math.min(28, Math.max(8, maxHalfW));
    const halfH: number = Math.floor(halfW / 2);   // 2:1 等距比例
    const wallH: number = halfW;                    // 墙高 = 瓦片半宽，立方感

    // 计算原点：水平居中；垂直留出 wallH + halfH 让最远墙顶不被截
    const originX: number = w / 2;
    const originY: number = wallH + halfH + 20;

    const cfg: IsoConfig = new IsoConfig(halfW, halfH, -wallH, originX, originY);

    // 懒构造地图（保证 onReady 后才生成，避免 SSR/初始化时机问题）
    if (this.map === null) {
      this.map = new MapManager(this.GRID_COLS, this.GRID_ROWS);
    }
    // 用 local 持有 MapManager 实例，避免 ArkTS 严格模式下 nullable 字段未收窄
    const m: MapManager = this.map as MapManager;
    drawMap(this.ctx, m, cfg, wallH, 0);
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

        Blank()

        // 调试按钮：重新生成迷宫
        Button('↻ 重生')
          .fontSize(14)
          .backgroundColor('#1a2238')
          .fontColor('#22d3a8')
          .height(36)
          .onClick(() => {
            this.map = null;
            this.renderMap();
          })
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
