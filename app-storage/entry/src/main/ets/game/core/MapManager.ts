// 多层地图数据容器（Day 4 起 3 层）
// 持有 Tile[][][]，按 layer 索引；构造时依次生成各层迷宫并放置 Via 节点

import { Tile } from '../types/TileType';
import { MazeGenerator, Rng } from '../../utils/MazeGenerator';

// 行优先遍历的回调签名
export type TileVisitor = (tile: Tile, col: number, row: number) => void;

// 每对相邻层放置的 Via 数量（CLAUDE.md MVP 规定 2-3 个/层）
const VIAS_PER_PAIR: number = 2;
// 每层信号碎片数（Day 5 起，CLAUDE.md MVP 规定 3 个/层）
const FRAGMENTS_PER_LAYER: number = 3;
// 每层逻辑门数（Day 5，MVP 阶段 1 个/层）
const GATES_PER_LAYER: number = 1;

export class MapManager {
  readonly cols: number;
  readonly rows: number;
  readonly layerCount: number;
  // [layer][row][col]
  private layers: Tile[][][];

  // 构造时生成所有层 + 放置 Via
  // seed 不传则用 Date.now；多层种子由主 Rng 派生，保证整体可复现
  constructor(cols: number, rows: number, layerCount: number = 3, seed?: number) {
    this.cols = cols;
    this.rows = rows;
    this.layerCount = layerCount;

    const masterSeed: number = (seed === undefined) ? Date.now() : seed;
    const masterRng: Rng = new Rng(masterSeed);

    // 每层用 masterRng 派生子种子，避免各层迷宫雷同
    this.layers = [];
    for (let L = 0; L < layerCount; L++) {
      const layerSeed: number = Math.floor(masterRng.next() * 0xFFFFFFFF);
      this.layers.push(MazeGenerator.generate(cols, rows, layerSeed));
    }

    // 用主 Rng 继续派生 Via / 逻辑门 / 碎片 放置的随机性
    // 顺序：VIA → GATE → FRAGMENT。
    // - VIA 先占位避免后续 carve 错位
    // - GATE 先于 FRAGMENT：placeGates 用 BFS 校验 pre-GATE 区非空；placeFragments 据此 BFS 强制 1 碎片在 pre 区，断死锁
    MazeGenerator.placeVias(this.layers, masterRng, VIAS_PER_PAIR);
    MazeGenerator.placeGates(this.layers, masterRng, GATES_PER_LAYER);
    MazeGenerator.placeFragments(this.layers, masterRng, FRAGMENTS_PER_LAYER);
  }

  // 越界返回 undefined；层号越界同样返回 undefined
  getTile(col: number, row: number, layer: number = 0): Tile | undefined {
    if (layer < 0 || layer >= this.layerCount) {
      return undefined;
    }
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return undefined;
    }
    return this.layers[layer][row][col];
  }

  // 直接拿到某一层的 Tile[][]，供 Restructurer 等需要原地修改的子系统使用
  // 调用方负责保持外圈外墙、不破坏整体连通性（由 BFS 校验保障）
  getLayer(layer: number): Tile[][] {
    return this.layers[layer];
  }

  // 行优先遍历指定层（painter's 排序由 renderer 负责）
  forEach(cb: TileVisitor, layer: number = 0): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(this.layers[layer][r][c], c, r);
      }
    }
  }
}
