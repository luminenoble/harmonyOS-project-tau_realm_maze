// HUD 与转场覆盖层：层数标签、淡入淡出黑屏
// Day 4 只用 drawFade（转场）+ drawLayerLabel（左上角层数）
// Day 5 起将追加步数、信号碎片数等

// 转场覆盖色：全黑
const COLOR_FADE: string = '#000000';
// 层数标签字体颜色 + 背景
const COLOR_LABEL_TEXT: string = '#22d3a8';
const COLOR_LABEL_BG: string = '#0a0e1aaa';   // 半透明深底

// 全屏纯色覆盖；alpha 0 不画，1 全黑
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
  // 用 globalAlpha 切换，画完恢复
  const prev: number = ctx.globalAlpha;
  ctx.globalAlpha = a;
  ctx.fillStyle = COLOR_FADE;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = prev;
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
