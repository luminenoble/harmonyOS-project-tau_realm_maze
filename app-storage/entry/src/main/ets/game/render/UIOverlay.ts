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
// 重构警告：红色脉冲底 + 浅红字
const COLOR_WARN_FILL: string = '#ff3030';
const COLOR_WARN_TEXT: string = '#ffe0e0';

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

// Day 7：VIA 时钟周期等待进度条（中央卡片样式）
// progress 0..1；tier 决定填色与文字标签（0=L1 金 / 1=L2 银 / 2=MEM 铜）
// 卡片：半透明深底 + 顶部白字 "L1-VIA · 1 cycle" + 底部一条横向进度条
const COLOR_VIA_BAR_BG: string = '#0a0e1add';
const COLOR_VIA_BAR_BORDER: string = '#22d3a8';
const COLOR_VIA_BAR_TRACK: string = '#1a2238';
const COLOR_VIA_BAR_TEXT: string = '#e8f4ff';
const VIA_BAR_TIER_COLORS: string[] = ['#ffd24a', '#d6dde6', '#c98b5b'];
const VIA_BAR_TIER_LABELS: string[] = ['L1-VIA', 'L2-VIA', 'MEM-VIA'];
const VIA_BAR_TIER_DELAYS: number[] = [1, 3, 6];

export function drawViaProgressBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tier: number,
  progress: number
): void {
  if (tier < 0) {
    return;
  }
  const p: number = progress < 0 ? 0 : (progress > 1 ? 1 : progress);

  // 卡片尺寸（平板友好，固定大小居中）
  const cardW: number = 320;
  const cardH: number = 88;
  const cardX: number = (w - cardW) / 2;
  const cardY: number = (h - cardH) / 2;

  // 1) 卡片底 + 描边
  ctx.fillStyle = COLOR_VIA_BAR_BG;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOR_VIA_BAR_BORDER;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // 2) 顶部文字 "L1-VIA · 1 cycle"
  const tierIdx: number = (tier >= 0 && tier < VIA_BAR_TIER_LABELS.length) ? tier : 2;
  const label: string = VIA_BAR_TIER_LABELS[tierIdx]
      + ' · ' + VIA_BAR_TIER_DELAYS[tierIdx] + ' cycle'
      + (VIA_BAR_TIER_DELAYS[tierIdx] > 1 ? 's' : '');
  ctx.fillStyle = COLOR_VIA_BAR_TEXT;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, cardX + cardW / 2, cardY + 16);

  // 3) 进度条：轨道 + tier 色填充
  const barH: number = 12;
  const barX: number = cardX + 24;
  const barY: number = cardY + cardH - 24;
  const barW: number = cardW - 48;
  ctx.fillStyle = COLOR_VIA_BAR_TRACK;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = VIA_BAR_TIER_COLORS[tierIdx];
  ctx.fillRect(barX, barY, barW * p, barH);

  // 4) 状态还原（防 HarmonyOS Canvas alpha / textAlign 泄漏）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

// Day 6 重构警告：全屏红色 sin 脉冲 + 中央"信号重路由中..."文字
// alpha 由 GameEngine.warnPulseAlpha 提供，介于 [0.15, 0.55] 区间（基础 0.35 ± 0.2）
// 文字始终以 alpha=1 渲染，保证警告语义可读；避免随脉冲一起闪烁
export function drawWarningOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number
): void {
  if (alpha <= 0) {
    return;
  }
  const a: number = alpha > 1 ? 1 : (alpha < 0 ? 0 : alpha);

  // 1) 红色底
  ctx.globalAlpha = a;
  ctx.fillStyle = COLOR_WARN_FILL;
  ctx.fillRect(0, 0, w, h);

  // 2) 中央文字（不参与脉冲，alpha=1）
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR_WARN_TEXT;
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('信号重路由中...', w / 2, h / 2);

  // 3) 防 HarmonyOS Canvas 状态泄漏：显式还原
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}
