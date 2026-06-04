// 游戏主循环：地图 + 玩家 + 状态机
// Day 4：切层转场；Day 5：碎片 / 逻辑门 / 上行 VIA 锁；Day 6：每 20 步动态重构
// Day 7：VIA 三级缓存等待 + τ 累计 + EXIT 通关回调

import { MapManager } from './MapManager';
import { Player } from './Player';
import { TileType, Tile } from '../types/TileType';
import { GateLogic } from '../puzzle/GateLogic';
import { ViaUnlock } from '../puzzle/ViaUnlock';
import { pickFact } from '../data/ChipFacts';
import { Restructurer, RestructureResult } from './Restructurer';
import { HeatManager } from './HeatManager';
import { Rng } from '../../utils/MazeGenerator';
import { PathOptimizer, OptimalResult } from './PathOptimizer';
import { InstructionProgram, FragmentKind, aluOpName, fragmentKindName } from '../data/Instruction';

// tick 回调类型
export type TickCallback = () => void;
// 拾取碎片回调：传入科普文本，由 GamePage 弹 Dialog
export type FragmentPickedCallback = (factText: string) => void;
// EXIT 落点但条件不足时的提示回调（"还需 N 个碎片"）
export type ExitHintCallback = (hint: string) => void;
// 通关回调：传入结算统计
export type VictoryCallback = (stats: VictoryStats) => void;
// RAW 数据冒险触发回调：传入失效提示文案
export type HazardCallback = (hint: string) => void;

// 通关结算数据；ResultPage 通过 router params 解析展示
// score-algorithm：新增最优路径对照字段，CPI = tau / optimalTau，AI 评语据差值生成
export class VictoryStats {
  steps: number;          // 累计移动步数（玩家实际）
  tauVia: number;         // 所有 VIA 延迟累计（时钟周期）
  tau: number;            // 总 τ = steps + tauVia（玩家实际）
  l1: number;             // L1-VIA 使用次数
  l2: number;
  mem: number;
  heatPeak: number[];     // 各层热量峰值
  optimalTau: number;     // 理论最小总周期（起局求解，CPI 分母）
  optimalSteps: number;   // 理论最优移动步数
  optimalDelay: number;   // 理论最优 VIA 延迟累计
  optimalViaTiers: number[];  // 最优各层上行应选 tier（0/1/2）
  playerViaTiers: number[];   // 玩家各层上行实际选用 tier（按时序）

  // 指令重构新增：CPI = (steps + tauVia) / totalInstr
  totalInstr: number;     // 本局总指令数（CPI 分母）
  instrType: string;      // 运算场景描述（如 "1×2 向量内积"）
  hazards: number;        // RAW 数据冒险触发次数

  constructor(
    steps: number, tauVia: number, tau: number,
    l1: number, l2: number, mem: number, heatPeak: number[],
    optimalTau: number, optimalSteps: number, optimalDelay: number,
    optimalViaTiers: number[], playerViaTiers: number[],
    totalInstr: number, instrType: string, hazards: number
  ) {
    this.steps = steps;
    this.tauVia = tauVia;
    this.tau = tau;
    this.l1 = l1;
    this.l2 = l2;
    this.mem = mem;
    this.heatPeak = heatPeak;
    this.optimalTau = optimalTau;
    this.optimalSteps = optimalSteps;
    this.optimalDelay = optimalDelay;
    this.optimalViaTiers = optimalViaTiers;
    this.playerViaTiers = playerViaTiers;
    this.totalInstr = totalInstr;
    this.instrType = instrType;
    this.hazards = hazards;
  }
}

// 引擎阶段
export enum EnginePhase {
  IDLE = 0,
  MOVING = 1,
  TRANSITION_OUT = 2,
  TRANSITION_IN = 3,
  RESTRUCTURE_WARN = 4,
  RESTRUCTURE_PULSE = 5,
  VIA_WAIT = 6           // Day 7：VIA 延迟等待（含中央进度条）
}

// Day 6 重构参数
const STEPS_PER_RESTRUCTURE: number = 20;
const OPENS_PER_CYCLE: number = 2;
const CLOSES_PER_CYCLE: number = 2;
// Day 6 散热：正常 / 过热移动速度
const SPEED_NORMAL: number = 0.1;
const SPEED_OVERHEATED: number = 0.05;
// Day 7：VIA 等待单位延迟 = 12 tick ≈ 200ms（@16ms tick）
// L1（delay 1）≈ 200ms / L2（delay 3）≈ 600ms / MEM（delay 6）≈ 1200ms
const VIA_TICKS_PER_DELAY: number = 12;

export class GameEngine {
  readonly map: MapManager;
  readonly player: Player;

  // 当前所在层（受 transition swap 影响）
  private _currentLayer: number;
  // 状态机阶段
  private phase: EnginePhase;
  // 转场进度 0..1（仅 TRANSITION_* 阶段有意义）
  private transitionT: number;
  // 转场进度每 tick 增量（0.05 → 20 tick ≈ 320ms 每阶段）
  private readonly TRANSITION_SPEED: number = 0.05;

  // 重构动效进度（WARN 与 PULSE 复用同一变量）
  private restructureT: number;
  private readonly RESTRUCTURE_SPEED: number = 1.0 / 30;  // 30 tick ≈ 480ms

  // Day 7：VIA 等待进度 0..1，对应等待动画 + UI 进度条
  private viaWaitT: number;
  // 每 tick 增量；按当前 VIA tier 的 delay 计算（在进入 VIA_WAIT 时 set）
  private viaWaitSpeed: number;
  // 当前正在等待的 VIA tier（仅 VIA_WAIT 阶段语义有效；其余 -1）
  private viaWaitTier: number;

  // 每层已拾取碎片数 / 初始总数
  private _fragments: number[];
  private _fragmentTotals: number[];
  // 累计拾取计数，用于科普文本循环取
  private _pickedCount: number;
  // 累计成功移动步数（跨层共享）；每 STEPS_PER_RESTRUCTURE 触发一次重构
  private _stepCount: number;

  // Day 7：VIA 三级使用次数 [L1, L2, MEM] + 延迟累计；各层热峰
  private _viaCounts: number[];
  private _tauVia: number;
  private _heatPeak: number[];
  // 防止 EXIT 被多次触发的通关锁
  private _victoryFired: boolean;

  // score-algorithm：起局求解的理论最优 + 玩家实际 VIA tier 时序（评分对照）
  private _optimal: OptimalResult;
  private _playerViaTiers: number[];

  // 上一轮重构改动的 cell 列表（PULSE 阶段渲染层用）
  private _lastOpened: number[][];
  private _lastClosed: number[][];

  // 运行时 RNG：重构与未来动态系统共用
  private _rng: Rng;

  // Day 6 散热
  private _heat: HeatManager;
  // 当前是强制弹层（区别于 VIA 主动切层）；TRANSITION_OUT 末尾根据此标志分支
  private _forcedPop: boolean;
  // Day 8：当前 TRANSITION 是 VIA 主动切层（true → shutter 折叠）还是强制弹层（false → 黑屏 fade）
  // 仅在 isTransitioning() 期间有意义；进入 TRANSITION_OUT 时 set，进 IDLE 时 reset
  private _isViaTransition: boolean;

  // 指令重构：本局总指令数 / 场景 / ALU 通过数 / RAW 触发数
  private _totalInstr: number;
  private _instrType: string;
  private _aluPassed: number;
  private _hazards: number;

  private intervalId: number = -1;
  private onTick: TickCallback;
  private onFragmentPicked: FragmentPickedCallback;
  private onExitHint: ExitHintCallback;
  private onVictory: VictoryCallback;
  private onHazard: HazardCallback;
  private readonly TICK_MS: number = 16;

  // program：本局指令序列（null 则用碎片总数兜底 totalInstr）
  constructor(map: MapManager, program: InstructionProgram | null = null, startCol: number = 1, startRow: number = 1) {
    this.map = map;
    this.player = new Player(startCol, startRow);
    this._currentLayer = 0;
    this.phase = EnginePhase.IDLE;
    this.transitionT = 0;
    this.restructureT = 0;
    this.viaWaitT = 0;
    this.viaWaitSpeed = 0;
    this.viaWaitTier = -1;
    this.onTick = () => {};
    this.onFragmentPicked = () => {};
    this.onExitHint = () => {};
    this.onVictory = () => {};
    this.onHazard = () => {};
    this._pickedCount = 0;
    this._stepCount = 0;
    this._aluPassed = 0;
    this._hazards = 0;
    this._lastOpened = [];
    this._lastClosed = [];
    // 用启动时间 + 起点扰动作 seed，避免每次重生 RNG 序列一致
    this._rng = new Rng(Date.now() ^ ((startCol << 8) | startRow));

    // 散热：三层各自从 0 起跳
    this._heat = new HeatManager(map.layerCount);
    this._forcedPop = false;
    this._isViaTransition = false;

    // Day 7 统计字段
    this._viaCounts = [0, 0, 0];
    this._tauVia = 0;
    this._heatPeak = [];
    for (let L = 0; L < map.layerCount; L++) {
      this._heatPeak.push(0);
    }
    this._victoryFired = false;

    // score-algorithm：起局求解理论最优 τ（作为 CPI 基准，全程不再重算）
    this._optimal = PathOptimizer.solve(map, startCol, startRow);
    this._playerViaTiers = [];

    // 统计每层 FRAGMENT 初始总数
    this._fragments = [];
    this._fragmentTotals = [];
    for (let L = 0; L < map.layerCount; L++) {
      let total: number = 0;
      map.forEach((tile: Tile) => {
        if (tile.type === TileType.FRAGMENT) {
          total++;
        }
      }, L);
      this._fragments.push(0);
      this._fragmentTotals.push(total);
    }

    // 指令重构：总指令数取程序长度；无程序时退化为碎片总数（CPI 分母）
    if (program !== null && program.instructions.length > 0) {
      this._totalInstr = program.instructions.length;
      this._instrType = program.instrType;
    } else {
      let allFrag: number = 0;
      for (let i = 0; i < this._fragmentTotals.length; i++) {
        allFrag += this._fragmentTotals[i];
      }
      this._totalInstr = allFrag > 0 ? allFrag : 1;
      this._instrType = '机器指令执行';
    }
  }

  setTickCallback(cb: TickCallback): void {
    this.onTick = cb;
  }

  setFragmentPickedCallback(cb: FragmentPickedCallback): void {
    this.onFragmentPicked = cb;
  }

  setExitHintCallback(cb: ExitHintCallback): void {
    this.onExitHint = cb;
  }

  setVictoryCallback(cb: VictoryCallback): void {
    this.onVictory = cb;
  }

  setHazardCallback(cb: HazardCallback): void {
    this.onHazard = cb;
  }

  // 指令重构：CPI = (步数 + VIA延迟) / 总指令数（new-design 第七节）
  get cpi(): number {
    if (this._totalInstr <= 0) {
      return this._stepCount + this._tauVia;
    }
    return (this._stepCount + this._tauVia) / this._totalInstr;
  }

  get totalInstr(): number {
    return this._totalInstr;
  }

  get instrType(): string {
    return this._instrType;
  }

  get hazards(): number {
    return this._hazards;
  }

  // 已执行指令数（LOAD 拾取 + ALU 通过）；EXIT 写回在通关时另算
  get executedCount(): number {
    return this.totalFragmentsPicked + this._aluPassed;
  }

  // 当前持有操作数标签列表（HUD 持有条用）
  get heldLabels(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.player.heldOperands.length; i++) {
      out.push(this.player.heldOperands[i].label);
    }
    return out;
  }

  // 暴露给渲染层
  get currentLayer(): number {
    return this._currentLayer;
  }

  // 当前层已拾取 / 总数
  get currentFragments(): number {
    return this._fragments[this._currentLayer];
  }

  get currentFragmentTotal(): number {
    return this._fragmentTotals[this._currentLayer];
  }

  // 累计步数 + 距下一次重构的剩余步数（HUD 用）
  get stepCount(): number {
    return this._stepCount;
  }

  // 范围 [1, STEPS_PER_RESTRUCTURE]：触发后立刻 reset 到 STEPS_PER_RESTRUCTURE
  get stepsUntilRestructure(): number {
    const mod: number = this._stepCount % STEPS_PER_RESTRUCTURE;
    return mod === 0 ? STEPS_PER_RESTRUCTURE : STEPS_PER_RESTRUCTURE - mod;
  }

  // Day 7：τ 仪表（步数 + VIA 延迟累计）
  get tau(): number {
    return this._stepCount + this._tauVia;
  }

  get tauVia(): number {
    return this._tauVia;
  }

  // score-algorithm：理论最优 τ（CPI 基准）+ 是否成功求解，供 HUD/结算引用
  get optimalTau(): number {
    return this._optimal.optimalTau;
  }

  get optimalSolvable(): boolean {
    return this._optimal.solvable;
  }

  // 跨层碎片总和（用于 EXIT 通关条件）
  get totalFragmentsPicked(): number {
    let s: number = 0;
    for (let i = 0; i < this._fragments.length; i++) {
      s += this._fragments[i];
    }
    return s;
  }

  get totalFragmentsAll(): number {
    let s: number = 0;
    for (let i = 0; i < this._fragmentTotals.length; i++) {
      s += this._fragmentTotals[i];
    }
    return s;
  }

  // 转场覆盖层 alpha：0 = 不显示，1 = 全黑
  get transitionAlpha(): number {
    if (this.phase === EnginePhase.TRANSITION_OUT) {
      return this.transitionT;
    }
    if (this.phase === EnginePhase.TRANSITION_IN) {
      return 1 - this.transitionT;
    }
    return 0;
  }

  // 警告期红屏 sin 脉冲 alpha（仅 WARN 阶段非零）
  // 基础 0.35 + 振幅 0.2·sin(t·π·4)，整段呈现 2 次脉冲
  get warnPulseAlpha(): number {
    if (this.phase !== EnginePhase.RESTRUCTURE_WARN) {
      return 0;
    }
    return 0.35 + 0.2 * Math.sin(this.restructureT * Math.PI * 4);
  }

  // 改动 cell 高亮 alpha（仅 PULSE 阶段非零，1→0 渐隐）
  get pulseAlpha(): number {
    if (this.phase !== EnginePhase.RESTRUCTURE_PULSE) {
      return 0;
    }
    return 1 - this.restructureT;
  }

  get lastOpenedCells(): number[][] {
    return this._lastOpened;
  }

  get lastClosedCells(): number[][] {
    return this._lastClosed;
  }

  // Day 6 散热：当前层热量值与状态
  get currentHeat(): number {
    return this._heat.getHeat(this._currentLayer);
  }

  get currentHeatMax(): number {
    return HeatManager.MAX;
  }

  get isOverheated(): boolean {
    return this._heat.isOverheated(this._currentLayer);
  }

  // 强制弹层动画进行中（视觉 banner 用）
  get isForcedPopping(): boolean {
    return this._forcedPop;
  }

  // Day 8：当前 TRANSITION 是 VIA 主动切层（GamePage 据此选 shutter vs fade）
  get isViaTransition(): boolean {
    return this._isViaTransition;
  }

  // Day 7：VIA 等待中（用于 UI 决定是否画中央进度条）
  get isViaWaiting(): boolean {
    return this.phase === EnginePhase.VIA_WAIT;
  }

  get viaWaitProgress(): number {
    if (this.phase !== EnginePhase.VIA_WAIT) {
      return 0;
    }
    return this.viaWaitT;
  }

  // 当前等待的 VIA tier；仅 VIA_WAIT 期有效（其余 -1）
  get viaWaitTierValue(): number {
    return this.viaWaitTier;
  }

  // 是否正在转场（用于 UI 决定是否禁用输入指示）
  isTransitioning(): boolean {
    return this.phase === EnginePhase.TRANSITION_OUT
        || this.phase === EnginePhase.TRANSITION_IN;
  }

  // 是否正在执行重构（WARN 或 PULSE）
  isRestructuring(): boolean {
    return this.phase === EnginePhase.RESTRUCTURE_WARN
        || this.phase === EnginePhase.RESTRUCTURE_PULSE;
  }

  // 尝试朝指定方向移动；仅 IDLE 时接受输入
  // 目标格若为锁定 GATE 直接拒绝（与撞墙同语义）
  tryMove(dCol: number, dRow: number): boolean {
    if (this.phase !== EnginePhase.IDLE) {
      return false;
    }
    const tc: number = this.player.col + dCol;
    const tr: number = this.player.row + dRow;
    const tile: Tile | undefined = this.map.getTile(tc, tr, this._currentLayer);
    if (tile === undefined) {
      return false;
    }
    if (tile.type === TileType.WALL) {
      return false;
    }
    // ALU 门：持有操作数 ≥ 阈值才能"执行"通过
    if (!GateLogic.canPass(tile, this.player.heldOperands.length)) {
      return false;
    }
    // Day 6 散热：升温先于移动，过热即时减速；底层 ×2 倍率在 HeatManager 内部处理
    this._heat.tickStep(this._currentLayer);
    // Day 7：升温后立刻更新热峰
    this.updateHeatPeak();
    const speed: number = this._heat.isOverheated(this._currentLayer)
      ? SPEED_OVERHEATED : SPEED_NORMAL;
    this.player.setSpeed(speed);

    this.player.startMove(dCol, dRow);
    this.phase = EnginePhase.MOVING;
    this._stepCount++;
    this.startLoop();
    return true;
  }

  // score-algorithm：玩家当前落点瓦片（IDLE 交互判定共用）
  private currentTile(): Tile | undefined {
    return this.map.getTile(this.player.col, this.player.row, this._currentLayer);
  }

  // 当前落点是否可激活（VIA 已解锁 / EXIT）；UI 据此点亮 EXEC 按钮
  get canInteract(): boolean {
    if (this.phase !== EnginePhase.IDLE) {
      return false;
    }
    const tile: Tile | undefined = this.currentTile();
    if (tile === undefined) {
      return false;
    }
    if (tile.type === TileType.VIA && tile.viaTarget >= 0) {
      return ViaUnlock.canTrigger(
        tile, this._currentLayer, this._fragments[this._currentLayer],
        this._fragmentTotals[this._currentLayer]
      );
    }
    // EXIT 始终可"尝试"激活：碎片不足时按下给提示
    if (tile.type === TileType.EXIT) {
      return true;
    }
    return false;
  }

  // 落点交互类型提示，供 UI 决定按钮文案：'' / 'EXIT' / 'VIA0'|'VIA1'|'VIA2'（数字=tier）
  get interactHint(): string {
    if (!this.canInteract) {
      return '';
    }
    const tile: Tile | undefined = this.currentTile();
    if (tile === undefined) {
      return '';
    }
    if (tile.type === TileType.EXIT) {
      return 'EXIT';
    }
    if (tile.type === TileType.VIA) {
      return 'VIA' + tile.viaTier;
    }
    return '';
  }

  // 玩家主动激活当前落点：VIA → 缓存命中等待 + 切层；EXIT → 写回通关 / 碎片不足提示
  // 仅 IDLE 接受；非可交互格返回 false。原落点自动触发逻辑迁移至此
  tryInteract(): boolean {
    if (this.phase !== EnginePhase.IDLE) {
      return false;
    }
    const tile: Tile | undefined = this.currentTile();
    if (tile === undefined) {
      return false;
    }

    // VIA：已解锁 → 累计 tier 使用 + τ 延迟，进 VIA_WAIT
    if (tile.type === TileType.VIA && tile.viaTarget >= 0) {
      if (!ViaUnlock.canTrigger(
        tile, this._currentLayer, this._fragments[this._currentLayer],
        this._fragmentTotals[this._currentLayer]
      )) {
        return false;
      }
      const tier: number = tile.viaTier;
      if (tier >= 0 && tier < 3) {
        this._viaCounts[tier]++;
      }
      // 记录玩家缓存选择时序，供结算对照最优 tier 序列
      this._playerViaTiers.push(tier);
      const delay: number = ViaUnlock.getTierDelay(tier);
      this._tauVia += delay;
      // 进 VIA_WAIT；速率按 delay 反比，让 MEM 等得更久
      this.viaWaitTier = tier;
      this.viaWaitT = 0;
      this.viaWaitSpeed = 1 / (delay * VIA_TICKS_PER_DELAY);
      this.phase = EnginePhase.VIA_WAIT;
      // IDLE 时 loop 已停，需重新拉起以推进 VIA_WAIT → 切层
      this.startLoop();
      return true;
    }

    // EXIT：集齐全部碎片 → 写回（WB）通关；否则提示一次
    if (tile.type === TileType.EXIT) {
      if (this.totalFragmentsPicked >= this.totalFragmentsAll) {
        this.fireVictory();
        return true;
      }
      const lack: number = this.totalFragmentsAll - this.totalFragmentsPicked;
      this.onExitHint('终点链路已就位，但还差 ' + lack + ' 个信号碎片。');
      return false;
    }

    return false;
  }

  // 推进一帧：根据当前 phase 分派
  private advance(): void {
    if (this.phase === EnginePhase.MOVING) {
      const stillAnimating: boolean = this.player.tick();
      if (!stillAnimating) {
        this.onPlayerLanded();
      }
    } else if (this.phase === EnginePhase.VIA_WAIT) {
      // Day 7：VIA 时钟周期等待；t→1 进入 TRANSITION_OUT
      this.viaWaitT += this.viaWaitSpeed;
      if (this.viaWaitT >= 1) {
        this.viaWaitT = 1;
        this.viaWaitTier = -1;
        // Day 8：VIA 触发的转场标记为 shutter
        this._isViaTransition = true;
        this.phase = EnginePhase.TRANSITION_OUT;
        this.transitionT = 0;
      }
    } else if (this.phase === EnginePhase.TRANSITION_OUT) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        // 黑屏瞬间换层：强制弹层 vs VIA 主动切层两支
        if (this._forcedPop) {
          // 离开层热量清零（玩家"凉下来"才能再回）；
          // 落到下层「与当前位置最近的 FLOOR」而非 (1,1)，避免被强制弹层一路打回起点
          const lower: number = this._currentLayer - 1;
          const safe: number[] = this.findNearestFloor(lower, this.player.col, this.player.row);
          this._heat.reset(this._currentLayer);
          this._currentLayer = lower;
          this.player.col = safe[0];
          this.player.row = safe[1];
          this._forcedPop = false;
        } else {
          const tile: Tile | undefined = this.map.getTile(
            this.player.col, this.player.row, this._currentLayer
          );
          if (tile !== undefined && tile.viaTarget >= 0) {
            this._currentLayer = tile.viaTarget;
          }
        }
        // Day 8：换层瞬间清残影（残影属于上一层）
        this.player.clearTrail();
        this.phase = EnginePhase.TRANSITION_IN;
        this.transitionT = 0;
      }
    } else if (this.phase === EnginePhase.TRANSITION_IN) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        this.phase = EnginePhase.IDLE;
        // Day 8：转场结束清 VIA shutter 标记
        this._isViaTransition = false;
        // 切层完成后：先看新层是否也已经过热（连环弹层），再看是否触发重构
        if (this.maybeForcePop()) {
          return;
        }
        this.maybeStartRestructure();
      }
    } else if (this.phase === EnginePhase.RESTRUCTURE_WARN) {
      this.restructureT += this.RESTRUCTURE_SPEED;
      if (this.restructureT >= 1) {
        this.restructureT = 1;
        // WARN 末尾一次性 apply，紧接 PULSE
        this.applyRestructure();
        this.phase = EnginePhase.RESTRUCTURE_PULSE;
        this.restructureT = 0;
      }
    } else if (this.phase === EnginePhase.RESTRUCTURE_PULSE) {
      this.restructureT += this.RESTRUCTURE_SPEED;
      if (this.restructureT >= 1) {
        this.restructureT = 1;
        this.phase = EnginePhase.IDLE;
      }
    }
  }

  // 玩家移动结束：依次检测 FRAGMENT / THERMAL / VIA / EXIT；最后检查是否触发重构
  private onPlayerLanded(): void {
    const tile: Tile | undefined = this.map.getTile(
      this.player.col, this.player.row, this._currentLayer
    );
    if (tile === undefined) {
      this.phase = EnginePhase.IDLE;
      this.maybeStartRestructure();
      return;
    }

    // 1) 碎片拾取 = 执行一条 LOAD/MOV：把操作数装入持有列表
    if (tile.type === TileType.FRAGMENT) {
      const label: string = tile.operandLabel.length > 0 ? tile.operandLabel : '操作数';
      const kind: number = tile.fragKind >= 0 ? tile.fragKind : FragmentKind.REGISTER;
      this.player.addOperand(label, kind);
      tile.type = TileType.FLOOR;
      tile.locked = false;
      tile.fragKind = -1;
      tile.operandLabel = '';
      this._fragments[this._currentLayer]++;
      this._pickedCount++;
      const count: number = this._fragments[this._currentLayer];
      // ALU 门按持有操作数解锁；上行 VIA 按本层碎片全收集解锁（阈值=本层碎片总数，随难度变化）
      GateLogic.unlockAllInLayer(this.map, this._currentLayer, this.player.heldOperands.length);
      ViaUnlock.unlockAllInLayer(this.map, this._currentLayer, count, this._fragmentTotals[this._currentLayer]);
      this.onFragmentPicked(this.loadFactText(label, kind));
      this.phase = EnginePhase.IDLE;
      if (this.maybeForcePop()) {
        return;
      }
      this.maybeStartRestructure();
      return;
    }

    // 1.5) ALU 门通过 = 执行一条运算指令：累计 + 生成结果寄存器 + 门化为通路
    if (tile.type === TileType.GATE && tile.aluOp >= 0) {
      this._aluPassed++;
      // 结果寄存器入持有（替换被消耗的源，简化为净增一项，避免软锁）
      this.player.addOperand('r' + tile.instrIndex, FragmentKind.REGISTER);
      const opName: string = aluOpName(tile.aluOp);
      const src: string = tile.aluOperands.length > 0 ? tile.aluOperands : '源操作数';
      tile.type = TileType.FLOOR;
      tile.locked = false;
      tile.aluOp = -1;
      this.onFragmentPicked('ALU ' + opName + ' 执行：' + src + ' → r' + tile.instrIndex + '（结果寄存器已生成）');
      this.phase = EnginePhase.IDLE;
      if (this.maybeForcePop()) {
        return;
      }
      this.maybeStartRestructure();
      return;
    }

    // 1.6) RAW 数据冒险：失效一个持有寄存器（模拟读后写气泡），单次烧毁
    if (tile.type === TileType.RAW_HAZARD) {
      const lost: string = this.player.invalidateOneOperand();
      this._hazards++;
      tile.type = TileType.FLOOR;
      tile.locked = false;
      const msg: string = lost.length > 0
        ? 'RAW 数据冒险：寄存器 ' + lost + ' 值失效，需重新 LOAD。'
        : 'RAW 数据冒险：流水线气泡，无持有寄存器受影响。';
      this.onHazard(msg);
      this.phase = EnginePhase.IDLE;
      if (this.maybeForcePop()) {
        return;
      }
      this.maybeStartRestructure();
      return;
    }

    // 2) 散热通道：本层热量 -30，单次消耗（Day 7 fix）
    // 之前设计成永久可用，玩家可在两格间反复横跳无限降温，散热压力失效
    // 现在踩一次即烧毁：tile 改 FLOOR，重构系统因此也能把该格关闭（不再算特殊瓦片）
    if (tile.type === TileType.THERMAL_VIA) {
      this._heat.cool(this._currentLayer);
      tile.type = TileType.FLOOR;
      tile.locked = false;
      this.phase = EnginePhase.IDLE;
      this.maybeStartRestructure();
      return;
    }

    // 3) VIA / EXIT：score-algorithm 起改为「落点不自动触发」，需玩家按激活键
    //    缓存命中（L1$/L2$/DRAM）与写回（WB）都是指令的显式动作，见 tryInteract()
    //    这里仅停在格上回 IDLE，由 UI 点亮激活按钮等待玩家确认

    this.phase = EnginePhase.IDLE;
    // 检查过热强制弹层（优先级高于重构）
    if (this.maybeForcePop()) {
      return;
    }
    this.maybeStartRestructure();
  }

  // LOAD 操作数提示文案：操作数标签 + 皮肤类型 + 一条芯片科普
  private loadFactText(label: string, kind: number): string {
    return 'LOAD ' + label + '（' + fragmentKindName(kind) + '）装入寄存器文件。\n'
      + pickFact(this._pickedCount - 1);
  }

  // Day 7：触发通关；幂等，只回调一次
  private fireVictory(): void {
    if (this._victoryFired) {
      return;
    }
    this._victoryFired = true;
    // 通关瞬间也更新一次热峰（保底，避免最后一步未刷新）
    this.updateHeatPeak();
    const peakCopy: number[] = [];
    for (let i = 0; i < this._heatPeak.length; i++) {
      peakCopy.push(this._heatPeak[i]);
    }
    // score-algorithm：拷贝最优 tier 序列 + 玩家 tier 序列，随结算下发
    const optTiersCopy: number[] = [];
    for (let i = 0; i < this._optimal.viaTiers.length; i++) {
      optTiersCopy.push(this._optimal.viaTiers[i]);
    }
    const playerTiersCopy: number[] = [];
    for (let i = 0; i < this._playerViaTiers.length; i++) {
      playerTiersCopy.push(this._playerViaTiers[i]);
    }
    const stats: VictoryStats = new VictoryStats(
      this._stepCount, this._tauVia, this.tau,
      this._viaCounts[0], this._viaCounts[1], this._viaCounts[2], peakCopy,
      this._optimal.optimalTau, this._optimal.optimalSteps, this._optimal.optimalDelay,
      optTiersCopy, playerTiersCopy,
      this._totalInstr, this._instrType, this._hazards
    );
    this.phase = EnginePhase.IDLE;
    // 停 loop，等待 GamePage 路由跳转
    this.stopLoop();
    this.onVictory(stats);
  }

  // 检查是否触发过热强制弹层；返回 true 表示已进入 TRANSITION_OUT
  // Layer 0 无下层可弹，仅 cap 不触发动画
  private maybeForcePop(): boolean {
    if (!this._heat.isForcedPop(this._currentLayer)) {
      return false;
    }
    if (this._currentLayer === 0) {
      return false;
    }
    this._forcedPop = true;
    // Day 8：强制弹层使用经典黑屏 fade，与 VIA shutter 区分
    this._isViaTransition = false;
    this.phase = EnginePhase.TRANSITION_OUT;
    this.transitionT = 0;
    this.startLoop();
    return true;
  }

  // 每 STEPS_PER_RESTRUCTURE 步触发一次：进入 WARN，由 advance 在 t→1 时 apply
  private maybeStartRestructure(): void {
    if (this._stepCount === 0) {
      return;
    }
    if (this._stepCount % STEPS_PER_RESTRUCTURE !== 0) {
      return;
    }
    this.phase = EnginePhase.RESTRUCTURE_WARN;
    this.restructureT = 0;
    this._lastOpened = [];
    this._lastClosed = [];
    this.startLoop();  // FRAGMENT 落点回 IDLE 后 loop 可能已停，重新拉起
  }

  // 调 Restructurer 应用一次重构，记录改动 cell 供 PULSE 渲染
  private applyRestructure(): void {
    const layer: Tile[][] = this.map.getLayer(this._currentLayer);
    const result: RestructureResult = Restructurer.apply(
      layer,
      this.player.col,
      this.player.row,
      this._rng,
      OPENS_PER_CYCLE,
      CLOSES_PER_CYCLE,
      this._fragments[this._currentLayer]
    );
    this._lastOpened = result.opened;
    this._lastClosed = result.closed;
  }

  // 强制弹层落点：在目标层找「与 (c0,r0) 曼哈顿距离最近的 FLOOR」cell
  // 保证落在可站立地板（不落 WALL / 锁定 GATE / 特殊瓦片）；(1,1) 始终为 FLOOR 作兜底
  private findNearestFloor(layer: number, c0: number, r0: number): number[] {
    let best: number[] = [1, 1];
    let bestD: number = 1e9;
    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const tile: Tile | undefined = this.map.getTile(c, r, layer);
        if (tile === undefined || tile.type !== TileType.FLOOR) {
          continue;
        }
        const d: number = Math.abs(c - c0) + Math.abs(r - r0);
        if (d < bestD) {
          bestD = d;
          best = [c, r];
        }
      }
    }
    return best;
  }

  // Day 7：扫描全层热量，更新峰值；构造期与每步升温后调用
  private updateHeatPeak(): void {
    for (let L = 0; L < this._heatPeak.length; L++) {
      const h: number = this._heat.getHeat(L);
      if (h > this._heatPeak[L]) {
        this._heatPeak[L] = h;
      }
    }
  }

  // 启停 tick 循环；只要不是 IDLE 就保持运行
  private startLoop(): void {
    if (this.intervalId !== -1) {
      return;
    }
    this.intervalId = setInterval(() => {
      this.advance();
      this.onTick();
      if (this.phase === EnginePhase.IDLE) {
        this.stopLoop();
      }
    }, this.TICK_MS);
  }

  private stopLoop(): void {
    if (this.intervalId !== -1) {
      clearInterval(this.intervalId);
      this.intervalId = -1;
    }
  }

  // 页面销毁等场景强制停机；多次调用幂等
  stop(): void {
    this.stopLoop();
    this.phase = EnginePhase.IDLE;
    this.transitionT = 0;
    this.restructureT = 0;
    this.viaWaitT = 0;
    this.viaWaitTier = -1;
    this._isViaTransition = false;
    this.player.clearTrail();
  }
}
