export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GridPoint {
  col: number;
  row: number;
}

export class IsoConfig {
  public tileHalfW: number;
  public tileHalfH: number;
  public layerOffset: number;
  public originX: number;
  public originY: number;

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

export function gridToScreen(col: number, row: number, layer: number, cfg: IsoConfig): ScreenPoint {
  const x: number = (col - row) * cfg.tileHalfW + cfg.originX;
  const y: number = (col + row) * cfg.tileHalfH + cfg.originY + layer * cfg.layerOffset;
  return { x: x, y: y };
}

export function screenToGrid(screenX: number, screenY: number, layer: number, cfg: IsoConfig): GridPoint {
  const dx: number = screenX - cfg.originX;
  const dy: number = screenY - cfg.originY - layer * cfg.layerOffset;
  const col: number = (dx / cfg.tileHalfW + dy / cfg.tileHalfH) / 2;
  const row: number = (dy / cfg.tileHalfH - dx / cfg.tileHalfW) / 2;
  return { col: col, row: row };
}
