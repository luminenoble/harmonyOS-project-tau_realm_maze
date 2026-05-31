// 动态地图重构：仅删除内部墙壁（两侧均为通路），创造新捷径
// 不再关闭任何通道，杜绝堵死玩家的可能
// 每 20 步由 GameEngine 触发一次；只重构当前层

import { Tile, TileType } from '../types/TileType';
import { Rng } from '../../utils/MazeGenerator';

// 重构结果：哪些 cell 被开通（坐标 [col, row]）
// 渲染层在 PULSE 阶段叠色高亮
export class RestructureResult {
  opened: number[][];
  closed: number[][];

  constructor(opened: number[][], closed: number[][]) {
    this.opened = opened;
    this.closed = closed;
  }
}

export class Restructurer {
  // 主入口：原地修改 layer，返回改动列表
  // 仅开墙，不关路；closed 始终为空数组（保留字段兼容渲染层）
  static apply(
    layer: Tile[][],
    playerCol: number,
    playerRow: number,
    rng: Rng,
    opens: number,
    closes: number,
    fragmentsOnLayer: number
  ): RestructureResult {
    const opened: number[][] = Restructurer.openPassages(layer, rng, opens);
    return new RestructureResult(opened, []);
  }

  // 删除内部墙壁，仅选择水平或垂直方向两侧均为可通行瓦片的墙
  // 效果：打通相邻走廊，创造捷径，不破坏原有路径
  private static openPassages(layer: Tile[][], rng: Rng, opens: number): number[][] {
    const rows: number = layer.length;
    const cols: number = layer[0].length;

    // 收集候选墙：内圈 WALL，且水平或垂直两侧都是非 WALL
    const candidates: number[][] = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (layer[r][c].type !== TileType.WALL) {
          continue;
        }
        // 水平方向：左右都是通路
        const hPass: boolean =
          layer[r][c - 1].type !== TileType.WALL &&
          layer[r][c + 1].type !== TileType.WALL;
        // 垂直方向：上下都是通路
        const vPass: boolean =
          layer[r - 1][c].type !== TileType.WALL &&
          layer[r + 1][c].type !== TileType.WALL;
        if (hPass || vPass) {
          candidates.push([c, r]);
        }
      }
    }
    Restructurer.shuffleInPlace(candidates, rng);

    const opened: number[][] = [];
    const k: number = Math.min(opens, candidates.length);
    for (let i = 0; i < k; i++) {
      const c: number = candidates[i][0];
      const r: number = candidates[i][1];
      layer[r][c].type = TileType.FLOOR;
      opened.push([c, r]);
    }
    return opened;
  }

  // Fisher-Yates 原地洗牌
  private static shuffleInPlace(arr: number[][], rng: Rng): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j: number = rng.nextInt(i + 1);
      const tmp: number[] = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
}
