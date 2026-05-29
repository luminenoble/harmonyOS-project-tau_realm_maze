// HUD 与转场覆盖层：层数标签、淡入淡出黑屏
// Day 4 只用 drawFade（转场）+ drawLayerLabel（左上角层数）
// Day 5 起将追加步数、信号碎片数等

// 转场覆盖色：全黑
const COLOR_FADE: string = '#000000';
// 层数标签字体颜色 + 背景
const COLOR_LABEL_TEXT: string = '#22d3a8';
const COLOR_LABEL_BG: string = '#0a0e1aaa';   // 半透明深底
// 碎片角标
const COLOR_FRAGMENT_TEXT: string = '#ffd166';

// 全屏纯色覆盖；alpha 0 不画，1 全黑
// 用 save/restore + 显式 reset 双重保险，避免 ctx 状态泄漏到下一帧
export function drawFade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number
): void {
  if (alpha <= 0) {
    return;
  }
  const a: number = alpha > 1 ? 1 : alpha;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = COLOR_FADE;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // 防 HarmonyOS Canvas save/restore 不可靠：显式锁回 1
  ctx.globalAlpha = 1;
}

// Canvas 左上角层数标签 "L 0/2"
// x, y 为标签左上角；max 为总层数 - 1（即最高层号）
export function drawLayerLabel(
  ctx: CanvasRenderingContext2D,
  layer: number,
  max: number,
  x: number,
  y: number
): void {
  const text: string = 'L ' + layer + '/' + max;
  const padX: number = 8;
  const padY: number = 4;
  const fontPx: number = 14;

  ctx.font = fontPx + 'px sans-serif';
  const metrics = ctx.measureText(text);
  const tw: number = metrics.width;
  const boxW: number = tw + padX * 2;
  const boxH: number = fontPx + padY * 2;

  ctx.fillStyle = COLOR_LABEL_BG;
  ctx.fillRect(x, y, boxW, boxH);

  ctx.fillStyle = COLOR_LABEL_TEXT;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padX, y + padY);
}

// Canvas 顶部碎片角标 "◆ 1/3"
// 与 drawLayerLabel 风格统一；x, y 同样是标签左上角
export function drawFragmentBadge(
  ctx: CanvasRenderingContext2D,
  picked: number,
  total: number,
  x: number,
  y: number
): void {
  const text: string = '◆ ' + picked + '/' + total;
  const padX: number = 8;
  const padY: number = 4;
  const fontPx: number = 14;

  ctx.font = fontPx + 'px sans-serif';
  const metrics = ctx.measureText(text);
  const tw: number = metrics.width;
  const boxW: number = tw + padX * 2;
  const boxH: number = fontPx + padY * 2;

  ctx.fillStyle = COLOR_LABEL_BG;
  ctx.fillRect(x, y, boxW, boxH);

  ctx.fillStyle = COLOR_FRAGMENT_TEXT;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padX, y + padY);
}
