// 等距瓦片渲染：单瓦片菱形绘制 + 整张地图按 Painter's Algorithm 排序绘制
// Day 1 提供 drawIsoGrid（仅地板）；Day 2 起主要用 drawMap（按 MapManager 数据分派瓦片类型）

import { gridToScreen, IsoConfig, ScreenPoint } from '../../utils/IsoMath';
import { MapManager } from '../core/MapManager';
import { Player } from '../core/Player';
import { drawTile } from './TileSet';
import { drawPlayer } from './PlayerRenderer';
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

// 渲染项类型：地图 cell 或玩家
// 用三元组 [col, row, kind] 编码：kind=0 表 cell，kind=1 表玩家（坐标可能为浮点）
// 玩家排序 key 末尾加微小偏移，避免与同 (row+col) 的 cell z-fighting
const KIND_CELL: number = 0;
const KIND_PLAYER: number = 1;

// Painter's Algorithm 排序绘制整张地图（可选地把玩家排入序中）
// key = row + col，升序遍历：远处先画，近处后画
// 玩家以 visualCol/Row 浮点坐标参与排序，过墙脚时遮挡正确
export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: MapManager,
  cfg: IsoConfig,
  wallH: number,
  layer: number = 0,
  player?: Player,
  playerH?: number
): void {
  // 收集所有渲染项：每项 [col(float), row(float), kind]
  const items: number[][] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      items.push([c, r, KIND_CELL]);
    }
  }
  if (player !== undefined) {
    // 玩家排序键加 0.001 偏移，保证同 row+col 时晚于 cell 绘制
    items.push([player.visualCol() + 0.001, player.visualRow() + 0.001, KIND_PLAYER]);
  }

  items.sort((a: number[], b: number[]) => {
    const ka: number = a[0] + a[1];
    const kb: number = b[0] + b[1];
    if (ka !== kb) {
      return ka - kb;
    }
    return a[1] - b[1];
  });

  // 按排序后顺序逐项绘制
  const ph: number = (playerH === undefined) ? wallH * 0.6 : playerH;
  for (let i = 0; i < items.length; i++) {
    const c: number = items[i][0];
    const r: number = items[i][1];
    const kind: number = items[i][2];
    const p: ScreenPoint = gridToScreen(c, r, layer, cfg);

    if (kind === KIND_PLAYER) {
      drawPlayer(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, ph);
    } else {
      const tile: Tile | undefined = map.getTile(c, r, layer);
      if (tile === undefined) {
        continue;
      }
      drawTile(ctx, tile.type, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
    }
  }
}
