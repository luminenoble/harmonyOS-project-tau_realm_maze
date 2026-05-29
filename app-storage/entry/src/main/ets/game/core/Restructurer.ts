// 动态地图重构：在玩家所在层开 K 个 WALL + 试关 K 个 FLOOR，BFS 校验保证不死局
// 每 20 步由 GameEngine 触发一次；只重构当前层

import { Tile, TileType } from '../types/TileType';
import { MazeGenerator, Rng } from '../../utils/MazeGenerator';
import { GateLogic } from '../puzzle/GateLogic';

// 重构结果：哪些 cell 被开通、哪些 cell 被封堵（坐标 [col, row]）
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
  // 调用约束：
  //   - layer 必须是 MapManager 返回的当前层引用
  //   - playerCol / playerRow 是玩家此刻的整数格坐标
  //   - fragmentsOnLayer 是玩家在该层已拾取的碎片数（用于 pre-GATE 校验）
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
    const closed: number[][] = Restructurer.closePassages(
      layer, playerCol, playerRow, rng, closes, fragmentsOnLayer
    );
    return new RestructureResult(opened, closed);
  }

  // Pass 1：把内圈若干 WALL 改为 FLOOR
  // 不影响连通性（只加边），无需校验
  private static openPassages(layer: Tile[][], rng: Rng, opens: number): number[][] {
    const rows: number = layer.length;
    const cols: number = layer[0].length;

    const candidates: number[][] = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (layer[r][c].type === TileType.WALL) {
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

  // Pass 2：试关若干 FLOOR；每次 BFS 校验连通性，不通过则回退
  // 关键约束：
  //   A) 玩家可达全部 FRAGMENT + VIA（GATE 视为可通行 = 假定将来都能解开）
  //   B) 若该层有 locked GATE 且 fragmentsOnLayer < THRESHOLD，pre-GATE 区仍含 ≥1 FRAGMENT（否则永远开不了门）
  private static closePassages(
    layer: Tile[][],
    playerCol: number,
    playerRow: number,
    rng: Rng,
    closes: number,
    fragmentsOnLayer: number
  ): number[][] {
    const rows: number = layer.length;
    const cols: number = layer[0].length;

    // 收集 FLOOR 候选：排除玩家所在 cell、(1,1) 起点、特殊瓦片
    const candidates: number[][] = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (layer[r][c].type !== TileType.FLOOR) {
          continue;
        }
        if (c === playerCol && r === playerRow) {
          continue;
        }
        if (c === 1 && r === 1) {
          continue;
        }
        candidates.push([c, r]);
      }
    }
    Restructurer.shuffleInPlace(candidates, rng);

    const closed: number[][] = [];
    for (let i = 0; i < candidates.length && closed.length < closes; i++) {
      const c: number = candidates[i][0];
      const r: number = candidates[i][1];

      // 备份 + 试关
      const saved: Tile = layer[r][c];
      layer[r][c] = new Tile(TileType.WALL);

      if (Restructurer.checkConnectivity(layer, playerCol, playerRow, fragmentsOnLayer)) {
        closed.push([c, r]);
      } else {
        // 回退
        layer[r][c] = saved;
      }
    }
    return closed;
  }

  // 试关后的连通性校验
  private static checkConnectivity(
    layer: Tile[][],
    playerCol: number,
    playerRow: number,
    fragmentsOnLayer: number
  ): boolean {
    // 检查 A：假设门都开，玩家可达全部 FRAGMENT + VIA
    const reachableAll: boolean[][] = MazeGenerator.bfsReachable(
      layer, playerCol, playerRow, false
    );
    const rows: number = layer.length;
    const cols: number = layer[0].length;
    let hasLockedGate: boolean = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t: Tile = layer[r][c];
        if (t.type === TileType.FRAGMENT || t.type === TileType.VIA) {
          if (!reachableAll[r][c]) {
            return false;
          }
        }
        if (t.type === TileType.GATE && t.locked) {
          hasLockedGate = true;
        }
      }
    }

    // 检查 B：若仍有 locked GATE 且玩家未达解锁阈值，要求 pre-GATE 区仍含 ≥1 FRAGMENT
    if (hasLockedGate && fragmentsOnLayer < GateLogic.THRESHOLD) {
      const reachableLocked: boolean[][] = MazeGenerator.bfsReachable(
        layer, playerCol, playerRow, true
      );
      let preFrag: boolean = false;
      for (let r = 0; r < rows && !preFrag; r++) {
        for (let c = 0; c < cols && !preFrag; c++) {
          if (layer[r][c].type === TileType.FRAGMENT && reachableLocked[r][c]) {
            preFrag = true;
          }
        }
      }
      if (!preFrag) {
        return false;
      }
    }

    return true;
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
