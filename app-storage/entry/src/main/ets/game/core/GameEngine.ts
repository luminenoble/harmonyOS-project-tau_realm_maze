// 游戏主循环：地图 + 玩家 + 输入派发 + 碰撞检测
// 按需启停：仅在玩家动画期间运行 tick，静止时 timer 暂停以节省功耗

import { MapManager } from './MapManager';
import { Player } from './Player';
import { TileType, Tile } from '../types/TileType';

// tick 回调类型：每帧调一次（用于触发 Canvas 重绘）
export type TickCallback = () => void;

export class GameEngine {
  readonly map: MapManager;
  readonly player: Player;

  // setInterval 句柄；-1 表示未启动
  private intervalId: number = -1;
  private onTick: TickCallback;
  // tick 周期，毫秒
  private readonly TICK_MS: number = 16;

  // 构造时给定地图与玩家起点（Day 3 起点固定 (1,1)）
  constructor(map: MapManager, startCol: number = 1, startRow: number = 1) {
    this.map = map;
    this.player = new Player(startCol, startRow);
    this.onTick = () => {};
  }

  // 注册 tick 回调（通常是触发 Canvas 重绘）
  setTickCallback(cb: TickCallback): void {
    this.onTick = cb;
  }

  // 尝试朝指定网格方向移动一格
  // 边界外或目标为 WALL 直接拒绝；动画中也拒绝（防止按键堆叠）
  tryMove(dCol: number, dRow: number): boolean {
    if (this.player.isAnimating()) {
      return false;
    }
    const tc: number = this.player.col + dCol;
    const tr: number = this.player.row + dRow;
    const tile: Tile | undefined = this.map.getTile(tc, tr, 0);
    if (tile === undefined) {
      return false;
    }
    if (tile.type === TileType.WALL) {
      return false;
    }
    this.player.startMove(dCol, dRow);
    this.startLoop();
    return true;
  }

  // 启动 tick 循环（幂等：已在跑则直接返回）
  private startLoop(): void {
    if (this.intervalId !== -1) {
      return;
    }
    this.intervalId = setInterval(() => {
      const stillAnimating: boolean = this.player.tick();
      this.onTick();
      if (!stillAnimating) {
        this.stopLoop();
      }
    }, this.TICK_MS);
  }

  // 停 tick 循环；GamePage 销毁时也调用以防泄漏
  private stopLoop(): void {
    if (this.intervalId !== -1) {
      clearInterval(this.intervalId);
      this.intervalId = -1;
    }
  }

  // 对外暴露的停机入口（页面销毁时调用）
  stop(): void {
    this.stopLoop();
  }
}
