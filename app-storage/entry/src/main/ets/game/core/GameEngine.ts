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
    this.player.startMove(dCol, dRow);
    this.phase = EnginePhase.MOVING;
    this.startLoop();
    return true;
  }

  // 推进一帧：根据当前 phase 分派
  private advance(): void {
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
  }
}
