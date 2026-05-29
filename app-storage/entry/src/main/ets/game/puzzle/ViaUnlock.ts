// 上行 VIA 解锁判定
// 规则：当前层碎片数 ≥ UP_THRESHOLD（默认 3，即全收集）才能触发上行切层
// 下行 VIA 始终可用（生成时 locked = false）

import { Tile, TileType } from '../types/TileType';
import { MapManager } from '../core/MapManager';

export class ViaUnlock {
  // 上行 VIA 解锁所需碎片数（MVP：3，与每层碎片总数对齐 = 全收集）
  static readonly UP_THRESHOLD: number = 3;

  // 玩家落点 VIA 时调用：返回是否触发切层
  // 已解锁（locked = false）一律可触发
  static canTrigger(tile: Tile, currentLayer: number, fragmentCount: number): boolean {
    if (tile.type !== TileType.VIA) {
      return false;
    }
    if (!tile.locked) {
      return true;
    }
    // 锁定 VIA 仅当上行（viaTarget > currentLayer）时按阈值判定；
    // 理论上下行 VIA 不会被标 locked，这里仍按通用规则放行
    if (tile.viaTarget <= currentLayer) {
      return true;
    }
    return fragmentCount >= ViaUnlock.UP_THRESHOLD;
  }

  // 扫描指定层所有上行 VIA，符合阈值则解锁
  static unlockAllInLayer(map: MapManager, layer: number, fragmentCount: number): void {
    if (fragmentCount < ViaUnlock.UP_THRESHOLD) {
      return;
    }
    map.forEach((tile: Tile, col: number, row: number) => {
      if (tile.type === TileType.VIA && tile.locked && tile.viaTarget > layer) {
        tile.locked = false;
      }
    }, layer);
  }
}
