// 上行 VIA 解锁判定 + Day 7 VIA 三级缓存延迟模型
// 规则：当前层碎片数 ≥ UP_THRESHOLD（默认 3，即全收集）才能触发上行切层
// 下行 VIA 始终可用（生成时 locked = false）

import { Tile, TileType } from '../types/TileType';
import { MapManager } from '../core/MapManager';

// VIA 三级缓存分级：与 Tile.viaTier 字段对齐
// L1（黄金）：稀少 + 延迟 1 步；L2（银）：中等 + 延迟 3 步；MEM（铜）：普通 + 延迟 6 步
export enum ViaTier {
  L1 = 0,
  L2 = 1,
  MEM = 2
}

// 各级延迟（时钟周期），下标对齐 ViaTier；缺省/越界一律按 MEM 计
// 注：MazeGenerator 内部维护一份等价的 1:2:3 轮转表（VIA_TIER_ROTATION），
// 避免 ViaUnlock → MapManager → MazeGenerator 循环依赖；改 delay 时记得同步那边的语义
const VIA_DELAYS: number[] = [1, 3, 6];

export class ViaUnlock {
  // 上行 VIA 解锁所需碎片数默认值（与旧版 3 碎片/层对齐）
  // 指令重构后每层碎片数随难度变化（2/3/4），调用方应传 requiredCount = 本层碎片总数
  static readonly UP_THRESHOLD: number = 3;

  // 玩家落点 VIA 时调用：返回是否触发切层
  // 已解锁（locked = false）一律可触发；requiredCount 为本层解锁所需碎片数
  static canTrigger(
    tile: Tile, currentLayer: number, fragmentCount: number,
    requiredCount: number = ViaUnlock.UP_THRESHOLD
  ): boolean {
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
    return fragmentCount >= requiredCount;
  }

  // 扫描指定层所有上行 VIA，达到 requiredCount（本层碎片全收集）则解锁
  static unlockAllInLayer(
    map: MapManager, layer: number, fragmentCount: number,
    requiredCount: number = ViaUnlock.UP_THRESHOLD
  ): void {
    if (fragmentCount < requiredCount) {
      return;
    }
    map.forEach((tile: Tile, col: number, row: number) => {
      if (tile.type === TileType.VIA && tile.locked && tile.viaTarget > layer) {
        tile.locked = false;
      }
    }, layer);
  }

  // 查询 tier 对应的延迟（时钟周期）
  // 非法 tier（-1 或越界）退化为 MEM 延迟，避免崩溃同时给玩家"惩罚"
  static getTierDelay(tier: number): number {
    if (tier < 0 || tier >= VIA_DELAYS.length) {
      return VIA_DELAYS[ViaTier.MEM];
    }
    return VIA_DELAYS[tier];
  }
}
