// 游戏主循环：地图 + 玩家 + 状态机（IDLE / MOVING / TRANSITION_OUT / TRANSITION_IN）
// Day 4 新增切层转场动画，TRANSITION_OUT 完成时 swap currentLayer

import { MapManager } from './MapManager';
import { Player } from './Player';
import { TileType, Tile } from '../types/TileType';

// tick 回调类型
export type TickCallback = () => void;

// 引擎阶段
export enum EnginePhase {
  IDLE = 0,
  MOVING = 1,
  TRANSITION_OUT = 2,
  TRANSITION_IN = 3
}

// [DEBUG] 引擎实例全局计数器，定位"老引擎仍在跑"的泄漏问题
let __engineInstanceSeq: number = 0;

export class GameEngine {
  // [DEBUG] 本实例编号，所有 log 带前缀方便区分新旧引擎
  private readonly engineId: number = ++__engineInstanceSeq;
  private readonly logTag: string = '[engine#' + this.engineId + ']';
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

  private intervalId: number = -1;
  private onTick: TickCallback;
  private readonly TICK_MS: number = 16;

  constructor(map: MapManager, startCol: number = 1, startRow: number = 1) {
    this.map = map;
    this.player = new Player(startCol, startRow);
    this._currentLayer = 0;
    this.phase = EnginePhase.IDLE;
    this.transitionT = 0;
    this.onTick = () => {};
    console.info(this.logTag, 'ctor created');
  }

  setTickCallback(cb: TickCallback): void {
    this.onTick = cb;
  }

  // 暴露给渲染层
  get currentLayer(): number {
    return this._currentLayer;
  }

  // 转场覆盖层 alpha：0 = 不显示，1 = 全黑
  // OUT 阶段 0→1；IN 阶段 1→0；其他阶段为 0
  get transitionAlpha(): number {
    if (this.phase === EnginePhase.TRANSITION_OUT) {
      return this.transitionT;
    }
    if (this.phase === EnginePhase.TRANSITION_IN) {
      return 1 - this.transitionT;
    }
    return 0;
  }

  // 是否正在转场（用于 UI 决定是否禁用输入指示）
  isTransitioning(): boolean {
    return this.phase === EnginePhase.TRANSITION_OUT
        || this.phase === EnginePhase.TRANSITION_IN;
  }

  // 尝试朝指定方向移动；仅 IDLE 时接受输入
  tryMove(dCol: number, dRow: number): boolean {
    if (this.phase !== EnginePhase.IDLE) {
      console.info(this.logTag, 'tryMove REJECT phase=', this.phase,
        'transitionT=', this.transitionT);
      return false;
    }
    const tc: number = this.player.col + dCol;
    const tr: number = this.player.row + dRow;
    const tile: Tile | undefined = this.map.getTile(tc, tr, this._currentLayer);
    if (tile === undefined) {
      console.info(this.logTag, 'tryMove REJECT out-of-bounds', tc, tr, 'L=', this._currentLayer);
      return false;
    }
    if (tile.type === TileType.WALL) {
      console.info(this.logTag, 'tryMove REJECT wall at', tc, tr);
      return false;
    }
    console.info(this.logTag, 'tryMove ACCEPT', dCol, dRow, '→', tc, tr);
    this.player.startMove(dCol, dRow);
    this.phase = EnginePhase.MOVING;
    this.startLoop();
    return true;
  }

  // 推进一帧：根据当前 phase 分派
  private advance(): void {
    const prevPhase: EnginePhase = this.phase;
    if (this.phase === EnginePhase.MOVING) {
      const stillAnimating: boolean = this.player.tick();
      if (!stillAnimating) {
        // 检查落点是否 VIA
        const tile: Tile | undefined = this.map.getTile(
          this.player.col, this.player.row, this._currentLayer
        );
        if (tile !== undefined && tile.type === TileType.VIA && tile.viaTarget >= 0) {
          this.phase = EnginePhase.TRANSITION_OUT;
          this.transitionT = 0;
        } else {
          this.phase = EnginePhase.IDLE;
        }
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
          console.info(this.logTag, 'swap layer', this._currentLayer, '→', tile.viaTarget);
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
      }
    }
    if (prevPhase !== this.phase) {
      console.info(this.logTag, 'phase', prevPhase, '→', this.phase, 'T=', this.transitionT);
    }
  }

  // 启停 tick 循环；只要不是 IDLE 就保持运行
  private startLoop(): void {
    if (this.intervalId !== -1) {
      console.info(this.logTag, 'startLoop SKIP, already running id=', this.intervalId);
      return;
    }
    // 用 local 捕获每个 interval 自己的 id，方便确认是否多 timer 同时跑
    let localId: number = -1;
    const handle: object = setInterval(() => {
      // [DEBUG] 每个 interval 闭包带自己的 localId；若日志里出现 ≥2 个不同 id 高频打印
      // 即可确认 timer 泄漏
      this.tickFromLoop(localId);
    }, this.TICK_MS) as object;
    // setInterval 返回值可能是 number 或对象（HarmonyOS 行为待确认）
    console.info(this.logTag, 'startLoop NEW handle=', handle,
      'typeof=', typeof handle, 'isNumber=', (typeof handle === 'number'));
    localId = handle as number;
    this.intervalId = localId;
  }

  // 抽出 tick 主体，方便加日志且不让 setInterval 闭包过臃
  private tickFromLoop(localId: number): void {
    if (localId !== this.intervalId) {
      // [DEBUG] 这条 log 一旦出现 = 旧 interval 没被 clear 干净
      console.warn(this.logTag, 'GHOST TICK from id=', localId,
        'but current id=', this.intervalId, 'phase=', this.phase);
    }
    this.advance();
    this.onTick();
    if (this.phase === EnginePhase.IDLE) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.intervalId !== -1) {
      console.info(this.logTag, 'stopLoop clearInterval id=', this.intervalId);
      clearInterval(this.intervalId);
      this.intervalId = -1;
    }
  }

  // 页面销毁等场景强制停机；多次调用幂等
  stop(): void {
    console.info(this.logTag, 'stop() called, phase=', this.phase);
    this.stopLoop();
    this.phase = EnginePhase.IDLE;
    this.transitionT = 0;
  }
}
