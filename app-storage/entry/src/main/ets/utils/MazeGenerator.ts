// 迷宫生成：迭代版递归回溯算法 + 可种子化 PRNG（mulberry32）
// 输入 cols / rows 必须为奇数（典型 (2N+1)），保证厚墙结构对齐

import { Tile, TileType } from '../game/types/TileType';

// 可种子化随机数生成器，避免依赖不可复现的 Math.random
class Rng {
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
}
