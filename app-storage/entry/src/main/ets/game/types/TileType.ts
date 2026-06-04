// 瓦片类型与瓦片数据定义
// Day 4 起携带 viaTarget；Day 7 增 viaTier；指令重构起 FRAGMENT/GATE 叠加指令语义元数据 + 新增 RAW_HAZARD

// 瓦片类型枚举
export enum TileType {
  FLOOR = 0,        // 可行走地板
  WALL = 1,         // 阻挡墙体
  VIA = 2,          // 层间通孔（分 L1/L2/MEM 三级；交互显示 CALL/RET）
  GATE = 3,         // 逻辑门 / ALU 运算门（指令重构后承载 ALU 算子）
  FRAGMENT = 4,     // 信号碎片 = 操作数（寄存器/立即数/地址三类皮肤）
  THERMAL_VIA = 5,  // 散热通道，踩踏本层热量 -30（PIPELINE FLUSH）
  EXIT = 6,         // 终点 = STORE/WB 写回，顶层 1 个
  RAW_HAZARD = 7    // 数据冒险格（RAW）：踩上失效一个持有寄存器操作数
}

// 单个瓦片数据
// viaTarget 仅 VIA 使用（-1 哨兵）；viaTier：0=L1 / 1=L2 / 2=MEM，非 VIA 为 -1
// locked：GATE / 上行 VIA 默认 true
// 指令语义元数据（默认空 / -1，由 MapManager 在放置后标注）：
//   - fragKind / operandLabel：FRAGMENT 承载的操作数皮肤与标签（如 REGISTER + "eax"）
//   - aluOp / aluOperands：GATE 承载的 ALU 算子与源操作数（如 MUL + "ecx, edx"）
//   - instrIndex：来源指令序号（信息面板展示）
export class Tile {
  type: TileType;
  viaTarget: number;
  locked: boolean;
  viaTier: number;

  // 指令语义元数据
  fragKind: number = -1;        // FragmentKind，-1 表示非操作数碎片
  operandLabel: string = '';    // 操作数标签
  aluOp: number = -1;           // AluOp，-1 表示非 ALU 门
  aluOperands: string = '';     // ALU 源操作数文本
  instrIndex: number = -1;      // 来源指令序号

  constructor(type: TileType, viaTarget: number = -1, locked: boolean = false, viaTier: number = -1) {
    this.type = type;
    this.viaTarget = viaTarget;
    this.locked = locked;
    this.viaTier = viaTier;
  }
}
