// 地图数据容器
// Day 2 单层版：持有一个 Tile[][]；接口预留 layer 参数，Day 4 升级到多层时只改实现不改调用方

import { Tile } from '../types/TileType';
import { MazeGenerator } from '../../utils/MazeGenerator';

// 行优先遍历的回调签名
export type TileVisitor = (tile: Tile, col: number, row: number) => void;

export class MapManager {
  readonly cols: number;
  readonly rows: number;
  // Day 2：单层；Day 4 改为 Tile[][][]（按 layer 索引）
  private tiles: Tile[][];

  // 构造时立即调用迷宫生成器填充地图
  constructor(cols: number, rows: number, seed?: number) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = MazeGenerator.generate(cols, rows, seed);
  }

  // 越界返回 undefined，由调用方自行判空（Day 2 渲染保证 in-bounds，不会触发）
  getTile(col: number, row: number, layer: number = 0): Tile | undefined {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return undefined;
    }
    return this.tiles[row][col];
  }

  // 行优先遍历（painter's 排序由 renderer 在外部完成）
  forEach(cb: TileVisitor, layer: number = 0): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(this.tiles[r][c], c, r);
      }
    }
  }
}
