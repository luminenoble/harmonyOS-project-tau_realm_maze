// 瓦片类型与瓦片数据定义
// Day 4 起 Tile 携带 viaTarget 字段；Day 7 增加 viaTier 标识 VIA 三级缓存分级

// 瓦片类型枚举
export enum TileType {
  FLOOR = 0,        // 可行走地板
  WALL = 1,         // 阻挡墙体
  VIA = 2,          // 层间通孔（Day 7 起分 L1/L2/MEM 三级）
  GATE = 3,         // 逻辑门障碍（Day 5 启用）
  FRAGMENT = 4,     // 信号碎片道具（Day 5 启用）
  THERMAL_VIA = 5,  // 散热通道（Day 6 启用），踩踏本层热量 -30，永久可用
  EXIT = 6          // 终点（Day 7 启用），顶层放 1 个，集齐全部碎片后到达即通关
}

// 单个瓦片数据
// viaTarget 仅 VIA 类型使用，记录踩上去要传送到的层号
// 用 -1 哨兵值避免可选字段 ?: 在 ArkTS 严格模式下的不确定性
// locked Day 5 起：GATE 默认 true（需碎片解锁）；上行 VIA 默认 true、下行 VIA 默认 false
// viaTier Day 7 起：0=L1 / 1=L2 / 2=MEM；非 VIA 一律 -1
export class Tile {
  type: TileType;
  viaTarget: number;
  locked: boolean;
  viaTier: number;

  constructor(type: TileType, viaTarget: number = -1, locked: boolean = false, viaTier: number = -1) {
    this.type = type;
    this.viaTarget = viaTarget;
    this.locked = locked;
    this.viaTier = viaTier;
  }
}
