// 游戏主循环：地图 + 玩家 + 状态机
// Day 4：切层转场；Day 5：碎片 / 逻辑门 / 上行 VIA 锁；Day 6：每 20 步动态重构

import { MapManager } from './MapManager';
import { Player } from './Player';
import { TileType, Tile } from '../types/TileType';
import { GateLogic } from '../puzzle/GateLogic';
import { ViaUnlock } from '../puzzle/ViaUnlock';
import { pickFact } from '../data/ChipFacts';
import { Restructurer, RestructureResult } from './Restructurer';
import { Rng } from '../../utils/MazeGenerator';

// tick 回调类型
export type TickCallback = () => void;
// 拾取碎片回调：传入科普文本，由 GamePage 弹 Dialog
export type FragmentPickedCallback = (factText: string) => void;

// 引擎阶段
export enum EnginePhase {
  IDLE = 0,
  MOVING = 1,
  TRANSITION_OUT = 2,
  TRANSITION_IN = 3,
  RESTRUCTURE_WARN = 4,
  RESTRUCTURE_PULSE = 5
}

// Day 6 重构参数
const STEPS_PER_RESTRUCTURE: number = 20;
const OPENS_PER_CYCLE: number = 2;
const CLOSES_PER_CYCLE: number = 2;

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

  // 每层已拾取碎片数 / 初始总数
  private _fragments: number[];
  private _fragmentTotals: number[];
  // 累计拾取计数，用于科普文本循环取
  private _pickedCount: number;
  // 累计成功移动步数（跨层共享）；每 STEPS_PER_RESTRUCTURE 触发一次重构
  private _stepCount: number;

  // 上一轮重构改动的 cell 列表（PULSE 阶段渲染层用）
  private _lastOpened: number[][];
  private _lastClosed: number[][];

  // 运行时 RNG：重构与未来动态系统共用
  private _rng: Rng;

  private intervalId: number = -1;
  private onTick: TickCallback;
  private onFragmentPicked: FragmentPickedCallback;
  private readonly TICK_MS: number = 16;

  constructor(map: MapManager, startCol: number = 1, startRow: number = 1) {
    this.map = map;
    this.player = new Player(startCol, startRow);
    this._currentLayer = 0;
    this.phase = EnginePhase.IDLE;
    this.transitionT = 0;
    this.restructureT = 0;
    this.onTick = () => {};
    this.onFragmentPicked = () => {};
    this._pickedCount = 0;
    this._stepCount = 0;
    this._lastOpened = [];
    this._lastClosed = [];
    // 用启动时间 + 起点扰动作 seed，避免每次重生 RNG 序列一致
    this._rng = new Rng(Date.now() ^ ((startCol << 8) | startRow));

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
    } else if (this.phase === EnginePhase.TRANSITION_OUT) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        // 黑屏瞬间换层
        const tile: Tile | undefined = this.map.getTile(
          this.player.col, this.player.row, this._currentLayer
        );
        if (tile !== undefined && tile.viaTarget >= 0) {
          this._currentLayer = tile.viaTarget;
        }
        this.phase = EnginePhase.TRANSITION_IN;
        this.transitionT = 0;
      }
    } else if (this.phase === EnginePhase.TRANSITION_IN) {
      this.transitionT += this.TRANSITION_SPEED;
      if (this.transitionT >= 1) {
        this.transitionT = 1;
        this.phase = EnginePhase.IDLE;
        // 切层完成后检查是否要触发重构（在新层上）
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

  // 玩家移动结束：依次检测 FRAGMENT 拾取、VIA 切层；最后检查是否触发重构
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
      this.maybeStartRestructure();
      return;
    }

    // 2) VIA：解锁则切层，锁定则停在原地
    if (tile.type === TileType.VIA && tile.viaTarget >= 0) {
      if (ViaUnlock.canTrigger(tile, this._currentLayer, this._fragments[this._currentLayer])) {
        this.phase = EnginePhase.TRANSITION_OUT;
        this.transitionT = 0;
        // 切层期不触发重构，等 TRANSITION_IN 末尾再判
        return;
      }
    }

    this.phase = EnginePhase.IDLE;
    this.maybeStartRestructure();
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
  }
}
