// 等距瓦片渲染：单瓦片菱形绘制 + 整张地图按 Painter's Algorithm 排序绘制
// Day 1 提供 drawIsoGrid（仅地板）；Day 2 起主要用 drawMap（按 MapManager 数据分派瓦片类型）

import { gridToScreen, IsoConfig, ScreenPoint } from '../../utils/IsoMath';
import { MapManager } from '../core/MapManager';
import { drawTile } from './TileSet';
import { Tile } from '../types/TileType';

// 瓦片视觉样式：填充色、描边色、线宽（保留给 Day 1 旧 API 使用）
export interface TileStyle {
  fill: string;
  stroke: string;
  lineWidth: number;
}

// 默认地板样式：暗青绿填充 + 高亮青绿描边（PCB 电路风格）
export const DEFAULT_TILE_STYLE: TileStyle = {
  fill: '#0d3b3b',
  stroke: '#22d3a8',
  lineWidth: 1.5
};

// 绘制单个菱形瓦片（Day 1 保留）
// 以 (cx, cy) 为中心，按 top → right → bottom → left 顺时针描点
export function drawDiamondTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  style: TileStyle
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);       // top
  ctx.lineTo(cx + halfW, cy);       // right
  ctx.lineTo(cx, cy + halfH);       // bottom
  ctx.lineTo(cx - halfW, cy);       // left
  ctx.closePath();

  ctx.fillStyle = style.fill;
  ctx.fill();

  ctx.lineWidth = style.lineWidth;
  ctx.strokeStyle = style.stroke;
  ctx.stroke();
}

// 批量绘制等距纯地板网格（Day 1 调试用，保留）
export function drawIsoGrid(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  layer: number,
  cfg: IsoConfig,
  style: TileStyle
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
      drawDiamondTile(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, style);
    }
  }
}

// Painter's Algorithm 排序绘制整张地图
// key = row + col，升序遍历：远处先画，近处后画，墙体遮挡顺序天然正确
// 同 key 内部按 row 升序（无视觉差异，保证遍历稳定）
export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: MapManager,
  cfg: IsoConfig,
  wallH: number,
  layer: number = 0
): void {
  // 收集 (col, row) 并排序
  const cells: number[][] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      cells.push([c, r]);
    }
  }
  cells.sort((a: number[], b: number[]) => {
    const ka: number = a[0] + a[1];
    const kb: number = b[0] + b[1];
    if (ka !== kb) {
      return ka - kb;
    }
    return a[1] - b[1];
  });

  // 按排序后顺序逐格绘制
  for (let i = 0; i < cells.length; i++) {
    const c: number = cells[i][0];
    const r: number = cells[i][1];
    const tile: Tile | undefined = map.getTile(c, r, layer);
    if (tile === undefined) {
      continue;
    }
    const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
    drawTile(ctx, tile.type, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
  }
}
