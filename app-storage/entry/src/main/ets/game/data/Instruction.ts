// 机器指令世界观数据模型：指令 / 操作数 / ALU 算子 / 难度配置
// 玩家执行一段 AI 生成的合法汇编序列：LOAD/MOV 取操作数 → ALU 运算 → STORE 写回
// 集中所有枚举与难度常量，供 InstructionGraph / DeepSeekService / 渲染 / UI 共用

// 操作数碎片三类皮肤（new-design 3.1）
export enum FragmentKind {
  REGISTER = 0,   // 寄存器：蓝色芯片，标 eax/ebx/ecx/edx/esi/edi
  IMMEDIATE = 1,  // 立即数：金色标签，标 #5/#FF
  ADDRESS = 2     // 内存地址：橙色方块，标 [addr]
}

// ALU 运算算子（对应 ALU 门 new-design 3.2）
export enum AluOp {
  ADD = 0, SUB = 1, MUL = 2,
  AND = 3, OR = 4, XOR = 5,
  SHL = 6, SHR = 7
}

// 难度（new-design 2.1）；不影响层数，仅改指令数 / 并行宽度 / 每层碎片数
export enum Difficulty {
  EASY = 0,
  NORMAL = 1,
  HARD = 2
}

// 单条指令（与 DeepSeek 返回 JSON 字段对齐）
export interface Instruction {
  index: number;       // 序号（从 1 开始）
  mnemonic: string;    // 助记符 LOAD/MOV/ADD/MUL/...
  operands: string;    // 操作数字符串，如 "eax, [addr_A0]"
  comment: string;     // 中文注释
  depth: number;       // 依赖图（DAG）深度，从 0 开始
}

// 一段完整程序（本局的指令序列）
export interface InstructionProgram {
  difficulty: Difficulty;
  instrType: string;          // 运算场景描述，如 "1×2 向量内积"
  instructions: Instruction[];
  fromFallback: boolean;      // 是否来自离线预置（UI 可标注 "OFFLINE"）
}

// 难度配置：指令数 / 每层最大并行 / 每层碎片数 / 显示名
export class DifficultyConfig {
  readonly difficulty: Difficulty;
  readonly instrCount: number;        // 目标指令数
  readonly maxWidth: number;          // DAG 同深度最大宽度（每层最大并行指令）
  readonly fragmentsPerLayer: number; // 与每层最大并行对齐
  readonly label: string;
  readonly scene: string;             // 典型运算场景（fallback / prompt 提示）

  constructor(
    difficulty: Difficulty, instrCount: number, maxWidth: number,
    fragmentsPerLayer: number, label: string, scene: string
  ) {
    this.difficulty = difficulty;
    this.instrCount = instrCount;
    this.maxWidth = maxWidth;
    this.fragmentsPerLayer = fragmentsPerLayer;
    this.label = label;
    this.scene = scene;
  }
}

// 难度配置表（索引对齐 Difficulty 枚举）
export const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  new DifficultyConfig(Difficulty.EASY, 9, 2, 2, 'Easy', '两数相加并写回'),
  new DifficultyConfig(Difficulty.NORMAL, 12, 3, 3, 'Normal', '1×2 向量内积'),
  new DifficultyConfig(Difficulty.HARD, 15, 4, 4, 'Hard', '位运算 + 条件累加')
];

// 取难度配置；越界兜底 Normal
export function difficultyConfig(d: Difficulty): DifficultyConfig {
  if (d < 0 || d >= DIFFICULTY_CONFIGS.length) {
    return DIFFICULTY_CONFIGS[Difficulty.NORMAL];
  }
  return DIFFICULTY_CONFIGS[d];
}

// 难度显示名
export function difficultyName(d: Difficulty): string {
  return difficultyConfig(d).label;
}

// 合法寄存器集合（与 prompt 约束一致）
export const REGISTERS: string[] = ['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi'];

// 助记符 → AluOp；非 ALU 指令返回 -1
export function aluOpFromMnemonic(m: string): number {
  const up: string = m.trim().toUpperCase();
  switch (up) {
    case 'ADD': return AluOp.ADD;
    case 'SUB': return AluOp.SUB;
    case 'MUL': return AluOp.MUL;
    case 'AND': return AluOp.AND;
    case 'OR': return AluOp.OR;
    case 'XOR': return AluOp.XOR;
    case 'SHL': return AluOp.SHL;
    case 'SHR': return AluOp.SHR;
    default: return -1;
  }
}

// AluOp → 助记符文本
export const ALU_OP_NAMES: string[] = ['ADD', 'SUB', 'MUL', 'AND', 'OR', 'XOR', 'SHL', 'SHR'];

export function aluOpName(op: number): string {
  if (op < 0 || op >= ALU_OP_NAMES.length) {
    return 'ALU';
  }
  return ALU_OP_NAMES[op];
}

// LOAD 类指令（取操作数 = 拾取碎片）：LOAD / MOV
export function isLoadMnemonic(m: string): boolean {
  const up: string = m.trim().toUpperCase();
  return up === 'LOAD' || up === 'MOV';
}

// STORE 类指令（写回 = EXIT）
export function isStoreMnemonic(m: string): boolean {
  return m.trim().toUpperCase() === 'STORE';
}

// 操作数 token 分类：'[' 开头=地址 / '#' 开头=立即数 / 否则=寄存器
export function classifyOperand(token: string): FragmentKind {
  const t: string = token.trim();
  if (t.length > 0 && t.charAt(0) === '[') {
    return FragmentKind.ADDRESS;
  }
  if (t.length > 0 && t.charAt(0) === '#') {
    return FragmentKind.IMMEDIATE;
  }
  return FragmentKind.REGISTER;
}

// 碎片皮肤短名（信息面板 / HUD 用）
export function fragmentKindName(kind: number): string {
  if (kind === FragmentKind.IMMEDIATE) {
    return '立即数';
  }
  if (kind === FragmentKind.ADDRESS) {
    return '内存地址';
  }
  return '寄存器';
}
