// 各瓦片类型的 Canvas 绘制函数
// 统一签名：(ctx, cx, cy, halfW, halfH, wallH) => void
// FLOOR / WALL 完整绘制；VIA / GATE / FRAGMENT 用占位标识，Day 4-5 再细化

import { Tile, TileType } from '../types/TileType';
import { FragmentKind, aluOpName } from '../data/Instruction';

// 颜色：地板用冷蓝（暗底 + 亮蓝描边），墙体用黑金（金顶 + 黑侧）
// 冷暖对立 + 大色相差，小屏上路 ↔ 墙一眼可分
// Day 1-7 默认色（Layer 1，逻辑层中性色）；Day 8 加层冷暖渐变后通过 layer 参数选色
const COLOR_FLOOR_FILL: string = '#0c1a36';     // 极暗蓝，路面"沉下去"
const COLOR_FLOOR_STROKE: string = '#5a8cd0';   // 亮蓝描边，电路"通路"感

// Day 8：层冷暖渐变（CLAUDE.md "底层器件 暖橙 → 顶层互联 冷蓝"）
// Layer 0 暖底（暗棕红 + 古铜描边）；Layer 1 保留原中性蓝；Layer 2 冷底（深青蓝 + 亮冰蓝描边）
// 只改 FLOOR；WALL 顶面金色保留不变，避免视觉割裂
const FLOOR_FILL_BY_LAYER: string[] = ['#2a1410', '#0c1a36', '#0a2840'];
const FLOOR_STROKE_BY_LAYER: string[] = ['#a06848', '#5a8cd0', '#7fb5ff'];

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
const COLOR_GATE_LOCKED: string = '#d63b3b';   // 红：锁定 ALU 门
const COLOR_GATE_UNLOCKED: string = '#22d3a8'; // 青绿：已解锁门（可执行）
const COLOR_FRAGMENT: string = '#ffd166';      // 黄：信号碎片（兜底）
// 指令重构：操作数碎片三类皮肤（寄存器蓝 / 立即数金 / 地址橙）
const COLOR_FRAG_REGISTER: string = '#4aa3ff';
const COLOR_FRAG_IMMEDIATE: string = '#ffd166';
const COLOR_FRAG_ADDRESS: string = '#ff9a40';
// VIA CALL/RET 文本 + ALU 门算子文本
const COLOR_VIA_TEXT: string = '#0a0e1a';
const COLOR_GATE_TEXT: string = '#ffe0e0';
// RAW 数据冒险格：警示品红 + 斜纹
const COLOR_RAW_FILL: string = '#b026ff';
const COLOR_RAW_STRIPE: string = '#ff5ad6';
const COLOR_RAW_TEXT: string = '#ffe0ff';
// THERMAL_VIA：青白冷光双层环
const COLOR_THERMAL_OUTER: string = '#a8e6ff';
const COLOR_THERMAL_INNER: string = '#e0f4ff';
const COLOR_THERMAL_RING: string = '#5fc4e8';

const LINE_WIDTH: number = 1;

// 绘制地板菱形
// layer Day 8 起选填：0=底层暖橙 / 1=中层中性蓝（默认）/ 2=顶层冷蓝
// 越界一律退化为 Layer 1 中性色，保持 Day 1-7 旧调用点的视觉不变
export function drawFloor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  layer: number = 1
): void {
  const idx: number = (layer >= 0 && layer < FLOOR_FILL_BY_LAYER.length) ? layer : 1;
  const fill: string = FLOOR_FILL_BY_LAYER[idx];
  const stroke: string = FLOOR_STROKE_BY_LAYER[idx];

  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = stroke;
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

// 瓦片中心小号文本（CALL/RET、ALU 算子、RAW 等标签）；仅在瓦片够大时绘制避免糊成一团
// 绘后显式还原 textAlign/baseline，防 HarmonyOS Canvas 状态泄漏
function drawCenterLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  text: string,
  color: string
): void {
  if (halfW < 14 || text.length === 0) {
    return;
  }
  const fontPx: number = Math.max(7, Math.floor(halfW * 0.34));
  ctx.font = fontPx + 'px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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
  tier: number,
  layer: number = 1
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);

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

  // 指令重构：上行 VIA 标 CALL（跨层跳转），下行标 RET（返回）；锁定不标
  if (!locked) {
    drawCenterLabel(ctx, cx, cy, halfW, up ? 'CALL' : 'RET', COLOR_VIA_TEXT);
  }
}

// GATE = ALU 运算门：地板 + 横向三道栅栏 + 中心算子文本
// locked=true：红栅栏（操作数不足）；locked=false：青绿栅栏 + 算子名（可执行）
// aluOp ≥ 0 时中心显示算子助记符（ADD/MUL/...），否则退回锁/钥匙孔标识
export function drawGate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  locked: boolean,
  layer: number = 1,
  aluOp: number = -1
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);
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

  // 中心标识：优先显示 ALU 算子名；无算子时退回锁体 / 钥匙孔
  if (aluOp >= 0) {
    drawCenterLabel(ctx, cx, cy, halfW, aluOpName(aluOp), COLOR_GATE_TEXT);
  } else {
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
}

// FRAGMENT = 操作数碎片：地板 + 按 kind 选皮肤（寄存器蓝 / 立即数金 / 地址橙）+ 标签
// kind：FragmentKind；label：操作数文本（如 eax / #5 / [addr_A0]）
export function drawFragment(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  layer: number = 1,
  kind: number = -1,
  label: string = ''
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);

  // 皮肤色
  let color: string = COLOR_FRAGMENT;
  if (kind === FragmentKind.REGISTER) {
    color = COLOR_FRAG_REGISTER;
  } else if (kind === FragmentKind.IMMEDIATE) {
    color = COLOR_FRAG_IMMEDIATE;
  } else if (kind === FragmentKind.ADDRESS) {
    color = COLOR_FRAG_ADDRESS;
  }

  if (kind === FragmentKind.IMMEDIATE) {
    // 立即数：金色小方标签
    const s: number = halfW * 0.42;
    ctx.fillStyle = color;
    ctx.fillRect(cx - s, cy - s * 0.6, s * 2, s * 1.2);
  } else if (kind === FragmentKind.ADDRESS) {
    // 地址：橙色方块 + 内描边（"[ ]"语义）
    const s: number = halfW * 0.45;
    ctx.fillStyle = color;
    ctx.fillRect(cx - s, cy - s * 0.6, s * 2, s * 1.2);
    ctx.strokeStyle = '#0a0e1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - s * 0.55, cy - s * 0.32, s * 1.1, s * 0.64);
  } else {
    // 寄存器（及兜底）：蓝色芯片菱形
    drawMarker(ctx, cx, cy, halfW, halfH, color);
  }

  // 标签：去掉地址方括号显示更紧凑
  const shown: string = label.replace('[', '').replace(']', '');
  drawCenterLabel(ctx, cx, cy + halfH * 0.05, halfW, shown, COLOR_VIA_TEXT);
}

// RAW_HAZARD = 数据冒险格：地板 + 品红斜纹危险块 + "RAW" 标签
export function drawRawHazard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  layer: number = 1
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);

  // 品红菱形底
  const r: number = 0.62;
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH * r);
  ctx.lineTo(cx + halfW * r, cy);
  ctx.lineTo(cx, cy + halfH * r);
  ctx.lineTo(cx - halfW * r, cy);
  ctx.closePath();
  ctx.fillStyle = COLOR_RAW_FILL;
  ctx.fill();

  // 两道高光斜纹（危险警示）
  ctx.strokeStyle = COLOR_RAW_STRIPE;
  ctx.lineWidth = Math.max(1, halfW * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.35, cy + halfH * 0.18);
  ctx.lineTo(cx + halfW * 0.1, cy - halfH * 0.4);
  ctx.moveTo(cx - halfW * 0.05, cy + halfH * 0.4);
  ctx.lineTo(cx + halfW * 0.4, cy - halfH * 0.18);
  ctx.stroke();

  drawCenterLabel(ctx, cx, cy, halfW, 'RAW', COLOR_RAW_TEXT);
}

// THERMAL_VIA：地板 + 青白冷光双层同心圆 + 外圈虚环
// 视觉差异：无方向三角（区别 VIA）；冷色调（区别 FRAGMENT 暖色与 GATE 红色）
export function drawThermalVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  layer: number = 1
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);

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
  halfH: number,
  layer: number = 1
): void {
  drawFloor(ctx, cx, cy, halfW, halfH, layer);

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
      drawFloor(ctx, cx, cy, halfW, halfH, currentLayer);
      break;
    case TileType.WALL:
      drawFloor(ctx, cx, cy, halfW, halfH, currentLayer);
      drawWall(ctx, cx, cy, halfW, halfH, wallH);
      break;
    case TileType.VIA:
      drawVia(
        ctx, cx, cy, halfW, halfH,
        tile.viaTarget > currentLayer, tile.locked, tile.viaTier, currentLayer
      );
      break;
    case TileType.GATE:
      drawGate(ctx, cx, cy, halfW, halfH, tile.locked, currentLayer, tile.aluOp);
      break;
    case TileType.FRAGMENT:
      drawFragment(ctx, cx, cy, halfW, halfH, currentLayer, tile.fragKind, tile.operandLabel);
      break;
    case TileType.THERMAL_VIA:
      drawThermalVia(ctx, cx, cy, halfW, halfH, currentLayer);
      break;
    case TileType.EXIT:
      drawExit(ctx, cx, cy, halfW, halfH, currentLayer);
      break;
    case TileType.RAW_HAZARD:
      drawRawHazard(ctx, cx, cy, halfW, halfH, currentLayer);
      break;
    default:
      drawFloor(ctx, cx, cy, halfW, halfH, currentLayer);
      break;
  }
}
