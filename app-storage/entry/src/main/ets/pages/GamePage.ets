// 游戏主页面：Canvas 宿主 + 滑动手势输入 + 引擎驱动重绘
// Day 4：3 层迷宫 + Via 切层转场 + HUD 层数指示
import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawMap } from '../game/render/IsoRenderer';
import { drawFade, drawLayerLabel } from '../game/render/UIOverlay';
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

  // 多层堆叠预留：Day 4 实际启用 3 层，layout 锚定与之一致
  private readonly TARGET_LAYERS: number = 3;

  // 滑动判定阈值（px），太小会误触
  private readonly SWIPE_THRESHOLD: number = 24;

  // 引擎实例：aboutToAppear 构造，aboutToDisappear 停机
  private engine: GameEngine | null = null;

  // 顶部 HUD 显示用层号；tick 回调内同步以触发 ArkUI 文本刷新
  @State currentLayer: number = 0;

  // 页面入场：构造引擎与地图
  aboutToAppear(): void {
    this.initEngine();
  }

  // 页面退出：停 timer 防止泄漏
  aboutToDisappear(): void {
    if (this.engine !== null) {
      this.engine.stop();
    }
  }

  // 抽出引擎构造，aboutToAppear 与"↻ 重生"复用
  private initEngine(): void {
    if (this.engine !== null) {
      this.engine.stop();
    }
    const map: MapManager = new MapManager(this.GRID_COLS, this.GRID_ROWS, this.TARGET_LAYERS);
    this.engine = new GameEngine(map, 1, 1);
    this.currentLayer = 0;
    this.engine.setTickCallback(() => {
      const e: GameEngine = this.engine as GameEngine;
      // 转场 swap 后同步层号到 ArkUI Text
      if (this.currentLayer !== e.currentLayer) {
        this.currentLayer = e.currentLayer;
      }
      this.renderMap();
    });
  }

  // 渲染入口：清屏 → 自适应瓦片尺寸 → painter's 顺序绘制 → 覆盖层
  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    // 清屏铺底色
    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    // 自适应瓦片半宽
    const maxHalfW: number = Math.floor((w - 40) / (this.GRID_COLS + this.GRID_ROWS));
    const halfW: number = Math.min(28, Math.max(8, maxHalfW));
    const halfH: number = Math.floor(halfW / 2);
    // 墙高降到 0.45 倍瓦片半宽，露出后排路面，仍保留立体感
    const wallH: number = Math.max(4, Math.floor(halfW * 0.45));

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

    // 渲染当前层（不渲染其他层，Day 4 简化处理）
    drawMap(this.ctx, e.map, cfg, wallH, e.currentLayer, e.player, wallH * 0.6);

    // Canvas 左上角层数小标签
    drawLayerLabel(this.ctx, e.currentLayer, this.TARGET_LAYERS - 1, 12, 12);

    // 转场黑屏覆盖（最后画，覆盖所有内容）
    drawFade(this.ctx, w, h, e.transitionAlpha);
  }

  // 滑动手势 → 网格方向 → 引擎 tryMove
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
      // 顶部 HUD：返回 + 标题(含层号) + 重生
      Row() {
        Button('← 返回')
          .fontSize(14)
          .backgroundColor('#1a2238')
          .fontColor('#22d3a8')
          .height(36)
          .onClick(() => {
            router.back();
          })

        Text('TauRealmMaze · Layer ' + this.currentLayer + '/' + (this.TARGET_LAYERS - 1))
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
            this.initEngine();
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
