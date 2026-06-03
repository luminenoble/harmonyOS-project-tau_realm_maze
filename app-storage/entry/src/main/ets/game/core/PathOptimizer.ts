// 最优路径求解：计算"收集全部碎片并写回 EXIT"的理论最小周期 τ
// 作为 CPI 评分基准（CPI = playerτ / optimalτ）。GameEngine 起局调一次。
//
// 关键简化——层序被游戏规则强制为 L0→L1→L2：
//   上行 VIA 锁定直到本层 3 碎片全收集；EXIT 在顶层需全部碎片。
// 于是问题降为逐层子问题：从入口访问本层全部碎片，再到选定的上行 VIA（顶层则到 EXIT）。
// 逐层 BFS 最短路 + 碎片访问顺序全排列 + 上行 VIA tier 枚举，取总周期最小。
//
// 门（GATE）两阶段：本层碎片 <1 时门锁（THRESHOLD=1），故"入口→第一个碎片"按门锁 BFS，
// 其后各段按门开 BFS；全门锁不可达时回退门开（边界兜底）。
//
// 假设：忽略散热绕路（理论下界）；碎片数/层较小（全排列可行）。改大需换 Held-Karp。

import { MapManager } from './MapManager';
import { Tile, TileType } from '../types/TileType';
import { ViaUnlock } from '../puzzle/ViaUnlock';

// 不可达 / 无穷大哨兵（避免 Infinity 在 ArkTS 上的不确定性）
const INF: number = 1e9;

// 单层递归求解的中间结果
class LayerSolve {
  tau: number;        // 本层起到通关的最小总周期
  steps: number;      // 移动步数累计
  delay: number;      // VIA 延迟累计
  tiers: number[];    // 本层起各层上行选用的 tier 序列

  constructor(tau: number, steps: number, delay: number, tiers: number[]) {
    this.tau = tau;
    this.steps = steps;
    this.delay = delay;
    this.tiers = tiers;
  }
}

// 对外输出：最优 τ + 拆分 + 各层 VIA tier 选择
export class OptimalResult {
  optimalTau: number;    // 最小总周期 = steps + delay
  optimalSteps: number;  // 最优移动步数
  optimalDelay: number;  // 最优 VIA 延迟累计
  viaTiers: number[];    // 各层上行选用 tier（length = layerCount-1）
  solvable: boolean;     // 是否成功求解

  constructor(tau: number, steps: number, delay: number, tiers: number[], solvable: boolean) {
    this.optimalTau = tau;
    this.optimalSteps = steps;
    this.optimalDelay = delay;
    this.viaTiers = tiers;
    this.solvable = solvable;
  }
}

// 网格内一个目标点；tier 仅 VIA 用，其余 -1
class Cell {
  col: number;
  row: number;
  tier: number;
  constructor(col: number, row: number, tier: number) {
    this.col = col;
    this.row = row;
    this.tier = tier;
  }
}

export class PathOptimizer {
  // 求解入口：失败（无解）时 solvable=false，optimalTau 兜底为 1 避免 CPI 除零
  static solve(map: MapManager, startCol: number, startRow: number): OptimalResult {
    const res: LayerSolve = PathOptimizer.solveFrom(map, 0, startCol, startRow);
    if (res.tau >= INF) {
      return new OptimalResult(1, 1, 0, [], false);
    }
    return new OptimalResult(res.tau, res.steps, res.delay, res.tiers, true);
  }

  // 递归求解第 layer 层（入口 entry）到通关的最小周期
  private static solveFrom(
    map: MapManager, layer: number, entryCol: number, entryRow: number
  ): LayerSolve {
    const grid: Tile[][] = map.getLayer(layer);
    const frags: Cell[] = PathOptimizer.collectCells(map, layer, TileType.FRAGMENT);
    const isTop: boolean = (layer === map.layerCount - 1);

    // 目标集合：顶层 = EXIT（延迟 0）；其余 = 本层全部上行 VIA
    const targets: Cell[] = [];
    if (isTop) {
      const exits: Cell[] = PathOptimizer.collectCells(map, layer, TileType.EXIT);
      for (let i = 0; i < exits.length; i++) {
        targets.push(exits[i]);
      }
    } else {
      map.forEach((tile: Tile, col: number, row: number) => {
        if (tile.type === TileType.VIA && tile.viaTarget > layer) {
          targets.push(new Cell(col, row, tile.viaTier));
        }
      }, layer);
    }

    // 预计算 BFS：入口（门锁 / 门开）+ 每个碎片（门开）
    const distClosedEntry: number[][] = PathOptimizer.bfs(grid, entryCol, entryRow, false);
    const distOpenEntry: number[][] = PathOptimizer.bfs(grid, entryCol, entryRow, true);
    const fragDistOpen: number[][][] = [];
    for (let i = 0; i < frags.length; i++) {
      fragDistOpen.push(PathOptimizer.bfs(grid, frags[i].col, frags[i].row, true));
    }

    // 碎片访问顺序全排列
    const orders: number[][] = PathOptimizer.permutations(frags.length);

    let best: LayerSolve = new LayerSolve(INF, 0, 0, []);
    for (let t = 0; t < targets.length; t++) {
      const via: Cell = targets[t];
      const segSteps: number = PathOptimizer.minVisitSteps(
        frags, orders, distClosedEntry, distOpenEntry, fragDistOpen, via
      );
      if (segSteps >= INF) {
        continue;
      }
      const delay: number = (via.tier < 0) ? 0 : ViaUnlock.getTierDelay(via.tier);

      if (isTop) {
        const tau: number = segSteps + delay;
        if (tau < best.tau) {
          best = new LayerSolve(tau, segSteps, delay, []);
        }
      } else {
        const sub: LayerSolve = PathOptimizer.solveFrom(map, layer + 1, via.col, via.row);
        if (sub.tau >= INF) {
          continue;
        }
        const tau: number = segSteps + delay + sub.tau;
        if (tau < best.tau) {
          const tiers: number[] = [via.tier];
          for (let k = 0; k < sub.tiers.length; k++) {
            tiers.push(sub.tiers[k]);
          }
          best = new LayerSolve(tau, segSteps + sub.steps, delay + sub.delay, tiers);
        }
      }
    }
    return best;
  }

  // 从入口出发按某顺序访问全部碎片、最后到 via 的最小步数
  // 第一段（入口→首碎片）按门锁；其余按门开。全门锁不可达则回退门开
  private static minVisitSteps(
    frags: Cell[], orders: number[][],
    distClosedEntry: number[][], distOpenEntry: number[][],
    fragDistOpen: number[][][], via: Cell
  ): number {
    if (frags.length === 0) {
      const d: number = distOpenEntry[via.row][via.col];
      return d < 0 ? INF : d;
    }
    let best: number = PathOptimizer.permCost(frags, orders, distClosedEntry, fragDistOpen, via);
    if (best >= INF) {
      best = PathOptimizer.permCost(frags, orders, distOpenEntry, fragDistOpen, via);
    }
    return best;
  }

  // 给定"入口距离表"，遍历所有排列取最小步数；不可达段跳过该排列
  private static permCost(
    frags: Cell[], orders: number[][],
    distEntry: number[][], fragDistOpen: number[][][], via: Cell
  ): number {
    let best: number = INF;
    for (let o = 0; o < orders.length; o++) {
      const order: number[] = orders[o];
      const first: number = order[0];
      let cost: number = distEntry[frags[first].row][frags[first].col];
      if (cost < 0) {
        continue;  // 首碎片不可达
      }
      let ok: boolean = true;
      let cur: number = first;
      for (let idx = 1; idx < order.length; idx++) {
        const nxt: number = order[idx];
        const d: number = fragDistOpen[cur][frags[nxt].row][frags[nxt].col];
        if (d < 0) {
          ok = false;
          break;
        }
        cost += d;
        cur = nxt;
      }
      if (!ok) {
        continue;
      }
      const dv: number = fragDistOpen[cur][via.row][via.col];
      if (dv < 0) {
        continue;
      }
      cost += dv;
      if (cost < best) {
        best = cost;
      }
    }
    return best;
  }

  // 收集指定层某类型的全部 cell
  private static collectCells(map: MapManager, layer: number, type: TileType): Cell[] {
    const out: Cell[] = [];
    map.forEach((tile: Tile, col: number, row: number) => {
      if (tile.type === type) {
        out.push(new Cell(col, row, tile.viaTier));
      }
    }, layer);
    return out;
  }

  // 网格 BFS：返回 dist[row][col]，-1 = 不可达。gatesOpen=false 时 GATE 视为墙
  private static bfs(grid: Tile[][], srcCol: number, srcRow: number, gatesOpen: boolean): number[][] {
    const rows: number = grid.length;
    const cols: number = grid[0].length;
    const dist: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const line: number[] = [];
      for (let c = 0; c < cols; c++) {
        line.push(-1);
      }
      dist.push(line);
    }
    if (srcRow < 0 || srcRow >= rows || srcCol < 0 || srcCol >= cols) {
      return dist;
    }
    // 队列用数组 + 头指针；元素编码 row*cols+col
    const queue: number[] = [];
    let head: number = 0;
    dist[srcRow][srcCol] = 0;
    queue.push(srcRow * cols + srcCol);
    const dcs: number[] = [1, -1, 0, 0];
    const drs: number[] = [0, 0, 1, -1];
    while (head < queue.length) {
      const code: number = queue[head];
      head++;
      const r: number = Math.floor(code / cols);
      const c: number = code % cols;
      const base: number = dist[r][c];
      for (let k = 0; k < 4; k++) {
        const nc: number = c + dcs[k];
        const nr: number = r + drs[k];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          continue;
        }
        if (dist[nr][nc] !== -1) {
          continue;
        }
        if (!PathOptimizer.passable(grid[nr][nc], gatesOpen)) {
          continue;
        }
        dist[nr][nc] = base + 1;
        queue.push(nr * cols + nc);
      }
    }
    return dist;
  }

  // 可通行：非墙；GATE 仅在 gatesOpen 时可过；VIA/FRAGMENT/THERMAL/EXIT/FLOOR 均可走
  private static passable(tile: Tile, gatesOpen: boolean): boolean {
    if (tile.type === TileType.WALL) {
      return false;
    }
    if (tile.type === TileType.GATE && !gatesOpen) {
      return false;
    }
    return true;
  }

  // 生成 [0..n-1] 的全排列（n 小，阶乘可接受）
  private static permutations(n: number): number[][] {
    const result: number[][] = [];
    if (n <= 0) {
      result.push([]);
      return result;
    }
    const used: boolean[] = [];
    for (let i = 0; i < n; i++) {
      used.push(false);
    }
    PathOptimizer.permRec(n, used, [], result);
    return result;
  }

  private static permRec(n: number, used: boolean[], cur: number[], out: number[][]): void {
    if (cur.length === n) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) {
        continue;
      }
      used[i] = true;
      cur.push(i);
      PathOptimizer.permRec(n, used, cur, out);
      cur.pop();
      used[i] = false;
    }
  }
}
