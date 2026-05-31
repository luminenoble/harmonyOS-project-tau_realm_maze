// 玩家几何绘制：青绿小棱柱 + 顶面"信号源"亮点
// 与墙体使用相同立方体范式，但更矮、更亮，主角辨识度优先
// Day 8：新增 drawTrail，画身后 3 格阶梯渐隐残影

import { gridToScreen, IsoConfig, ScreenPoint } from '../../utils/IsoMath';

// 玩家三色阶（顶 / 右 / 左），整体比墙体亮一阶
const COLOR_PLAYER_TOP: string = '#5ef5c8';
const COLOR_PLAYER_RIGHT: string = '#2ab592';
const COLOR_PLAYER_LEFT: string = '#1a8a6e';
const COLOR_PLAYER_STROKE: string = '#0a0e1a';
// 顶面中心亮点：信号源
const COLOR_SIGNAL: string = '#ffffff';

const LINE_WIDTH: number = 1.2;

// Day 8：身后残影按层冷暖色（与 IsoRenderer 的层底色调一致）
// Layer 0 暖橙 / Layer 1 中性青 / Layer 2 冷蓝
const TRAIL_COLOR_BY_LAYER: string[] = ['#ff9a40', '#5ef5c8', '#5ec0ff'];
// 残影 alpha 阶梯（队首最旧 → 队尾最近）；与 Player.TRAIL_LEN=3 对齐
const TRAIL_ALPHA_STEPS: number[] = [0.15, 0.3, 0.5];

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

// Day 8：身后残影
// trail：Player 的 [col,row] 队列，队首最旧、队尾最近（最多 3 项）
// layer：当前层号，决定残影暖/冷色调
// 每个残影画为缩小的半透明菱形（贴地板，不占立体层）
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: number[][],
  cfg: IsoConfig,
  layer: number
): void {
  if (trail.length === 0) {
    return;
  }
  const color: string = (layer >= 0 && layer < TRAIL_COLOR_BY_LAYER.length)
      ? TRAIL_COLOR_BY_LAYER[layer]
      : TRAIL_COLOR_BY_LAYER[1];

  // 残影尺寸：60% cell；按 trail 长度从尾部对齐 alpha 阶梯（最新一格 alpha 最高）
  const r: number = 0.6;
  const halfW: number = cfg.tileHalfW * r;
  const halfH: number = cfg.tileHalfH * r;
  const startIdx: number = TRAIL_ALPHA_STEPS.length - trail.length;

  ctx.fillStyle = color;
  for (let i = 0; i < trail.length; i++) {
    const alphaIdx: number = startIdx + i;
    const alpha: number = alphaIdx >= 0 && alphaIdx < TRAIL_ALPHA_STEPS.length
        ? TRAIL_ALPHA_STEPS[alphaIdx]
        : 0.15;
    const c: number = trail[i][0];
    const row: number = trail[i][1];
    const p: ScreenPoint = gridToScreen(c, row, layer, cfg);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - halfH);
    ctx.lineTo(p.x + halfW, p.y);
    ctx.lineTo(p.x, p.y + halfH);
    ctx.lineTo(p.x - halfW, p.y);
    ctx.closePath();
    ctx.fill();
  }
  // 显式还原，防 HarmonyOS Canvas alpha 泄漏
  ctx.globalAlpha = 1;
}
