// 瓦片类型与瓦片数据定义
// Day 2 仅生成 FLOOR / WALL，其余类型留占位接口给 Day 4-5 接入

// 瓦片类型枚举
export enum TileType {
  FLOOR = 0,    // 可行走地板
  WALL = 1,     // 阻挡墙体
  VIA = 2,      // 层间通孔（Day 4 启用）
  GATE = 3,     // 逻辑门障碍（Day 5 启用）
  FRAGMENT = 4  // 信号碎片道具（Day 5 启用）
}

// 单个瓦片数据
// 用 class 而非 interface：ArkTS 严格模式下 class 字面量与字段访问更稳妥
export class Tile {
  type: TileType;

  constructor(type: TileType) {
    this.type = type;
  }
}
