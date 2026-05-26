// 等距瓦片渲染：菱形单瓦片绘制 + 网格批量绘制
// Day 1 仅支持单一样式地板，Day 2 起按瓦片类型分派样式
import { gridToScreen, IsoConfig } from '../../utils/IsoMath';

// 瓦片视觉样式：填充色、描边色、线宽
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

// 绘制单个菱形瓦片
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

// 批量绘制等距网格地图
// 行优先遍历，保证后绘制的瓦片覆盖在前面之上（Day 2 起需引入 Painter's Algorithm 处理墙体遮挡）
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
      const p = gridToScreen(c, r, layer, cfg);
      drawDiamondTile(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, style);
    }
  }
}
