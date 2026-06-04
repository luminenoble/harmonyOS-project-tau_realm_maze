// 多层地图数据容器（Day 4 起 3 层）
// 持有 Tile[][][]，按 layer 索引；构造时依次生成各层迷宫并放置 Via 节点

import { Tile, TileType } from '../types/TileType';
import { MazeGenerator, Rng } from '../../utils/MazeGenerator';
import { ProgramPlan, OperandSpec, AluGateSpec } from '../../utils/InstructionGraph';

// 行优先遍历的回调签名
export type TileVisitor = (tile: Tile, col: number, row: number) => void;

// 每对相邻层放置的 Via 数量
// Day 7：上调到 3，让每层 VIA 总数 ≈ 3-6（CLAUDE.md MVP 区间 3-4），
// 同时给 1:2:3 的 L1/L2/MEM 轮转分配留够样本量
const VIAS_PER_PAIR: number = 3;
// 每层信号碎片数默认值（指令重构后由难度配置覆盖：Easy2/Normal3/Hard4）
const FRAGMENTS_PER_LAYER_DEFAULT: number = 3;
// 每层逻辑门 / ALU 门数（MVP 阶段 1 个/层）
const GATES_PER_LAYER: number = 1;
// 每层散热通道数（Day 6，CLAUDE.md MVP 规定 2-3 个/层）
const THERMALS_PER_LAYER: number = 2;
// 每层 RAW 数据冒险格数（new-design 8.1：1-2 个/层）
const RAW_PER_LAYER_DEFAULT: number = 1;

export class MapManager {
  readonly cols: number;
  readonly rows: number;
  readonly layerCount: number;
  // [layer][row][col]
  private layers: Tile[][][];

  // 构造时生成所有层 + 放置特殊瓦片 + （可选）标注指令语义
  // seed 不传则用 Date.now；多层种子由主 Rng 派生，保证整体可复现
  // plan：本局指令分配方案（null 则保持纯几何瓦片，兼容旧调用）
  // fragmentsPerLayer / rawPerLayer：难度化参数（new-design 8.1）
  constructor(
    cols: number, rows: number, layerCount: number = 3, seed?: number,
    plan: ProgramPlan | null = null,
    fragmentsPerLayer: number = FRAGMENTS_PER_LAYER_DEFAULT,
    rawPerLayer: number = RAW_PER_LAYER_DEFAULT
  ) {
    this.cols = cols;
    this.rows = rows;
    this.layerCount = layerCount;

    const masterSeed: number = (seed === undefined) ? Date.now() : seed;
    const masterRng: Rng = new Rng(masterSeed);

    // 每层用 masterRng 派生子种子，避免各层迷宫雷同
    this.layers = [];
    for (let L = 0; L < layerCount; L++) {
      const layerSeed: number = Math.floor(masterRng.next() * 0xFFFFFFFF);
      this.layers.push(MazeGenerator.generate(cols, rows, layerSeed));
    }

    // 顺序：VIA → GATE → FRAGMENT → THERMAL_VIA → RAW → EXIT
    // - VIA 先占位避免后续 carve 错位
    // - GATE 先于 FRAGMENT：placeGates 用 BFS 校验 pre-GATE 区非空；placeFragments 据此 BFS 强制 1 碎片在 pre 区，断死锁
    // - THERMAL_VIA / RAW 落剩余 FLOOR；不参与连通性校验（可绕开）
    // - EXIT 最后放在顶层、距 (1,1) BFS 距离最大的 FLOOR cell，保证终点远离起点
    MazeGenerator.placeVias(this.layers, masterRng, VIAS_PER_PAIR);
    MazeGenerator.placeGates(this.layers, masterRng, GATES_PER_LAYER);
    MazeGenerator.placeFragments(this.layers, masterRng, fragmentsPerLayer);
    MazeGenerator.placeThermalVias(this.layers, masterRng, THERMALS_PER_LAYER);
    MazeGenerator.placeRawHazards(this.layers, masterRng, rawPerLayer);
    MazeGenerator.placeExit(this.layers, masterRng);

    // 指令重构：把操作数 / ALU 语义标注到已放置的 FRAGMENT / GATE 瓦片
    if (plan !== null) {
      this.applyPlan(plan);
    }
  }

  // 把 ProgramPlan 的操作数池 / ALU 序列 round-robin 标注到瓦片
  // 碎片数与操作数数不必相等：少则循环复用，多则截断；保证每个特殊瓦片都有语义可展示
  private applyPlan(plan: ProgramPlan): void {
    const operands: OperandSpec[] = plan.operands;
    const aluGates: AluGateSpec[] = plan.aluGates;

    let oi: number = 0;
    let gi: number = 0;
    for (let L = 0; L < this.layerCount; L++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const tile: Tile = this.layers[L][r][c];
          if (tile.type === TileType.FRAGMENT && operands.length > 0) {
            const spec: OperandSpec = operands[oi % operands.length];
            tile.fragKind = spec.kind;
            tile.operandLabel = spec.label;
            tile.instrIndex = spec.instrIndex;
            oi++;
          } else if (tile.type === TileType.GATE && aluGates.length > 0) {
            const g: AluGateSpec = aluGates[gi % aluGates.length];
            tile.aluOp = g.op;
            tile.aluOperands = g.operands;
            tile.instrIndex = g.instrIndex;
            gi++;
          }
        }
      }
    }
  }

  // 越界返回 undefined；层号越界同样返回 undefined
  getTile(col: number, row: number, layer: number = 0): Tile | undefined {
    if (layer < 0 || layer >= this.layerCount) {
      return undefined;
    }
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return undefined;
    }
    return this.layers[layer][row][col];
  }

  // 直接拿到某一层的 Tile[][]，供 Restructurer 等需要原地修改的子系统使用
  // 调用方负责保持外圈外墙、不破坏整体连通性（由 BFS 校验保障）
  getLayer(layer: number): Tile[][] {
    return this.layers[layer];
  }

  // 行优先遍历指定层（painter's 排序由 renderer 负责）
  forEach(cb: TileVisitor, layer: number = 0): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(this.layers[layer][r][c], c, r);
      }
    }
  }
}
