// 等距瓦片渲染：单瓦片菱形绘制 + 整张地图按 Painter's Algorithm 排序绘制
// Day 1 提供 drawIsoGrid（仅地板）；Day 2 起主要用 drawMap（按 MapManager 数据分派瓦片类型）

import { gridToScreen, IsoConfig, ScreenPoint } from '../../utils/IsoMath';
import { MapManager } from '../core/MapManager';
import { Player } from '../core/Player';
import { drawTile, drawFloor, drawWall } from './TileSet';
import { drawPlayer, drawTrail } from './PlayerRenderer';
import { Tile, TileType } from '../types/TileType';

// 瓦片视觉样式：填充色、描边色、线宽（保留给 Day 1 旧 API 使用）
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

// 绘制单个菱形瓦片（Day 1 保留）
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

// 批量绘制等距纯地板网格（Day 1 调试用，保留）
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
      const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
      drawDiamondTile(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, style);
    }
  }
}

// Pass 2 立体层的渲染项类型：WALL 块或玩家
// 用三元组 [col, row, kind] 编码；玩家排序 key 末尾加 0.001 偏移避免 z-fighting
const KIND_WALL: number = 0;
const KIND_PLAYER: number = 1;

// 两遍渲染绘制整张地图：
//   Pass 1（地板层，row-major 无排序）：每个 cell 先垫地板，非 WALL cell 再叠地面标识（VIA 三角 / GATE 栅 / FRAGMENT / THERMAL_VIA 等）
//   Pass 2（立体层，painter's 排序）：WALL 块 + 玩家棱柱，按 row+col 升序绘制
// 拆分原因：玩家移动到浮点坐标时会跨越两格，painter's 排序下"前方格地板"key 大于玩家，
// 会在玩家底面之后绘制，覆盖玩家右下侧 → 视觉上"角色部分消失"。
// 两遍渲染让所有地板提前画完，立体物之间仍 painter's 排序保证墙脚 / 墙后遮挡正确。
export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: MapManager,
  cfg: IsoConfig,
  wallH: number,
  layer: number = 0,
  player?: Player,
  playerH?: number
): void {
  // ===== Pass 1: 地板层 =====
  // 同一平面上绘制，任意顺序结果一致；不参与立体排序
  // WALL cell 只画地板（垫底，让 pass 2 的墙块有边可对齐），不画墙块本身
  // 其余 cell 走 drawTile 走完整流程（含 VIA 三角 / GATE 栅 / FRAGMENT 等）
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile: Tile | undefined = map.getTile(c, r, layer);
      if (tile === undefined) {
        continue;
      }
      const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
      if (tile.type === TileType.WALL) {
        // Day 8：墙脚 FLOOR 也跟随层冷暖
        drawFloor(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, layer);
      } else {
        drawTile(ctx, tile, layer, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
      }
    }
  }

  // Day 8：玩家身后残影（贴地板层级，画完地板后立即绘制）
  // trail 已由 Player 维护；切层时 GameEngine 调 clearTrail，避免视觉残留
  if (player !== undefined && player.trail.length > 0) {
    drawTrail(ctx, player.trail, cfg, layer);
  }

  // ===== Pass 2: 立体层（WALL 块 + Player） =====
  // 共用 row+col key 排序，让玩家走到墙后被前方墙遮挡，走到墙前覆盖后方墙
  const sprites: number[][] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile: Tile | undefined = map.getTile(c, r, layer);
      if (tile === undefined) {
        continue;
      }
      if (tile.type === TileType.WALL) {
        sprites.push([c, r, KIND_WALL]);
      }
    }
  }
  if (player !== undefined) {
    // 玩家排序键加 0.001 偏移，与同 row+col 的 WALL z-fighting 时偏向"靠前"
    sprites.push([player.visualCol() + 0.001, player.visualRow() + 0.001, KIND_PLAYER]);
  }
  sprites.sort((a: number[], b: number[]) => {
    const ka: number = a[0] + a[1];
    const kb: number = b[0] + b[1];
    if (ka !== kb) {
      return ka - kb;
    }
    return a[1] - b[1];
  });

  const ph: number = (playerH === undefined) ? wallH * 0.6 : playerH;
  for (let i = 0; i < sprites.length; i++) {
    const c: number = sprites[i][0];
    const r: number = sprites[i][1];
    const kind: number = sprites[i][2];
    const p: ScreenPoint = gridToScreen(c, r, layer, cfg);

    if (kind === KIND_PLAYER) {
      drawPlayer(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, ph);
    } else {
      // KIND_WALL：只画墙块（地板已在 pass 1 画过）
      drawWall(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
    }
  }
}

// ===== 分层渲染（离屏静态层缓存）=====
// 把"静态地图"（地板 + 特殊瓦片 + 墙）与"动态对象"（残影 + 玩家）拆成两层：
//   静态层仅在 mapVersion / 层号 / 画布尺寸变化时重画（drawMapStatic）；
//   动态层每帧重画（drawPlayerLayer）。
// 代价：墙块全部位于静态层之下，玩家恒画在最上层 → 不再被前方墙体遮挡
//   （短墙 wallH≈0.45×halfW，等距下遮挡轻微；换来每帧绘制量大幅下降）。

// 静态层：地板 + 特殊瓦片（Pass 1）+ 墙块（Pass 2，墙间 painter's 排序）；不含玩家 / 残影
export function drawMapStatic(
  ctx: CanvasRenderingContext2D,
  map: MapManager,
  cfg: IsoConfig,
  wallH: number,
  layer: number = 0
): void {
  // Pass 1：地板层（WALL cell 仅垫地板，其余走完整 drawTile）
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile: Tile | undefined = map.getTile(c, r, layer);
      if (tile === undefined) {
        continue;
      }
      const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
      if (tile.type === TileType.WALL) {
        drawFloor(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, layer);
      } else {
        drawTile(ctx, tile, layer, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
      }
    }
  }

  // Pass 2：墙块（按 row+col 升序，保证墙间前后遮挡正确）
  const walls: number[][] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile: Tile | undefined = map.getTile(c, r, layer);
      if (tile !== undefined && tile.type === TileType.WALL) {
        walls.push([c, r]);
      }
    }
  }
  walls.sort((a: number[], b: number[]) => {
    const ka: number = a[0] + a[1];
    const kb: number = b[0] + b[1];
    if (ka !== kb) {
      return ka - kb;
    }
    return a[1] - b[1];
  });
  for (let i = 0; i < walls.length; i++) {
    const p: ScreenPoint = gridToScreen(walls[i][0], walls[i][1], layer, cfg);
    drawWall(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, wallH);
  }
}

// 动态层：玩家身后残影 + 玩家本体（每帧重画，画在静态层之上）
export function drawPlayerLayer(
  ctx: CanvasRenderingContext2D,
  cfg: IsoConfig,
  layer: number,
  player: Player,
  playerH: number
): void {
  if (player.trail.length > 0) {
    drawTrail(ctx, player.trail, cfg, layer);
  }
  const p: ScreenPoint = gridToScreen(player.visualCol(), player.visualRow(), layer, cfg);
  drawPlayer(ctx, p.x, p.y, cfg.tileHalfW, cfg.tileHalfH, playerH);
}

// Day 6：重构 PULSE 阶段的高亮叠加
// opened cell（新开通道）→ 青绿菱形覆盖到地板位置
// closed cell（新堵墙）→ 红色菱形覆盖到墙顶位置（-wallH 抬高，对齐 drawWall 顶面）
// alpha 由 GameEngine.pulseAlpha 提供（1→0 渐隐）；alpha ≤ 0 直接跳过
const COLOR_PULSE_OPEN: string = '#22d3a8';
const COLOR_PULSE_CLOSE: string = '#ff6b6b';

export function drawRestructurePulse(
  ctx: CanvasRenderingContext2D,
  cfg: IsoConfig,
  layer: number,
  openedCells: number[][],
  closedCells: number[][],
  alpha: number,
  wallH: number
): void {
  if (alpha <= 0) {
    return;
  }
  const a: number = alpha > 1 ? 1 : alpha;
  ctx.globalAlpha = a;

  // 新通道：地板层级，菱形铺满
  ctx.fillStyle = COLOR_PULSE_OPEN;
  for (let i = 0; i < openedCells.length; i++) {
    const c: number = openedCells[i][0];
    const r: number = openedCells[i][1];
    const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - cfg.tileHalfH);
    ctx.lineTo(p.x + cfg.tileHalfW, p.y);
    ctx.lineTo(p.x, p.y + cfg.tileHalfH);
    ctx.lineTo(p.x - cfg.tileHalfW, p.y);
    ctx.closePath();
    ctx.fill();
  }

  // 新墙：抬高到墙顶位置
  ctx.fillStyle = COLOR_PULSE_CLOSE;
  for (let i = 0; i < closedCells.length; i++) {
    const c: number = closedCells[i][0];
    const r: number = closedCells[i][1];
    const p: ScreenPoint = gridToScreen(c, r, layer, cfg);
    const cy: number = p.y - wallH;
    ctx.beginPath();
    ctx.moveTo(p.x, cy - cfg.tileHalfH);
    ctx.lineTo(p.x + cfg.tileHalfW, cy);
    ctx.lineTo(p.x, cy + cfg.tileHalfH);
    ctx.lineTo(p.x - cfg.tileHalfW, cy);
    ctx.closePath();
    ctx.fill();
  }

  // 状态还原，防 HarmonyOS Canvas alpha 泄漏
  ctx.globalAlpha = 1;
}

// score-algorithm：落点可激活提示（玩家站在已解锁 VIA / EXIT 上时）
// 在该格地板层画一圈金色菱形描边，提示"按 EXEC 激活"
// phase01 0..1 驱动呼吸透明度；IDLE 不重绘时定格为静态高亮，仍清晰可辨
const COLOR_INTERACT_RING: string = '#ffd24a';

export function drawInteractHighlight(
  ctx: CanvasRenderingContext2D,
  cfg: IsoConfig,
  layer: number,
  col: number,
  row: number,
  phase01: number
): void {
  const p: ScreenPoint = gridToScreen(col, row, layer, cfg);
  // 呼吸透明度 [0.45, 0.95]
  const a: number = 0.7 + 0.25 * Math.sin(phase01 * Math.PI * 2);
  ctx.globalAlpha = a < 0 ? 0 : (a > 1 ? 1 : a);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLOR_INTERACT_RING;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - cfg.tileHalfH);
  ctx.lineTo(p.x + cfg.tileHalfW, p.y);
  ctx.lineTo(p.x, p.y + cfg.tileHalfH);
  ctx.lineTo(p.x - cfg.tileHalfW, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;
}
