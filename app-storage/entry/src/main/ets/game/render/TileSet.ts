// 各瓦片类型的 Canvas 绘制函数
// 统一签名：(ctx, cx, cy, halfW, halfH, wallH) => void
// FLOOR / WALL 完整绘制；VIA / GATE / FRAGMENT 用占位标识，Day 4-5 再细化

import { Tile, TileType } from '../types/TileType';

// 颜色：地板用冷蓝（暗底 + 亮蓝描边），墙体用黑金（金顶 + 黑侧）
// 冷暖对立 + 大色相差，小屏上路 ↔ 墙一眼可分
const COLOR_FLOOR_FILL: string = '#0c1a36';     // 极暗蓝，路面"沉下去"
const COLOR_FLOOR_STROKE: string = '#5a8cd0';   // 亮蓝描边，电路"通路"感

// 墙体三面（顶/右/左）：金 → 暗金 → 近黑，模拟侧光
const COLOR_WALL_TOP: string = '#e0b35e';       // 金
const COLOR_WALL_RIGHT: string = '#6a4f1e';     // 暗金/古铜
const COLOR_WALL_LEFT: string = '#2a1e0a';      // 近黑棕
const COLOR_WALL_STROKE: string = '#0a0e1a';

// VIA / GATE / FRAGMENT 色板
const COLOR_VIA_UP: string = '#5ec0ff';        // 亮蓝：已解锁上行通孔
const COLOR_VIA_DOWN: string = '#2a78c8';      // 暗蓝：下行通孔
const COLOR_VIA_LOCKED: string = '#5a5a5a';    // 灰：上行 VIA 锁定
const COLOR_VIA_RING: string = '#1a4a7a';      // VIA 边圈
const COLOR_VIA_RING_LOCKED: string = '#8a2020'; // 锁定 VIA 暗红警示圈
const COLOR_GATE_LOCKED: string = '#d63b3b';   // 红：锁定逻辑门
const COLOR_GATE_UNLOCKED: string = '#22d3a8'; // 青绿：已解锁门（淡色提示边框）
const COLOR_FRAGMENT: string = '#ffd166';      // 黄：信号碎片

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
// up=true 表示上行（指向更高层号），三角朝上 + 亮蓝（锁定时灰 + 暗红圈）
// up=false 表示下行，三角朝下 + 暗蓝（始终不锁）
export function drawVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  up: boolean,
  locked: boolean
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);

  // 边圈：方便玩家在远处也能识别 VIA；锁定时换暗红
  const ringR: number = Math.max(2, halfW * 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = locked ? COLOR_VIA_RING_LOCKED : COLOR_VIA_RING;
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
  if (locked) {
    ctx.fillStyle = COLOR_VIA_LOCKED;
  } else {
    ctx.fillStyle = up ? COLOR_VIA_UP : COLOR_VIA_DOWN;
  }
  ctx.fill();
}

// GATE 渲染：地板 + 横向三道栅栏 + 中心锁/对号
// locked=true：红栅栏 + 锁状方块；locked=false：青绿栅栏 + 圆点（已解锁提示）
export function drawGate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  locked: boolean
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);
  const color: string = locked ? COLOR_GATE_LOCKED : COLOR_GATE_UNLOCKED;

  // 三道横栅栏：在 cell 内沿垂直方向均布
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, halfH * 0.18);
  const barW: number = halfW * 0.7;
  for (let i = -1; i <= 1; i++) {
    const y: number = cy + i * halfH * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx - barW, y);
    ctx.lineTo(cx + barW, y);
    ctx.stroke();
  }

  // 中心标识：锁定一个实心小方块（锁体），解锁后改为空心圆（钥匙孔）
  ctx.fillStyle = color;
  const cs: number = Math.max(3, halfW * 0.18);
  if (locked) {
    ctx.fillRect(cx - cs, cy - cs, cs * 2, cs * 2);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, cs, 0, Math.PI * 2);
    ctx.fill();
  }
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
      drawVia(ctx, cx, cy, halfW, halfH, tile.viaTarget > currentLayer, tile.locked);
      break;
    case TileType.GATE:
      drawGate(ctx, cx, cy, halfW, halfH, tile.locked);
      break;
    case TileType.FRAGMENT:
      drawFragment(ctx, cx, cy, halfW, halfH);
      break;
    default:
      drawFloor(ctx, cx, cy, halfW, halfH);
      break;
  }
}
