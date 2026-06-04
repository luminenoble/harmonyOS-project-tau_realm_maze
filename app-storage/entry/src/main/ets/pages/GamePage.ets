// 游戏主页面：平板专用横屏布局
// 左侧固定宽度信息栏（返回 / 标题 / Layer / 碎片 / 重生）
// 右侧 Stack：Canvas 全屏铺底 + 右下角浮动 D-Pad
// Day 4：3 层迷宫 + Via 切层；Day 5：碎片拾取 / 逻辑门 / 科普 Dialog；Day 5 末：平板专用排版
import { router } from '@kit.ArkUI';
import { IsoConfig } from '../utils/IsoMath';
import { drawMap, drawRestructurePulse, drawInteractHighlight } from '../game/render/IsoRenderer';
import { drawFade, drawWarningOverlay, drawViaProgressBar, drawShutterFold } from '../game/render/UIOverlay';
import { MapManager } from '../game/core/MapManager';
import { GameEngine, VictoryStats } from '../game/core/GameEngine';
import { MusicPanel } from '../components/MusicPanel';
import { layerName, tierShort } from '../game/data/Semantics';

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
  // 左侧 HUD 栏背景色（略亮于主背景，分隔出"控制台"质感）
  private readonly SIDEBAR_BG: string = '#0d1424';

  // 多层堆叠预留：Day 4 实际启用 3 层，layout 锚定与之一致
  private readonly TARGET_LAYERS: number = 3;

  // 滑动判定阈值（px），太小会误触
  private readonly SWIPE_THRESHOLD: number = 24;

  // 引擎实例：aboutToAppear 构造，aboutToDisappear 停机
  private engine: GameEngine | null = null;

  // HUD 显示状态；tick 回调内同步以触发 ArkUI 文本刷新
  @State currentLayer: number = 0;
  @State currentFragments: number = 0;
  @State currentFragmentTotal: number = 0;
  // 距下一次动态重构剩余步数（Day 6）
  @State stepsUntilRestructure: number = 20;
  // 当前层热量（Day 6 散热）
  @State currentHeat: number = 0;
  @State heatMax: number = 100;
  // Day 7：τ 仪表 + 跨层碎片总数（用于 HUD 全局进度提示）
  @State tau: number = 0;
  @State totalPicked: number = 0;
  @State totalAll: number = 0;
  // score-algorithm：理论最优 τ（CPI 基准，全程不变）；当前落点交互态
  @State optimalTau: number = 1;
  @State canInteract: boolean = false;
  @State interactHint: string = '';

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
    this.engine = new GameEngine(map, null, 1, 1);
    this.currentLayer = 0;
    this.currentFragments = this.engine.currentFragments;
    this.currentFragmentTotal = this.engine.currentFragmentTotal;
    this.stepsUntilRestructure = this.engine.stepsUntilRestructure;
    this.currentHeat = this.engine.currentHeat;
    this.heatMax = this.engine.currentHeatMax;
    this.tau = this.engine.tau;
    this.totalPicked = this.engine.totalFragmentsPicked;
    this.totalAll = this.engine.totalFragmentsAll;
    this.optimalTau = this.engine.optimalTau;
    this.canInteract = this.engine.canInteract;
    this.interactHint = this.engine.interactHint;
    this.engine.setTickCallback(() => {
      const e: GameEngine = this.engine as GameEngine;
      // 转场 swap 后同步层号与本层碎片计数到 ArkUI（强制弹层与 VIA 切层都走这里）
      if (this.currentLayer !== e.currentLayer) {
        this.currentLayer = e.currentLayer;
        this.currentFragments = e.currentFragments;
        this.currentFragmentTotal = e.currentFragmentTotal;
      }
      // 重构倒计时随每次 tick 同步
      const newRemain: number = e.stepsUntilRestructure;
      if (this.stepsUntilRestructure !== newRemain) {
        this.stepsUntilRestructure = newRemain;
      }
      // 热量同步（每次 tick 都比较，过热与切层都会变化）
      const newHeat: number = e.currentHeat;
      if (this.currentHeat !== newHeat) {
        this.currentHeat = newHeat;
      }
      // Day 7：τ 仪表 + 全局碎片进度
      const newTau: number = e.tau;
      if (this.tau !== newTau) {
        this.tau = newTau;
      }
      const newPicked: number = e.totalFragmentsPicked;
      if (this.totalPicked !== newPicked) {
        this.totalPicked = newPicked;
      }
      // score-algorithm：落点交互态同步（点亮/熄灭 EXEC 按钮）
      const ci: boolean = e.canInteract;
      if (this.canInteract !== ci) {
        this.canInteract = ci;
      }
      const ih: string = e.interactHint;
      if (this.interactHint !== ih) {
        this.interactHint = ih;
      }
      this.renderMap();
    });
    this.engine.setFragmentPickedCallback((factText: string) => {
      const e: GameEngine = this.engine as GameEngine;
      this.currentFragments = e.currentFragments;
      this.currentFragmentTotal = e.currentFragmentTotal;
      this.totalPicked = e.totalFragmentsPicked;
      AlertDialog.show({
        title: 'LOAD 操作数 +1',
        message: factText,
        autoCancel: true,
        confirm: {
          value: '继续',
          action: () => {}
        }
      });
    });
    // Day 7：EXIT 落点但条件不足时的提示
    this.engine.setExitHintCallback((hint: string) => {
      AlertDialog.show({
        title: '终点未就绪',
        message: hint,
        autoCancel: true,
        confirm: {
          value: '继续探索',
          action: () => {}
        }
      });
    });
    // Day 7：通关回调，路由跳 ResultPage
    this.engine.setVictoryCallback((stats: VictoryStats) => {
      router.replaceUrl({
        url: 'pages/ResultPage',
        params: stats
      });
    });
  }

  // 渲染入口：清屏 → 自适应瓦片尺寸 → painter's 顺序绘制 → 转场覆盖
  // Canvas 区域已是"右侧无侧栏"的纯游戏区，halfW 上限放宽到 40 以利大屏
  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    // 防御性重置 ctx 状态：HarmonyOS Canvas 的 globalAlpha 在 save/restore 上行为不稳，
    // 强制每帧入口锁回 1，避免上一帧 fade 半透明残留导致清屏不彻底
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    // 自适应瓦片半宽：上限 40 vp（平板大屏视觉更舒展），下限 8 vp 防小窗压扁
    const maxHalfW: number = Math.floor((w - 40) / (this.GRID_COLS + this.GRID_ROWS));
    const halfW: number = Math.min(40, Math.max(8, maxHalfW));
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

    drawMap(this.ctx, e.map, cfg, wallH, e.currentLayer, e.player, wallH * 0.6);

    // Day 6 PULSE：opened / closed 改动 cell 高亮（仅 PULSE 阶段 alpha>0）
    drawRestructurePulse(
      this.ctx, cfg, e.currentLayer,
      e.lastOpenedCells, e.lastClosedCells, e.pulseAlpha, wallH
    );

    // score-algorithm：落点可激活时画金色脉冲描边，提示按 EXEC
    if (e.canInteract) {
      drawInteractHighlight(
        this.ctx, cfg, e.currentLayer, e.player.col, e.player.row,
        (Date.now() % 1600) / 1600
      );
    }

    // 平板布局把 HUD 全部移到左侧 Column，Canvas 上不再叠 label / badge

    // Day 6 WARN：红色脉冲底 + "信号重路由中..."（仅 WARN 阶段 alpha>0）
    drawWarningOverlay(this.ctx, w, h, e.warnPulseAlpha);

    // Day 7 VIA 等待：中央卡片进度条（仅 VIA_WAIT 阶段显示）
    if (e.isViaWaiting) {
      drawViaProgressBar(this.ctx, w, h, e.viaWaitTierValue, e.viaWaitProgress);
    }

    // 转场覆盖（最后画）：VIA 切层用 shutter 折叠，强制弹层走原 fade
    if (e.isViaTransition) {
      drawShutterFold(this.ctx, w, h, e.transitionAlpha);
    } else {
      drawFade(this.ctx, w, h, e.transitionAlpha);
    }
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

  // score-algorithm：EXEC 激活键 → 触发当前落点 VIA 切层 / EXIT 写回
  private handleInteract(): void {
    if (this.engine === null) {
      return;
    }
    (this.engine as GameEngine).tryInteract();
  }

  // EXEC 按钮文案：按落点类型映射到缓存命中 / 写回术语
  private interactLabel(): string {
    if (this.interactHint === 'EXIT') {
      return '⏎ WB 写回';
    }
    if (this.interactHint.indexOf('VIA') === 0) {
      const tier: number = Number(this.interactHint.substring(3));
      // DRAM 是"访问未命中"，L1$/L2$ 是"命中"
      if (tier === 2) {
        return '⚡ DRAM 访问';
      }
      return '⚡ ' + tierShort(tier) + ' 命中';
    }
    return '· EXEC ·';
  }

  // 热量阶梯色：≥80 红（过热）/ ≥50 黄（警示）/ 其余青绿（凉）
  private heatColor(): string {
    if (this.currentHeat >= 80) {
      return '#ff6b6b';
    }
    if (this.currentHeat >= 50) {
      return '#ffd166';
    }
    return '#22d3a8';
  }

  // 左侧 HUD 信息栏：标题 / 层数 / 碎片 / 操作按钮
  @Builder
  Sidebar() {
    Column() {
      Button('← 返回')
        .fontSize(14)
        .backgroundColor('#1a2238')
        .fontColor('#22d3a8')
        .height(40)
        .width('100%')
        .onClick(() => {
          router.back();
        })

      // 标题区
      Text('TauRealmMaze')
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor('#22d3a8')
        .margin({ top: 36, bottom: 4 })
      Text('韬略 · 指令流水线')
        .fontSize(12)
        .fontColor('#5a7088')
        .margin({ bottom: 32 })

      // 当前层（机器语义名 + Layer 序号）
      Text('当前存储层级')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(layerName(this.currentLayer))
        .fontSize(18)
        .fontColor('#22d3a8')
        .margin({ top: 4, bottom: 1 })
      Text('Layer ' + this.currentLayer + ' / ' + (this.TARGET_LAYERS - 1))
        .fontSize(11)
        .fontColor('#5a7088')
        .margin({ bottom: 24 })

      // 当前层操作数（LOAD）计数
      Text('操作数 LOAD')
        .fontSize(12)
        .fontColor('#5a7088')
      Text('◆ ' + this.currentFragments + ' / ' + this.currentFragmentTotal)
        .fontSize(20)
        .fontColor('#ffd166')
        .margin({ top: 4, bottom: 24 })

      // 本层热量（蓝→黄→红阶梯）
      Text('本层热量')
        .fontSize(12)
        .fontColor('#5a7088')
      Progress({ value: this.currentHeat, total: this.heatMax, type: ProgressType.Linear })
        .color(this.heatColor())
        .style({ strokeWidth: 8 })
        .width('100%')
        .margin({ top: 6 })
      Text(Math.floor(this.currentHeat) + ' / ' + this.heatMax
          + (this.currentHeat >= 80 ? '  · 过热！' : ''))
        .fontSize(14)
        .fontColor(this.heatColor())
        .margin({ top: 4, bottom: 24 })

      // 分支预测刷新倒计时（每 20 步触发一次动态重构 = BRANCH MISPRED）
      Text('分支预测刷新')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(this.stepsUntilRestructure + ' 步')
        .fontSize(20)
        .fontColor('#ff9a40')
        .margin({ top: 4, bottom: 24 })

      // τ 仪表：实际 / 理论最优（CPI = 实际/最优，结算时评级）
      Text('τ / 理论最优')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(this.tau + ' / ' + this.optimalTau + ' cyc')
        .fontSize(18)
        .fontColor('#22d3a8')
        .margin({ top: 4, bottom: 24 })

      Text('总操作数')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(this.totalPicked + ' / ' + this.totalAll)
        .fontSize(16)
        .fontColor('#ffd166')
        .margin({ top: 4 })

      Blank()

      Button('↻ 重生本局')
        .fontSize(14)
        .backgroundColor('#1a2238')
        .fontColor('#22d3a8')
        .height(40)
        .width('100%')
        .onClick(() => {
          this.initEngine();
          this.renderMap();
        })
    }
    .width(240)
    .height('100%')
    .padding({ left: 20, right: 20, top: 24, bottom: 24 })
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(this.SIDEBAR_BG)
  }

  // 右下角浮动 D-Pad（覆盖在 Canvas 之上）
  @Builder
  DPad() {
    Column() {
      // score-algorithm：EXEC 激活键，仅落点为已解锁 VIA / EXIT 时点亮
      Button(this.interactLabel())
        .width(132)
        .height(44)
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .backgroundColor(this.canInteract ? '#ffd24a' : '#1a2238aa')
        .fontColor(this.canInteract ? '#0a0e1a' : '#5a7088')
        .enabled(this.canInteract)
        .margin({ bottom: 14 })
        .onClick(() => { this.handleInteract(); })

      Row() {
        Button('↑').width(56).height(48).fontSize(20)
          .backgroundColor('#1a2238dd').fontColor('#22d3a8')
          .onClick(() => { this.handleDpad(0, -1); })
      }
      .justifyContent(FlexAlign.Center)

      Row() {
        Button('←').width(56).height(48).fontSize(20)
          .backgroundColor('#1a2238dd').fontColor('#22d3a8')
          .onClick(() => { this.handleDpad(-1, 0); })
        Button('↓').width(56).height(48).fontSize(20)
          .backgroundColor('#1a2238dd').fontColor('#22d3a8')
          .margin({ left: 8, right: 8 })
          .onClick(() => { this.handleDpad(0, 1); })
        Button('→').width(56).height(48).fontSize(20)
          .backgroundColor('#1a2238dd').fontColor('#22d3a8')
          .onClick(() => { this.handleDpad(1, 0); })
      }
      .margin({ top: 8 })
    }
    .margin({ right: 40, bottom: 40 })
  }

  build() {
    Row() {
      // 左：HUD 信息栏（固定宽度）
      this.Sidebar()

      // 右：游戏区（Canvas + 右下 DPad 浮层）
      Stack({ alignContent: Alignment.BottomEnd }) {
        Canvas(this.ctx)
          .width('100%')
          .height('100%')
          .backgroundColor(this.BG_COLOR)
          .onReady(() => {
            this.renderMap();
          })

        this.DPad()

        // 右下角音乐面板（D-Pad 左侧）
        Column() {
          MusicPanel()
        }
        .position({ left: 24, bottom: 24 })
      }
      .layoutWeight(1)
      .height('100%')
      .gesture(
        PanGesture({ direction: PanDirection.All, distance: 10 })
          .onActionEnd((event: GestureEvent) => {
            this.handleSwipe(event.offsetX, event.offsetY);
          })
      )
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.BG_COLOR)
  }
}
