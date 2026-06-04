// ALU 运算门解锁判定（指令重构）
// 语义：门 = 一条 ALU 指令（ADD/MUL/AND/...），需玩家持有操作数才能"执行"通过
// 连通性保障：阈值固定 1（持有≥1 操作数即可），与迷宫生成 BFS 的 pre-GATE≥1 碎片不变式对齐，
//   避免"需持有两源"在仅 1 碎片可达的迷宫里产生软锁；展示层仍显示双源操作数（见 Tile.aluOperands）

import { Tile, TileType } from '../types/TileType';
import { MapManager } from '../core/MapManager';

export class GateLogic {
  // 解锁所需持有操作数数（保持 1 以兼容迷宫连通性不变式）
  static readonly THRESHOLD: number = 1;

  // 单格判定：玩家面前这格 GATE 当前是否可通过（执行 ALU）
  // 已解锁（locked = false）也算可通过
  static canPass(tile: Tile, heldCount: number): boolean {
    if (tile.type !== TileType.GATE) {
      return true;
    }
    if (!tile.locked) {
      return true;
    }
    return heldCount >= GateLogic.THRESHOLD;
  }

  // 扫描指定层所有 GATE，把满足阈值的全部解锁
  // 拾取碎片（持有数变化）后由 GameEngine 调用一次，避免每帧扫描
  static unlockAllInLayer(map: MapManager, layer: number, heldCount: number): void {
    if (heldCount < GateLogic.THRESHOLD) {
      return;
    }
    map.forEach((tile: Tile) => {
      if (tile.type === TileType.GATE && tile.locked) {
        tile.locked = false;
      }
    }, layer);
  }
}
