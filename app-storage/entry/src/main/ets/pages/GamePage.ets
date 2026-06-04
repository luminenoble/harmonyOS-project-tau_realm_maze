// 游戏主页面：平板专用横屏布局
// 左侧固定信息栏（返回 / 层 / 操作数 / 热量 / CPI / 重生）
// 右侧 Stack：Canvas 全屏 + 顶部持有条 + 右下 D-Pad + 点击信息面板 + 指令抽屉
// 指令重构：从 ProgramStore 读取本局指令序列构建地图；CPI=(步数+延迟)/指令数
import { router } from '@kit.ArkUI';
import { IsoConfig, screenToGrid, GridPoint } from '../utils/IsoMath';
import { drawMap, drawRestructurePulse, drawInteractHighlight } from '../game/render/IsoRenderer';
import { drawFade, drawWarningOverlay, drawViaProgressBar, drawShutterFold } from '../game/render/UIOverlay';
import { MapManager } from '../game/core/MapManager';
import { GameEngine, VictoryStats } from '../game/core/GameEngine';
import { MusicPanel } from '../components/MusicPanel';
import { HoldingBar } from '../components/HoldingBar';
import { InfoPanel } from '../components/InfoPanel';
import { InstructionDrawer } from '../components/InstructionDrawer';
import { layerName, tierShort, tierCacheName } from '../game/data/Semantics';
import {
  InstructionProgram, Instruction, difficultyConfig,
  aluOpName, fragmentKindName
} from '../game/data/Instruction';
import { ProgramPlan } from '../utils/InstructionGraph';
import { getProgram, getPlan } from '../utils/ProgramStore';
import { Tile, TileType } from '../game/types/TileType';

@Entry
@Component
struct GamePage {
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  // new-design 8.1：网格升到 19×19（逻辑 9×9 cell）
  private readonly GRID_COLS: number = 19;
  private readonly GRID_ROWS: number = 19;
  private readonly BG_COLOR: string = '#0a0e1a';
  private readonly SIDEBAR_BG: string = '#0d1424';
  private readonly TARGET_LAYERS: number = 3;
  private readonly SWIPE_THRESHOLD: number = 24;

  private engine: GameEngine | null = null;
  // 本局指令程序（来自 ProgramStore；可能为 null → 引擎用碎片数兜底）
  private program: InstructionProgram | null = null;
  // 最近一帧的等距参数（点击命中测试复用）
  private lastCfg: IsoConfig | null = null;
  // 触摸按下坐标（区分点击 / 滑动）
  private touchDownX: number = 0;
  private touchDownY: number = 0;

  // HUD 状态
  @State currentLayer: number = 0;
  @State currentFragments: number = 0;
  @State currentFragmentTotal: number = 0;
  @State stepsUntilRestructure: number = 20;
  @State currentHeat: number = 0;
  @State heatMax: number = 100;
  @State tau: number = 0;
  @State totalPicked: number = 0;
  @State totalAll: number = 0;
  @State canInteract: boolean = false;
  @State interactHint: string = '';
  // 理论最优 τ（CPI 评级基准分母）
  @State optimalTau: number = 1;

  // 指令重构 HUD
  @State heldLabels: string[] = [];
  @State nextInstr: string = '';
  @State progressText: string = '0 / 0';
  @State cpi: number = 0;
  @State executedCount: number = 0;
  @State instrType: string = '';
  @State fromFallback: boolean = false;
  @State instructions: Instruction[] = [];

  // 面板可见性 + 信息卡内容
  @State showDrawer: boolean = false;
  @State showInfo: boolean = false;
  @State infoTitle: string = '';
  @State infoBody: string = '';
  @State infoAccent: string = '#22d3a8';

  aboutToAppear(): void {
    this.program = getProgram();
    this.initEngine();
  }

  aboutToDisappear(): void {
    if (this.engine !== null) {
      this.engine.stop();
    }
  }

  // 构造引擎与地图（aboutToAppear 与"重生"复用）
  private initEngine(): void {
    if (this.engine !== null) {
      this.engine.stop();
    }
    const plan: ProgramPlan | null = getPlan();
    // 难度化每层碎片数（无程序则默认 3）
    const fragPerLayer: number = this.program !== null
      ? difficultyConfig(this.program.difficulty).fragmentsPerLayer : 3;

    const map: MapManager = new MapManager(
      this.GRID_COLS, this.GRID_ROWS, this.TARGET_LAYERS, undefined,
      plan, fragPerLayer, 1
    );
    this.engine = new GameEngine(map, this.program, 1, 1);

    // 指令序列展示数据
    this.instructions = this.program !== null ? this.program.instructions : [];
    this.instrType = this.program !== null ? this.program.instrType : '机器指令执行';
    this.fromFallback = this.program !== null ? this.program.fromFallback : false;

    this.syncFromEngine(true);

    const e: GameEngine = this.engine as GameEngine;
    e.setTickCallback(() => {
      this.syncFromEngine(false);
      this.renderMap();
    });
    e.setFragmentPickedCallback((factText: string) => {
      this.syncFromEngine(false);
      AlertDialog.show({
        title: '指令执行',
        message: factText,
        autoCancel: true,
        confirm: { value: '继续', action: () => {} }
      });
    });
    e.setExitHintCallback((hint: string) => {
      AlertDialog.show({
        title: '终点未就绪',
        message: hint,
        autoCancel: true,
        confirm: { value: '继续探索', action: () => {} }
      });
    });
    e.setHazardCallback((hint: string) => {
      this.syncFromEngine(false);
      AlertDialog.show({
        title: 'RAW 数据冒险',
        message: hint,
        autoCancel: true,
        confirm: { value: '重新装载', action: () => {} }
      });
    });
    e.setVictoryCallback((stats: VictoryStats) => {
      router.replaceUrl({ url: 'pages/ResultPage', params: stats });
    });
  }

  // 从引擎同步状态到 @State；force=true 时全量刷新
  private syncFromEngine(force: boolean): void {
    if (this.engine === null) {
      return;
    }
    const e: GameEngine = this.engine as GameEngine;
    if (force || this.currentLayer !== e.currentLayer) {
      this.currentLayer = e.currentLayer;
      this.currentFragments = e.currentFragments;
      this.currentFragmentTotal = e.currentFragmentTotal;
    }
    this.stepsUntilRestructure = e.stepsUntilRestructure;
    this.currentHeat = e.currentHeat;
    this.heatMax = e.currentHeatMax;
    this.tau = e.tau;
    this.totalPicked = e.totalFragmentsPicked;
    this.totalAll = e.totalFragmentsAll;
    this.optimalTau = e.optimalTau;
    this.canInteract = e.canInteract;
    this.interactHint = e.interactHint;
    // 指令状态：持有条 / 进度 / CPI（每 tick 用新数组触发刷新）
    this.heldLabels = e.heldLabels;
    this.executedCount = e.executedCount;
    this.cpi = e.cpi;
    this.progressText = e.executedCount + ' / ' + e.totalInstr;
    this.nextInstr = this.computeNextInstr(e.executedCount);
  }

  // 下一条待执行指令文案（按程序顺序近似取第 executedCount 条）
  private computeNextInstr(executed: number): string {
    if (this.instructions.length === 0) {
      return '';
    }
    const idx: number = executed < this.instructions.length ? executed : this.instructions.length - 1;
    const ins: Instruction = this.instructions[idx];
    return ins.mnemonic + ' ' + ins.operands;
  }

  // 渲染入口
  private renderMap(): void {
    const w: number = this.ctx.width;
    const h: number = this.ctx.height;

    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = this.BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    // 自适应瓦片半宽：19×19 更大，上限降到 28 vp 以容纳全图
    const maxHalfW: number = Math.floor((w - 40) / (this.GRID_COLS + this.GRID_ROWS));
    const halfW: number = Math.min(28, Math.max(6, maxHalfW));
    const halfH: number = Math.floor(halfW / 2);
    const wallH: number = Math.max(4, Math.floor(halfW * 0.45));

    const contentH: number = this.TARGET_LAYERS * wallH + (this.GRID_COLS + this.GRID_ROWS) * halfH;
    const topMargin: number = Math.max(0, (h - contentH) / 2);
    const originX: number = w / 2;
    const originY: number = topMargin + this.TARGET_LAYERS * wallH + halfH;

    const cfg: IsoConfig = new IsoConfig(halfW, halfH, -wallH, originX, originY);
    this.lastCfg = cfg;

    if (this.engine === null) {
      return;
    }
    const e: GameEngine = this.engine as GameEngine;

    drawMap(this.ctx, e.map, cfg, wallH, e.currentLayer, e.player, wallH * 0.6);
    drawRestructurePulse(
      this.ctx, cfg, e.currentLayer,
      e.lastOpenedCells, e.lastClosedCells, e.pulseAlpha, wallH
    );
    if (e.canInteract) {
      drawInteractHighlight(
        this.ctx, cfg, e.currentLayer, e.player.col, e.player.row,
        (Date.now() % 1600) / 1600
      );
    }
    drawWarningOverlay(this.ctx, w, h, e.warnPulseAlpha);
    if (e.isViaWaiting) {
      drawViaProgressBar(this.ctx, w, h, e.viaWaitTierValue, e.viaWaitProgress);
    }
    if (e.isViaTransition) {
      drawShutterFold(this.ctx, w, h, e.transitionAlpha);
    } else {
      drawFade(this.ctx, w, h, e.transitionAlpha);
    }
  }

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

  private handleDpad(dCol: number, dRow: number): void {
    if (this.engine === null) {
      return;
    }
    (this.engine as GameEngine).tryMove(dCol, dRow);
  }

  private handleInteract(): void {
    if (this.engine === null) {
      return;
    }
    (this.engine as GameEngine).tryInteract();
  }

  // 取触摸事件第一个触点坐标（相对 Canvas）
  private firstTouchXY(event: TouchEvent): number[] | null {
    if (event.changedTouches !== undefined && event.changedTouches.length > 0) {
      return [event.changedTouches[0].x, event.changedTouches[0].y];
    }
    if (event.touches !== undefined && event.touches.length > 0) {
      return [event.touches[0].x, event.touches[0].y];
    }
    return null;
  }

  // 点击命中测试：屏幕坐标 → 网格 → 查瓦片 → 弹信息卡
  private handleTap(x: number, y: number): void {
    if (this.engine === null || this.lastCfg === null) {
      return;
    }
    const e: GameEngine = this.engine as GameEngine;
    const cfg: IsoConfig = this.lastCfg as IsoConfig;
    const g: GridPoint = screenToGrid(x, y, e.currentLayer, cfg);
    const col: number = Math.round(g.col);
    const row: number = Math.round(g.row);
    const tile: Tile | undefined = e.map.getTile(col, row, e.currentLayer);
    if (tile === undefined) {
      return;
    }
    this.openInfoForTile(tile);
  }

  // 按瓦片类型填充信息卡
  private openInfoForTile(tile: Tile): void {
    let title: string = '';
    let body: string = '';
    let accent: string = '#22d3a8';
    if (tile.type === TileType.FRAGMENT) {
      const label: string = tile.operandLabel.length > 0 ? tile.operandLabel : '操作数';
      title = label + ' — ' + fragmentKindName(tile.fragKind);
      accent = '#4aa3ff';
      body = '类型：' + fragmentKindName(tile.fragKind) + '\n'
        + '作用：执行 LOAD/MOV 将该值装入寄存器文件\n'
        + (tile.instrIndex > 0 ? '来源指令：第 ' + tile.instrIndex + ' 条' : '');
    } else if (tile.type === TileType.GATE) {
      const op: string = aluOpName(tile.aluOp);
      title = op + ' 门';
      accent = tile.locked ? '#d63b3b' : '#22d3a8';
      body = '运算：' + op + (tile.aluOperands.length > 0 ? '  ' + tile.aluOperands : '') + '\n'
        + '通过条件：持有源操作数后执行 ALU 运算\n'
        + '通过后生成结果寄存器（替换源操作数）';
    } else if (tile.type === TileType.VIA) {
      const up: boolean = tile.viaTarget > this.currentLayer;
      title = tierCacheName(tile.viaTier) + ' — ' + (up ? 'CALL' : 'RET');
      accent = '#ffd24a';
      body = '缓存命中：' + tierCacheName(tile.viaTier) + '\n'
        + '行为：' + (up ? 'CALL 跨层跳转（上行）' : 'RET 返回（下行）') + '\n'
        + (tile.locked ? '当前锁定：需集齐本层操作数后解锁' : '已解锁，可激活 EXEC');
    } else if (tile.type === TileType.THERMAL_VIA) {
      title = '散热通道';
      accent = '#a8e6ff';
      body = '降热 30（PIPELINE FLUSH 流水线气泡）\n单次使用，踩踏后烧毁';
    } else if (tile.type === TileType.RAW_HAZARD) {
      title = 'RAW 数据冒险';
      accent = '#b026ff';
      body = '读后写冒险：踩上失效一个持有寄存器\n需重新 LOAD 对应操作数';
    } else if (tile.type === TileType.EXIT) {
      title = 'STORE / 写回 (WB)';
      accent = '#22d3a8';
      body = '终点 = 写回结果寄存器\n集齐全部操作数后到达即通关';
    } else {
      return;
    }
    this.infoTitle = title;
    this.infoBody = body;
    this.infoAccent = accent;
    this.showInfo = true;
  }

  private interactLabel(): string {
    if (this.interactHint === 'EXIT') {
      return '⏎ WB 写回';
    }
    if (this.interactHint.indexOf('VIA') === 0) {
      const tier: number = Number(this.interactHint.substring(3));
      if (tier === 2) {
        return '⚡ DRAM 访问';
      }
      return '⚡ ' + tierShort(tier) + ' 命中';
    }
    return '· EXEC ·';
  }

  // 热量阶梯色：≥60 红（过热）/ ≥40 黄（警示）/ 其余青绿（凉）
  private heatColor(): string {
    if (this.currentHeat >= 60) {
      return '#ff6b6b';
    }
    if (this.currentHeat >= 40) {
      return '#ffd166';
    }
    return '#22d3a8';
  }

  // CPI 颜色：按评级基准 τ/最优τ 着色（展示 CPI 量级与阈值不兼容，故用比值判级）
  private cpiColor(): string {
    const ratio: number = this.optimalTau > 0 ? this.tau / this.optimalTau : this.cpi;
    if (ratio <= 1.2) {
      return '#ffd24a';
    }
    if (ratio <= 2.0) {
      return '#22d3a8';
    }
    if (ratio <= 4.0) {
      return '#d6dde6';
    }
    return '#ff6b6b';
  }

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

      Text('TauRealmMaze')
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor('#22d3a8')
        .margin({ top: 28, bottom: 4 })
      Text(this.instrType)
        .fontSize(12)
        .fontColor('#5a7088')
        .margin({ bottom: 24 })

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
        .margin({ bottom: 20 })

      Text('本层操作数 LOAD')
        .fontSize(12)
        .fontColor('#5a7088')
      Text('◆ ' + this.currentFragments + ' / ' + this.currentFragmentTotal)
        .fontSize(20)
        .fontColor('#ffd166')
        .margin({ top: 4, bottom: 20 })

      Text('本层热量')
        .fontSize(12)
        .fontColor('#5a7088')
      Progress({ value: this.currentHeat, total: this.heatMax, type: ProgressType.Linear })
        .color(this.heatColor())
        .style({ strokeWidth: 8 })
        .width('100%')
        .margin({ top: 6 })
      Text(Math.floor(this.currentHeat) + ' / ' + this.heatMax
          + (this.currentHeat >= 60 ? '  · 过热！' : ''))
        .fontSize(14)
        .fontColor(this.heatColor())
        .margin({ top: 4, bottom: 20 })

      Text('分支预测刷新')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(this.stepsUntilRestructure + ' 步')
        .fontSize(18)
        .fontColor('#ff9a40')
        .margin({ top: 4, bottom: 20 })

      // CPI 实时仪表（= (步数+延迟)/指令数）
      Text('CPI 实时')
        .fontSize(12)
        .fontColor('#5a7088')
      Text(this.cpi.toFixed(2))
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor(this.cpiColor())
        .margin({ top: 4, bottom: 1 })
      Text('评级基准 τ/最优 ' + (this.optimalTau > 0 ? (this.tau / this.optimalTau).toFixed(2) : '—'))
        .fontSize(10)
        .fontColor('#5a7088')
      Text('指令 ' + this.executedCount + ' / ' + (this.instructions.length > 0 ? this.instructions.length : this.totalAll))
        .fontSize(11)
        .fontColor('#5a7088')
        .margin({ top: 2 })

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
    .width(220)
    .height('100%')
    .padding({ left: 18, right: 18, top: 24, bottom: 24 })
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(this.SIDEBAR_BG)
  }

  @Builder
  DPad() {
    Column() {
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
      this.Sidebar()

      Stack({ alignContent: Alignment.BottomEnd }) {
        Canvas(this.ctx)
          .width('100%')
          .height('100%')
          .backgroundColor(this.BG_COLOR)
          .onReady(() => {
            this.renderMap();
          })
          .onTouch((event: TouchEvent) => {
            const xy: number[] | null = this.firstTouchXY(event);
            if (xy === null) {
              return;
            }
            if (event.type === TouchType.Down) {
              this.touchDownX = xy[0];
              this.touchDownY = xy[1];
            } else if (event.type === TouchType.Up) {
              const dx: number = xy[0] - this.touchDownX;
              const dy: number = xy[1] - this.touchDownY;
              if (Math.abs(dx) < this.SWIPE_THRESHOLD && Math.abs(dy) < this.SWIPE_THRESHOLD) {
                this.handleTap(xy[0], xy[1]);
              }
            }
          })

        // 顶部持有条
        Column() {
          HoldingBar({
            heldLabels: this.heldLabels,
            nextInstr: this.nextInstr,
            progressText: this.progressText
          })
        }
        .width('62%')
        .position({ top: 10, left: 16 })

        // 右上角抽屉开关 ≡
        Button('≡ 指令')
          .fontSize(13)
          .height(36)
          .backgroundColor('#1a2238dd')
          .fontColor('#22d3a8')
          .position({ top: 10, right: 16 })
          .onClick(() => {
            this.showDrawer = !this.showDrawer;
          })

        this.DPad()

        // 音乐面板（D-Pad 左侧）
        Column() {
          MusicPanel()
        }
        .position({ left: 24, bottom: 24 })

        // 点击信息卡（右侧中部）
        if (this.showInfo) {
          Column() {
            InfoPanel({
              title: this.infoTitle,
              body: this.infoBody,
              accent: this.infoAccent,
              onClose: () => { this.showInfo = false; }
            })
          }
          .position({ top: 56, right: 16 })
        }

        // 指令抽屉（右侧全高）
        if (this.showDrawer) {
          Column() {
            InstructionDrawer({
              instructions: this.instructions,
              executedCount: this.executedCount,
              instrType: this.instrType,
              fromFallback: this.fromFallback,
              onClose: () => { this.showDrawer = false; }
            })
          }
          .height('100%')
          .position({ top: 0, right: 0 })
        }
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
