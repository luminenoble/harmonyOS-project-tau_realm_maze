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
// Day 7：VIA 改为三级缓存配色 — L1 金 / L2 银 / MEM 铜（取代统一蓝色调）
// 上下行用同 tier 同色（语义上同一通孔），锁定态仍统一灰
const COLOR_VIA_L1: string = '#ffd24a';        // 金：L1 缓存（延迟 1）
const COLOR_VIA_L2: string = '#d6dde6';        // 银：L2 缓存（延迟 3）
const COLOR_VIA_MEM: string = '#c98b5b';       // 铜：主存（延迟 6）
const COLOR_VIA_L1_RING: string = '#806014';
const COLOR_VIA_L2_RING: string = '#5a6878';
const COLOR_VIA_MEM_RING: string = '#603a18';
const COLOR_VIA_LOCKED: string = '#5a5a5a';    // 灰：上行 VIA 锁定
const COLOR_VIA_RING_LOCKED: string = '#8a2020'; // 锁定 VIA 暗红警示圈
const COLOR_GATE_LOCKED: string = '#d63b3b';   // 红：锁定逻辑门
const COLOR_GATE_UNLOCKED: string = '#22d3a8'; // 青绿：已解锁门（淡色提示边框）
const COLOR_FRAGMENT: string = '#ffd166';      // 黄：信号碎片
// THERMAL_VIA：青白冷光双层环
const COLOR_THERMAL_OUTER: string = '#a8e6ff';
const COLOR_THERMAL_INNER: string = '#e0f4ff';
const COLOR_THERMAL_RING: string = '#5fc4e8';

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

// VIA 渲染：地板 + 方向感知三角箭头 + tier 三色（金/银/铜）
// up=true 上行（指向更高层号），三角朝上；up=false 下行，三角朝下
// locked=true：填色与边圈换灰 + 暗红警示圈
// tier：0=L1 金 / 1=L2 银 / 2=MEM 铜；其他值退化为 MEM 色
export function drawVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  up: boolean,
  locked: boolean,
  tier: number
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);

  // 根据 tier 选填色与边圈色
  let fillColor: string = COLOR_VIA_MEM;
  let ringColor: string = COLOR_VIA_MEM_RING;
  if (tier === 0) {
    fillColor = COLOR_VIA_L1;
    ringColor = COLOR_VIA_L1_RING;
  } else if (tier === 1) {
    fillColor = COLOR_VIA_L2;
    ringColor = COLOR_VIA_L2_RING;
  }

  // 边圈：方便玩家在远处也能识别 VIA；锁定时换暗红
  const ringR: number = Math.max(2, halfW * 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = locked ? COLOR_VIA_RING_LOCKED : ringColor;
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
  ctx.fillStyle = locked ? COLOR_VIA_LOCKED : fillColor;
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

// THERMAL_VIA：地板 + 青白冷光双层同心圆 + 外圈虚环
// 视觉差异：无方向三角（区别 VIA）；冷色调（区别 FRAGMENT 暖色与 GATE 红色）
export function drawThermalVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);

  // 外层冷光圆
  const rOuter: number = Math.max(3, halfW * 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_THERMAL_OUTER;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOR_THERMAL_RING;
  ctx.stroke();

  // 内层亮白圆
  const rInner: number = Math.max(2, halfW * 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_THERMAL_INNER;
  ctx.fill();
}

// EXIT 渲染：地板 + 青绿色钻石轮廓 + 内部菱形脉冲
// 视觉差异：相比 VIA 三角，EXIT 用"立体钻石"双菱形 + 高饱和青绿，
// 远看像"通讯链路终端"；区别 FRAGMENT 黄色实心 + GATE 红栅栏
const COLOR_EXIT_FILL: string = '#22d3a8';
const COLOR_EXIT_GLOW: string = '#7df7d4';
const COLOR_EXIT_RING: string = '#0d6c52';

export function drawExit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  drawFloor(ctx, cx, cy, halfW, halfH);

  // 外层大菱形（描边 + 半透明青绿填充）
  const r1: number = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH * r1);
  ctx.lineTo(cx + halfW * r1, cy);
  ctx.lineTo(cx, cy + halfH * r1);
  ctx.lineTo(cx - halfW * r1, cy);
  ctx.closePath();
  ctx.fillStyle = COLOR_EXIT_FILL;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOR_EXIT_RING;
  ctx.stroke();

  // 内层小菱形（高亮"光芯"）
  const r2: number = 0.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH * r2);
  ctx.lineTo(cx + halfW * r2, cy);
  ctx.lineTo(cx, cy + halfH * r2);
  ctx.lineTo(cx - halfW * r2, cy);
  ctx.closePath();
  ctx.fillStyle = COLOR_EXIT_GLOW;
  ctx.fill();
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
      drawVia(
        ctx, cx, cy, halfW, halfH,
        tile.viaTarget > currentLayer, tile.locked, tile.viaTier
      );
      break;
    case TileType.GATE:
      drawGate(ctx, cx, cy, halfW, halfH, tile.locked);
      break;
    case TileType.FRAGMENT:
      drawFragment(ctx, cx, cy, halfW, halfH);
      break;
    case TileType.THERMAL_VIA:
      drawThermalVia(ctx, cx, cy, halfW, halfH);
      break;
    case TileType.EXIT:
      drawExit(ctx, cx, cy, halfW, halfH);
      break;
    default:
      drawFloor(ctx, cx, cy, halfW, halfH);
      break;
  }
}
