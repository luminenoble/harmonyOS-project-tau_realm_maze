// 逻辑门解锁判定
// 规则：玩家在当前层已拾取碎片数 ≥ THRESHOLD 即可通过门
// 用静态类聚合阈值常量，便于 Day 9 调难度时单点修改

import { Tile, TileType } from '../types/TileType';
import { MapManager } from '../core/MapManager';

export class GateLogic {
  // 解锁所需碎片数（MVP：1 个，避免迷宫死锁）
  static readonly THRESHOLD: number = 1;

  // 单格判定：玩家面前这格 GATE 当前是否可通过
  // 已解锁（locked = false）也算可通过
  static canPass(tile: Tile, fragmentCount: number): boolean {
    if (tile.type !== TileType.GATE) {
      return true;
    }
    if (!tile.locked) {
      return true;
    }
    return fragmentCount >= GateLogic.THRESHOLD;
  }

  // 扫描指定层所有 GATE，把符合阈值的全部解锁
  // 拾取碎片后由 GameEngine 调用一次，避免每帧重复扫描
  static unlockAllInLayer(map: MapManager, layer: number, fragmentCount: number): void {
    if (fragmentCount < GateLogic.THRESHOLD) {
      return;
    }
    map.forEach((tile: Tile) => {
      if (tile.type === TileType.GATE && tile.locked) {
        tile.locked = false;
      }
    }, layer);
  }
}
