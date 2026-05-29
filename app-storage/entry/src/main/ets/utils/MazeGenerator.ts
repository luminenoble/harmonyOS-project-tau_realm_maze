// 迷宫生成：迭代版递归回溯算法 + 可种子化 PRNG（mulberry32）
// 输入 cols / rows 必须为奇数（典型 (2N+1)），保证厚墙结构对齐

import { Tile, TileType } from '../game/types/TileType';

// 可种子化随机数生成器，避免依赖不可复现的 Math.random
// Day 4 导出供 MapManager 在多层种子分发时复用
export class Rng {
  private s: number;

  constructor(seed: number) {
    // >>> 0 转为无符号 32 位整数
    this.s = seed >>> 0;
  }

  // 返回 [0, 1) 浮点数
  next(): number {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t: number = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // 返回 [0, max) 整数
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// 栈中的单元坐标
class Cell {
  col: number;
  row: number;
  constructor(col: number, row: number) {
    this.col = col;
    this.row = row;
  }
}

// 四方向偏移（距离 2，配合厚墙模型，中间会被凿穿）：N / E / S / W
const DIRS: number[][] = [
  [0, -2],
  [2, 0],
  [0, 2],
  [-2, 0]
];

export class MazeGenerator {
  // 生成迷宫 tile 二维数组（[row][col]）
  // cols / rows 应为奇数（默认场景 13×13）；seed 不传则用 Date.now
  static generate(cols: number, rows: number, seed?: number): Tile[][] {
    const actualSeed: number = (seed === undefined) ? Date.now() : seed;
    const rng: Rng = new Rng(actualSeed);

    // 1. 初始化全为 WALL
    const tiles: Tile[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(new Tile(TileType.WALL));
      }
      tiles.push(row);
    }

    // 2. 起点 (1, 1) 设为 FLOOR
    tiles[1][1].type = TileType.FLOOR;
    const stack: Cell[] = [new Cell(1, 1)];

    // 3. DFS：每次从栈顶尝试随机选一个未访问的距离-2 邻居
    while (stack.length > 0) {
      const cur: Cell = stack[stack.length - 1];
      const order: number[] = MazeGenerator.shuffledDirIndices(rng);

      let advanced: boolean = false;
      for (let i = 0; i < order.length; i++) {
        const d: number[] = DIRS[order[i]];
        const nc: number = cur.col + d[0];
        const nr: number = cur.row + d[1];

        // 越界检查（保留外圈作为外墙，索引范围 1..size-2）
        if (nc <= 0 || nc >= cols - 1 || nr <= 0 || nr >= rows - 1) {
          continue;
        }
        // 已访问跳过
        if (tiles[nr][nc].type === TileType.FLOOR) {
          continue;
        }

        // 凿穿中间那格墙 + 邻居本身
        tiles[(cur.row + nr) / 2][(cur.col + nc) / 2].type = TileType.FLOOR;
        tiles[nr][nc].type = TileType.FLOOR;
        stack.push(new Cell(nc, nr));
        advanced = true;
        break;
      }

      if (!advanced) {
        stack.pop();
      }
    }

    return tiles;
  }

  // Fisher-Yates 打乱 [0,1,2,3]，决定四方向尝试顺序
  private static shuffledDirIndices(rng: Rng): number[] {
    const arr: number[] = [0, 1, 2, 3];
    for (let i = arr.length - 1; i > 0; i--) {
      const j: number = rng.nextInt(i + 1);
      const tmp: number = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // 为多层地图配对放置 Via 节点
  // 每对相邻层 (L, L+1) 选 perPair 个同坐标 cell，两层都标 VIA + viaTarget 指向对方
  // 候选优先选两层都已是 FLOOR 的 cell；若不足，强行 carve（WALL→FLOOR 不破坏连通性）
  // 外圈 (索引 0 / size-1) 是外墙，不在候选范围
  // 起点 (1,1) 也排除，避免一进游戏就被自动切层
  static placeVias(layers: Tile[][][], rng: Rng, perPair: number): void {
    const layerCount: number = layers.length;
    if (layerCount < 2) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount - 1; L++) {
      const upper: number = L + 1;
      // 阶段 1：收集两层共同 FLOOR 的候选
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR
              && layers[upper][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }

      // 阶段 2：候选不足则在仅一侧 FLOOR 的 cell 上 carve 补足
      if (candidates.length < perPair) {
        for (let r = 1; r < rows - 1 && candidates.length < perPair; r++) {
          for (let c = 1; c < cols - 1 && candidates.length < perPair; c++) {
            if (c === 1 && r === 1) {
              continue;
            }
            const downIsFloor: boolean = layers[L][r][c].type === TileType.FLOOR;
            const upIsFloor: boolean = layers[upper][r][c].type === TileType.FLOOR;
            if (downIsFloor && !upIsFloor) {
              layers[upper][r][c].type = TileType.FLOOR;
              candidates.push([c, r]);
            } else if (!downIsFloor && upIsFloor) {
              layers[L][r][c].type = TileType.FLOOR;
              candidates.push([c, r]);
            }
          }
        }
      }

      // 阶段 3：从候选中随机选 perPair 个 + Fisher-Yates 打乱前缀
      const k: number = Math.min(perPair, candidates.length);
      for (let i = 0; i < k; i++) {
        const j: number = i + rng.nextInt(candidates.length - i);
        const tmp: number[] = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }

      // 阶段 4：写回 VIA 标记
      // Day 5 起：下层→上行 VIA 默认锁定（需当前层碎片全收集才解锁）；上层→下行 VIA 不锁
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        layers[L][r][c] = new Tile(TileType.VIA, upper, true);     // 下层 → 上行（locked）
        layers[upper][r][c] = new Tile(TileType.VIA, L, false);    // 上层 → 下行（unlocked）
      }
    }
  }

  // 为每层放置信号碎片（FRAGMENT）
  // 候选：FLOOR cell（排除外圈、起点 (1,1)、已是 VIA/GATE）
  // 数量不足时降到实际可用数（小概率）
  static placeFragments(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }

      const k: number = Math.min(perLayer, candidates.length);
      // Fisher-Yates 前缀洗牌
      for (let i = 0; i < k; i++) {
        const j: number = i + rng.nextInt(candidates.length - i);
        const tmp: number[] = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        layers[L][r][c] = new Tile(TileType.FRAGMENT);
      }
    }
  }

  // 为每层放置逻辑门（GATE，默认 locked）
  // 候选：FLOOR cell（排除外圈、起点、已是 VIA/GATE/FRAGMENT）
  // 不做路径分析；13×13 上随机分布配合"阈值 1 碎片"的解锁条件，玩家几乎不会被卡死
  static placeGates(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }

      const k: number = Math.min(perLayer, candidates.length);
      for (let i = 0; i < k; i++) {
        const j: number = i + rng.nextInt(candidates.length - i);
        const tmp: number[] = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        layers[L][r][c] = new Tile(TileType.GATE, -1, true);
      }
    }
  }
}
