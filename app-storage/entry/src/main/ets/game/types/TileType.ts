// 瓦片类型与瓦片数据定义
// Day 4 起 Tile 携带 viaTarget 字段，标记 VIA 节点的目标层号

// 瓦片类型枚举
export enum TileType {
  FLOOR = 0,    // 可行走地板
  WALL = 1,     // 阻挡墙体
  VIA = 2,      // 层间通孔
  GATE = 3,     // 逻辑门障碍（Day 5 启用）
  FRAGMENT = 4  // 信号碎片道具（Day 5 启用）
}

// 单个瓦片数据
// viaTarget 仅 VIA 类型使用，记录踩上去要传送到的层号
// 用 -1 哨兵值避免可选字段 ?: 在 ArkTS 严格模式下的不确定性
// locked Day 5 起：GATE 默认 true（需碎片解锁）；上行 VIA 默认 true、下行 VIA 默认 false
export class Tile {
  type: TileType;
  viaTarget: number;
  locked: boolean;

  constructor(type: TileType, viaTarget: number = -1, locked: boolean = false) {
    this.type = type;
    this.viaTarget = viaTarget;
    this.locked = locked;
  }
}
