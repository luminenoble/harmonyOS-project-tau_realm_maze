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

// tick 回调类型
export type TickCallback = () => void;
// 拾取碎片回调：传入科普文本，由 GamePage 弹 Dialog
export type FragmentPickedCallback = (factText: string) => void;
// EXIT 落点但条件不足时的提示回调（"还需 N 个碎片"）
export type ExitHintCallback = (hint: string) => void;
// 通关回调：传入结算统计
export type VictoryCallback = (stats: VictoryStats) => void;

// 通关结算数据；ResultPage 通过 router params 解析展示
export class VictoryStats {
  steps: number;        // 累计移动步数
  tauVia: number;       // 所有 VIA 延迟累计（时钟周期）
  tau: number;          // 总 τ = steps + tauVia
  l1: number;           // L1-VIA 使用次数
  l2: number;
  mem: number;
  heatPeak: number[];   // 各层热量峰值

  constructor(
    steps: number, tauVia: number, tau: number,
    l1: number, l2: number, mem: number, heatPeak: number[]
  ) {
    this.steps = steps;
    this.tauVia = tauVia;
    this.tau = tau;
    this.l1 = l1;
    this.l2 = l2;
    this.mem = mem;
    this.heatPeak = heatPeak;
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

  // 上一轮重构改动的 cell 列表（PULSE 阶段渲染层用）
  private _lastOpened: number[][];
  private _lastClosed: number[][];

  // 运行时 RNG：重构与未来动态系统共用
  private _rng: Rng;

  // Day 6 散热
  private _heat: HeatManager;
  // 当前是强制弹层（区别于 VIA 主动切层）；TRANSITION_OUT 末尾根据此标志分支
  private _forcedPop: boolean;

  private intervalId: number = -1;
  private onTick: TickCallback;
  private onFragmentPicked: FragmentPickedCallback;
  private onExitHint: ExitHintCallback;
  private onVictory: VictoryCallback;
  private readonly TICK_MS: number = 16;

  constructor(map: MapManager, startCol: number = 1, startRow: number = 1) {
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
    this._pickedCount = 0;
    this._stepCount = 0;
    this._lastOpened = [];
    this._lastClosed = [];
    // 用启动时间 + 起点扰动作 seed，避免每次重生 RNG 序列一致
    this._rng = new Rng(Date.now() ^ ((startCol << 8) | startRow));

    // 散热：三层各自从 0 起跳
    this._heat = new HeatManager(map.layerCount);
    this._forcedPop = false;

    // Day 7 统计字段
    this._viaCounts = [0, 0, 0];
    this._tauVia = 0;
    this._heatPeak = [];
    for (let L = 0; L < map.layerCount; L++) {
      this._heatPeak.push(0);
    }
    this._victoryFired = false;

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
    if (!GateLogic.canPass(tile, this._fragments[this._currentLayer])) {
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
        this.phase = EnginePhase.TRANSITION_OUT;
        this.transitionT = 0;
      }
    } else if (this.phase === EnginePhase.TRANSITION_OUT) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        // 黑屏瞬间换层：强制弹层 vs VIA 主动切层两支
        if (this._forcedPop) {
          // 离开层热量清零（玩家"凉下来"才能再回）；落到下层 (1,1) 起点
          this._heat.reset(this._currentLayer);
          this._currentLayer -= 1;
          this.player.col = 1;
          this.player.row = 1;
          this._forcedPop = false;
        } else {
          const tile: Tile | undefined = this.map.getTile(
            this.player.col, this.player.row, this._currentLayer
          );
          if (tile !== undefined && tile.viaTarget >= 0) {
            this._currentLayer = tile.viaTarget;
          }
        }
        this.phase = EnginePhase.TRANSITION_IN;
        this.transitionT = 0;
      }
    } else if (this.phase === EnginePhase.TRANSITION_IN) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        this.phase = EnginePhase.IDLE;
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

    // 1) 碎片拾取
    if (tile.type === TileType.FRAGMENT) {
      tile.type = TileType.FLOOR;
      tile.locked = false;
      this._fragments[this._currentLayer]++;
      this._pickedCount++;
      const count: number = this._fragments[this._currentLayer];
      GateLogic.unlockAllInLayer(this.map, this._currentLayer, count);
      ViaUnlock.unlockAllInLayer(this.map, this._currentLayer, count);
      this.onFragmentPicked(pickFact(this._pickedCount - 1));
      this.phase = EnginePhase.IDLE;
      if (this.maybeForcePop()) {
        return;
      }
      this.maybeStartRestructure();
      return;
    }

    // 2) 散热通道：本层热量 -30，瓦片不消耗
    if (tile.type === TileType.THERMAL_VIA) {
      this._heat.cool(this._currentLayer);
      // 散热后通常不会立即过热弹层；保险起见仍走标准路径
      this.phase = EnginePhase.IDLE;
      this.maybeStartRestructure();
      return;
    }

    // 3) VIA：解锁则进入 VIA_WAIT 等待对应延迟后切层；锁定则停在原地
    if (tile.type === TileType.VIA && tile.viaTarget >= 0) {
      if (ViaUnlock.canTrigger(tile, this._currentLayer, this._fragments[this._currentLayer])) {
        // Day 7：累计 tier 使用 + τ 延迟
        const tier: number = tile.viaTier;
        if (tier >= 0 && tier < 3) {
          this._viaCounts[tier]++;
        }
        const delay: number = ViaUnlock.getTierDelay(tier);
        this._tauVia += delay;
        // 进 VIA_WAIT；速率按 delay 反比，让 MEM 等得更久
        this.viaWaitTier = tier;
        this.viaWaitT = 0;
        this.viaWaitSpeed = 1 / (delay * VIA_TICKS_PER_DELAY);
        this.phase = EnginePhase.VIA_WAIT;
        // 切层期不触发重构，等 TRANSITION_IN 末尾再判
        return;
      }
    }

    // 4) EXIT：集齐全部碎片才通关，否则提示一次
    if (tile.type === TileType.EXIT) {
      if (this.totalFragmentsPicked >= this.totalFragmentsAll) {
        this.fireVictory();
        return;
      }
      const lack: number = this.totalFragmentsAll - this.totalFragmentsPicked;
      this.onExitHint('终点链路已就位，但还差 ' + lack + ' 个信号碎片。');
      this.phase = EnginePhase.IDLE;
      if (this.maybeForcePop()) {
        return;
      }
      this.maybeStartRestructure();
      return;
    }

    this.phase = EnginePhase.IDLE;
    // 检查过热强制弹层（优先级高于重构）
    if (this.maybeForcePop()) {
      return;
    }
    this.maybeStartRestructure();
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
    const stats: VictoryStats = new VictoryStats(
      this._stepCount, this._tauVia, this.tau,
      this._viaCounts[0], this._viaCounts[1], this._viaCounts[2], peakCopy
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
  }
}
