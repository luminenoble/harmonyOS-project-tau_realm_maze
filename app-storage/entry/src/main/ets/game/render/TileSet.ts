// 各瓦片类型的 Canvas 绘制函数
// 统一签名：(ctx, cx, cy, halfW, halfH, wallH) => void
// FLOOR / WALL 完整绘制；VIA / GATE / FRAGMENT 用占位标识，Day 4-5 再细化

import { Tile, TileType } from '../types/TileType';

// 颜色常量：深蓝 PCB + 青绿电路
const COLOR_FLOOR_FILL: string = '#0d3b3b';
const COLOR_FLOOR_STROKE: string = '#22d3a8';

// 墙体三面（顶/右/左）由亮到暗模拟受光
const COLOR_WALL_TOP: string = '#22d3a8';
const COLOR_WALL_RIGHT: string = '#177a6a';
const COLOR_WALL_LEFT: string = '#0f4f48';
const COLOR_WALL_STROKE: string = '#0a0e1a';

// 占位色（Day 5 进一步精化）
const COLOR_VIA_UP: string = '#5ec0ff';   // 亮蓝：上行通孔
const COLOR_VIA_DOWN: string = '#2a78c8'; // 暗蓝：下行通孔
const COLOR_VIA_RING: string = '#1a4a7a'; // VIA 边圈
const COLOR_GATE: string = '#ff6b6b';     // 红：逻辑门
const COLOR_FRAGMENT: string = '#ffd166'; // 黄：信号碎片

const LINE_WIDTH: number = 1;

// 绘制地板菱形
export function drawFloor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();

  ctx.fillStyle = COLOR_FLOOR_FILL;
  ctx.fill();
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = COLOR_FLOOR_STROKE;
  ctx.stroke();
}

// 绘制墙体立方块（顶/左/右三面）
// (cx, cy) 是地板中心，墙块向上突起 wallH 像素
export function drawWall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  wallH: number
): void {
  // 顶面菱形（向上偏移 wallH）四角
  const topT_x: number = cx;
  const topT_y: number = cy - wallH - halfH;
  const topR_x: number = cx + halfW;
  const topR_y: number = cy - wallH;
  const topB_x: number = cx;
  const topB_y: number = cy - wallH + halfH;
  const topL_x: number = cx - halfW;
  const topL_y: number = cy - wallH;

  // 底面菱形（地板高度）四角
  const botR_x: number = cx + halfW;
  const botR_y: number = cy;
  const botB_x: number = cx;
  const botB_y: number = cy + halfH;
  const botL_x: number = cx - halfW;
  const botL_y: number = cy;

  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = COLOR_WALL_STROKE;

  // 左侧面（最暗）：顶左 → 顶下 → 底下 → 底左
  ctx.beginPath();
  ctx.moveTo(topL_x, topL_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.lineTo(botB_x, botB_y);
  ctx.lineTo(botL_x, botL_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_WALL_LEFT;
  ctx.fill();
  ctx.stroke();

  // 右侧面（中亮）：顶右 → 底右 → 底下 → 顶下
  ctx.beginPath();
  ctx.moveTo(topR_x, topR_y);
  ctx.lineTo(botR_x, botR_y);
  ctx.lineTo(botB_x, botB_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_WALL_RIGHT;
  ctx.fill();
  ctx.stroke();

  // 顶面（最亮）：top → right → bottom → left
  ctx.beginPath();
  ctx.moveTo(topT_x, topT_y);
  ctx.lineTo(topR_x, topR_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.lineTo(topL_x, topL_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_WALL_TOP;
  ctx.fill();
  ctx.stroke();
}

// 通用占位标识：在地板上画一个稍小的实心菱形
function drawMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  color: string
): void {
  const r: number = 0.5; // 缩小比例
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH * r);
  ctx.lineTo(cx + halfW * r, cy);
  ctx.lineTo(cx, cy + halfH * r);
  ctx.lineTo(cx - halfW * r, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// VIA 渲染：地板 + 方向感知三角箭头
// up=true 表示上行（指向更高层号），三角朝上 + 亮蓝
// up=false 表示下行，三角朝下 + 暗蓝
export function drawVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  up: boolean
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);

  // 边圈：方便玩家在远处也能识别 VIA
  const ringR: number = Math.max(2, halfW * 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = COLOR_VIA_RING;
  ctx.stroke();

  // 三角：尺寸约 cell 内切，朝向由 up 决定
  const triW: number = halfW * 0.5;
  const triH: number = halfH * 1.4;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - triH);          // 顶
    ctx.lineTo(cx + triW, cy + triH / 2);
    ctx.lineTo(cx - triW, cy + triH / 2);
  } else {
    ctx.moveTo(cx, cy + triH);          // 底
    ctx.lineTo(cx + triW, cy - triH / 2);
    ctx.lineTo(cx - triW, cy - triH / 2);
  }
  ctx.closePath();
  ctx.fillStyle = up ? COLOR_VIA_UP : COLOR_VIA_DOWN;
  ctx.fill();
}

// GATE 占位：地板 + 红色标识（Day 5 替换为门图形 + 状态）
export function drawGate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);
  drawMarker(ctx, cx, cy, halfW, halfH, COLOR_GATE);
}

// FRAGMENT 占位：地板 + 黄色标识（Day 5 替换为闪烁碎片）
export function drawFragment(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);
  drawMarker(ctx, cx, cy, halfW, halfH, COLOR_FRAGMENT);
}

// 按瓦片类型分派绘制
// currentLayer 用于 VIA 判定上行/下行（viaTarget > currentLayer 即上行）
// 注意：WALL 会先绘制底下的 FLOOR（保持墙脚有 PCB 底色），再绘制墙块
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  currentLayer: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  wallH: number
): void {
  switch (tile.type) {
    case TileType.FLOOR:
      drawFloor(ctx, cx, cy, halfW, halfH);
      break;
    case TileType.WALL:
      drawFloor(ctx, cx, cy, halfW, halfH);
      drawWall(ctx, cx, cy, halfW, halfH, wallH);
      break;
    case TileType.VIA:
      drawVia(ctx, cx, cy, halfW, halfH, tile.viaTarget > currentLayer);
      break;
    case TileType.GATE:
      drawGate(ctx, cx, cy, halfW, halfH);
      break;
    case TileType.FRAGMENT:
      drawFragment(ctx, cx, cy, halfW, halfH);
      break;
    default:
      drawFloor(ctx, cx, cy, halfW, halfH);
      break;
  }
}
