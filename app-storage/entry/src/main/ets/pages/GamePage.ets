// 游戏主页面：Canvas 宿主 + 滑动手势输入 + 引擎驱动重绘
// Day 3：13×13 迷宫 + 玩家四方向移动 + 碰撞检测
import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawMap } from '../game/render/IsoRenderer';
import { MapManager } from '../game/core/MapManager';
import { GameEngine } from '../game/core/GameEngine';

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

  // 多层堆叠预留：当前仅渲染 Layer 0，但 originY 按 3 层规划留出头部空间
  // Day 4 多层启用后 Layer 1/2 向上堆叠刚好填满，避免再调整布局
  private readonly TARGET_LAYERS: number = 3;

  // 滑动判定阈值（px），太小会误触
  private readonly SWIPE_THRESHOLD: number = 24;

  // 引擎实例：aboutToAppear 构造，aboutToDisappear 停机
  private engine: GameEngine | null = null;

  // 页面入场：构造引擎与地图
  // Canvas 通过 ctx 直接绘制，不依赖 @State 触发重绘
  aboutToAppear(): void {
    const map: MapManager = new MapManager(this.GRID_COLS, this.GRID_ROWS);
    this.engine = new GameEngine(map, 1, 1);
    this.engine.setTickCallback(() => {
      this.renderMap();
    });
  }

  // 页面退出：停 timer 防止泄漏
  aboutToDisappear(): void {
    if (this.engine !== null) {
      this.engine.stop();
    }
  }

  // 渲染入口：清屏 → 自适应瓦片尺寸 → 按 painter's 顺序绘制
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

    // 垂直居中（按 TARGET_LAYERS 计算理论占用高度）
    const contentH: number = this.TARGET_LAYERS * wallH + (this.GRID_COLS + this.GRID_ROWS) * halfH;
    const topMargin: number = Math.max(0, (h - contentH) / 2);
    const originX: number = w / 2;
    const originY: number = topMargin + this.TARGET_LAYERS * wallH + halfH;

    const cfg: IsoConfig = new IsoConfig(halfW, halfH, -wallH, originX, originY);

    if (this.engine === null) {
      return;
    }
    const e: GameEngine = this.engine as GameEngine;
    // 玩家高度 = 0.6 倍墙高
    drawMap(this.ctx, e.map, cfg, wallH, 0, e.player, wallH * 0.6);
  }

  // 滑动手势 → 网格方向 → 引擎 tryMove
  // 方案 A：屏幕上下左右直接对应 row±1 / col±1
  private handleSwipe(dx: number, dy: number): void {
    if (this.engine === null) {
      return;
    }
    if (Math.abs(dx) < this.SWIPE_THRESHOLD && Math.abs(dy) < this.SWIPE_THRESHOLD) {
      return;
    }
    const e: GameEngine = this.engine as GameEngine;
    if (Math.abs(dx) > Math.abs(dy)) {
      e.tryMove(dx > 0 ? 1 : -1, 0);
    } else {
      e.tryMove(0, dy > 0 ? 1 : -1);
    }
  }

  // 虚拟方向键按下
  private handleDpad(dCol: number, dRow: number): void {
    if (this.engine === null) {
      return;
    }
    (this.engine as GameEngine).tryMove(dCol, dRow);
  }

  build() {
    Column() {
      // 顶部 HUD：返回 + 标题 + 重生
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

        Button('↻ 重生')
          .fontSize(14)
          .backgroundColor('#1a2238')
          .fontColor('#22d3a8')
          .height(36)
          .onClick(() => {
            // 重建地图与玩家
            const map: MapManager = new MapManager(this.GRID_COLS, this.GRID_ROWS);
            if (this.engine !== null) {
              (this.engine as GameEngine).stop();
            }
            this.engine = new GameEngine(map, 1, 1);
            this.engine.setTickCallback(() => {
              this.renderMap();
            });
            this.renderMap();
          })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 12, bottom: 12 })
      .justifyContent(FlexAlign.Start)

      // Canvas 渲染区，叠加滑动手势
      Stack() {
        Canvas(this.ctx)
          .width('100%')
          .height('100%')
          .backgroundColor(this.BG_COLOR)
          .onReady(() => {
            this.renderMap();
          })
      }
      .width('100%')
      .layoutWeight(1)
      .gesture(
        PanGesture({ direction: PanDirection.All, distance: 10 })
          .onActionEnd((event: GestureEvent) => {
            this.handleSwipe(event.offsetX, event.offsetY);
          })
      )

      // 底部虚拟方向键（模拟器测试方便；真机上滑动也可用）
      Column() {
        Row() {
          Button('↑').width(48).height(40).fontSize(18)
            .backgroundColor('#1a2238').fontColor('#22d3a8')
            .onClick(() => { this.handleDpad(0, -1); })
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)

        Row() {
          Button('←').width(48).height(40).fontSize(18)
            .backgroundColor('#1a2238').fontColor('#22d3a8')
            .onClick(() => { this.handleDpad(-1, 0); })
          Button('↓').width(48).height(40).fontSize(18)
            .backgroundColor('#1a2238').fontColor('#22d3a8')
            .margin({ left: 12, right: 12 })
            .onClick(() => { this.handleDpad(0, 1); })
          Button('→').width(48).height(40).fontSize(18)
            .backgroundColor('#1a2238').fontColor('#22d3a8')
            .onClick(() => { this.handleDpad(1, 0); })
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
        .margin({ top: 6 })
      }
      .width('100%')
      .padding({ top: 12, bottom: 24 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.BG_COLOR)
  }
}
