// 玩家几何绘制：青绿小棱柱 + 顶面"信号源"亮点
// 与墙体使用相同立方体范式，但更矮、更亮，主角辨识度优先

// 玩家三色阶（顶 / 右 / 左），整体比墙体亮一阶
const COLOR_PLAYER_TOP: string = '#5ef5c8';
const COLOR_PLAYER_RIGHT: string = '#2ab592';
const COLOR_PLAYER_LEFT: string = '#1a8a6e';
const COLOR_PLAYER_STROKE: string = '#0a0e1a';
// 顶面中心亮点：信号源
const COLOR_SIGNAL: string = '#ffffff';

const LINE_WIDTH: number = 1.2;

// 绘制玩家棱柱
// (cx, cy) 是所在 cell 地板中心；棱柱高度 playerH（建议 wallH * 0.6）
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  playerH: number
): void {
  // 占用 cell 60% 宽，更紧凑显示在格中央
  const w: number = halfW * 0.6;
  const h: number = halfH * 0.6;

  // 顶面菱形（上抬 playerH）
  const topT_x: number = cx;
  const topT_y: number = cy - playerH - h;
  const topR_x: number = cx + w;
  const topR_y: number = cy - playerH;
  const topB_x: number = cx;
  const topB_y: number = cy - playerH + h;
  const topL_x: number = cx - w;
  const topL_y: number = cy - playerH;

  // 底面菱形（地板高度）
  const botR_x: number = cx + w;
  const botR_y: number = cy;
  const botB_x: number = cx;
  const botB_y: number = cy + h;
  const botL_x: number = cx - w;
  const botL_y: number = cy;

  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = COLOR_PLAYER_STROKE;

  // 左侧面
  ctx.beginPath();
  ctx.moveTo(topL_x, topL_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.lineTo(botB_x, botB_y);
  ctx.lineTo(botL_x, botL_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_PLAYER_LEFT;
  ctx.fill();
  ctx.stroke();

  // 右侧面
  ctx.beginPath();
  ctx.moveTo(topR_x, topR_y);
  ctx.lineTo(botR_x, botR_y);
  ctx.lineTo(botB_x, botB_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_PLAYER_RIGHT;
  ctx.fill();
  ctx.stroke();

  // 顶面
  ctx.beginPath();
  ctx.moveTo(topT_x, topT_y);
  ctx.lineTo(topR_x, topR_y);
  ctx.lineTo(topB_x, topB_y);
  ctx.lineTo(topL_x, topL_y);
  ctx.closePath();
  ctx.fillStyle = COLOR_PLAYER_TOP;
  ctx.fill();
  ctx.stroke();

  // 顶面中心圆形信号源（小一圈白色）
  const signalR: number = Math.max(2, halfW * 0.18);
  ctx.beginPath();
  ctx.arc(cx, cy - playerH, signalR, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_SIGNAL;
  ctx.fill();
}
