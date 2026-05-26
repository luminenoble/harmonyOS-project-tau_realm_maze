// 等距（Isometric）坐标系工具：网格 ↔ 屏幕坐标互转
// 公式来源：CLAUDE.md 中的等距渲染数学原理

// 屏幕像素坐标
export interface ScreenPoint {
  x: number;
  y: number;
}

// 地图网格坐标（列、行）
export interface GridPoint {
  col: number;
  row: number;
}

// 等距渲染参数包：瓦片尺寸、层间偏移、画布原点
export class IsoConfig {
  public tileHalfW: number;
  public tileHalfH: number;
  public layerOffset: number;
  public originX: number;
  public originY: number;

  // 默认 2:1 等距比例（tileHalfW : tileHalfH = 32 : 16）
  // layerOffset 负值表示上层向屏幕上方偏移
  constructor(
    tileHalfW: number = 32,
    tileHalfH: number = 16,
    layerOffset: number = -24,
    originX: number = 0,
    originY: number = 80
  ) {
    this.tileHalfW = tileHalfW;
    this.tileHalfH = tileHalfH;
    this.layerOffset = layerOffset;
    this.originX = originX;
    this.originY = originY;
  }
}

// 网格坐标 → 屏幕坐标
// screen_x = (col - row) * tileHalfW + originX
// screen_y = (col + row) * tileHalfH + originY + layer * layerOffset
export function gridToScreen(col: number, row: number, layer: number, cfg: IsoConfig): ScreenPoint {
  const x: number = (col - row) * cfg.tileHalfW + cfg.originX;
  const y: number = (col + row) * cfg.tileHalfH + cfg.originY + layer * cfg.layerOffset;
  return { x: x, y: y };
}

// 屏幕坐标 → 网格坐标（用于触摸点击命中检测，Day3 起使用）
// 返回浮点 col/row，调用方需自行 floor 取整
export function screenToGrid(screenX: number, screenY: number, layer: number, cfg: IsoConfig): GridPoint {
  const dx: number = screenX - cfg.originX;
  const dy: number = screenY - cfg.originY - layer * cfg.layerOffset;
  const col: number = (dx / cfg.tileHalfW + dy / cfg.tileHalfH) / 2;
  const row: number = (dy / cfg.tileHalfH - dx / cfg.tileHalfW) / 2;
  return { col: col, row: row };
}
