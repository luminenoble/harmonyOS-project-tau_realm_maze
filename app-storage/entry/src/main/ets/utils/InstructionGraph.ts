// 指令序列解析 + 操作数依赖图（DAG）→ 地图分配方案
// 输入：DeepSeek 返回的指令 JSON（或离线预置）；输出：ProgramPlan（操作数池 + ALU 序列）
// MapManager 据此把语义「标注」到已生成的 FRAGMENT / GATE 瓦片上

import {
  Instruction, InstructionProgram, FragmentKind,
  classifyOperand, aluOpFromMnemonic, isLoadMnemonic, isStoreMnemonic
} from '../game/data/Instruction';

// 一个操作数碎片规格（贴到 FRAGMENT 瓦片）
export interface OperandSpec {
  label: string;        // "eax" / "#5" / "[addr_A0]"
  kind: FragmentKind;   // 皮肤类型
  instrIndex: number;   // 来源指令序号
}

// 一个 ALU 运算门规格（贴到 GATE 瓦片）
export interface AluGateSpec {
  op: number;           // AluOp
  operands: string;     // "ecx, edx"（信息面板展示）
  instrIndex: number;   // 来源指令序号
  comment: string;      // 指令注释
}

// 本局地图分配方案
export class ProgramPlan {
  operands: OperandSpec[];   // 待 LOAD 的操作数碎片
  aluGates: AluGateSpec[];   // ALU 运算门
  totalInstr: number;        // 总指令数（CPI 分母）
  instrType: string;         // 运算场景描述

  constructor(operands: OperandSpec[], aluGates: AluGateSpec[], totalInstr: number, instrType: string) {
    this.operands = operands;
    this.aluGates = aluGates;
    this.totalInstr = totalInstr;
    this.instrType = instrType;
  }
}

// 拆分操作数字符串为 token 列表（按逗号分隔、去空白、滤空）
function splitOperands(operands: string): string[] {
  const parts: string[] = operands.split(',');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const t: string = parts[i].trim();
    if (t.length > 0) {
      out.push(t);
    }
  }
  return out;
}

export class InstructionGraph {
  // 从程序构建地图分配方案
  // - LOAD/MOV：取其「源操作数」（最后一个 token）作为待拾取碎片
  // - ALU 指令：登记为 ALU 门，operands 展示去掉目标后的源组合
  // - STORE：写回（= EXIT），不进碎片 / 门池
  static buildPlan(program: InstructionProgram): ProgramPlan {
    const operands: OperandSpec[] = [];
    const aluGates: AluGateSpec[] = [];
    const list: Instruction[] = program.instructions;

    for (let i = 0; i < list.length; i++) {
      const ins: Instruction = list[i];
      const tokens: string[] = splitOperands(ins.operands);

      if (isLoadMnemonic(ins.mnemonic)) {
        // 取被加载的「值」：双操作数取源（末位），单操作数取自身
        const src: string = tokens.length > 0 ? tokens[tokens.length - 1] : ins.operands.trim();
        if (src.length > 0) {
          operands.push({
            label: src,
            kind: classifyOperand(src),
            instrIndex: ins.index
          });
        }
        continue;
      }

      const op: number = aluOpFromMnemonic(ins.mnemonic);
      if (op >= 0) {
        // 源操作数组合：3 操作数（dest,a,b）取后两位，2 操作数取全部
        let srcStr: string = ins.operands.trim();
        if (tokens.length >= 3) {
          srcStr = tokens[tokens.length - 2] + ', ' + tokens[tokens.length - 1];
        } else if (tokens.length === 2) {
          srcStr = tokens[0] + ', ' + tokens[1];
        }
        aluGates.push({
          op: op,
          operands: srcStr,
          instrIndex: ins.index,
          comment: ins.comment
        });
        continue;
      }
      // STORE / 其它：不入池（STORE 由 EXIT 承载）
    }

    return new ProgramPlan(operands, aluGates, list.length, program.instrType);
  }

  // 解析 DeepSeek 返回文本为指令数组
  // 容错：剥离 ```json ... ``` 代码围栏；非数组 / 字段缺失时尽量兜底
  // 返回 [] 表示解析失败（调用方据此回退离线序列）
  static parseInstructions(raw: string): Instruction[] {
    if (raw === undefined || raw === null) {
      return [];
    }
    const json: string = InstructionGraph.stripCodeFence(raw);
    let arr: object;
    try {
      arr = JSON.parse(json) as object;
    } catch (_e) {
      return [];
    }
    if (!Array.isArray(arr)) {
      return [];
    }
    const raws: object[] = arr as object[];
    const out: Instruction[] = [];
    for (let i = 0; i < raws.length; i++) {
      const item: Record<string, Object> = raws[i] as Record<string, Object>;
      const mnemonic: string = InstructionGraph.asString(item['mnemonic']);
      if (mnemonic.length === 0) {
        continue;
      }
      out.push({
        index: InstructionGraph.asNumber(item['index'], out.length + 1),
        mnemonic: mnemonic,
        operands: InstructionGraph.asString(item['operands']),
        comment: InstructionGraph.asString(item['comment']),
        depth: InstructionGraph.asNumber(item['depth'], 0)
      });
    }
    return out;
  }

  // 剥离 markdown 代码围栏，截取首个 '[' 到末个 ']'，提升 JSON.parse 成功率
  private static stripCodeFence(raw: string): string {
    let s: string = raw.trim();
    // 去掉 ```json / ``` 围栏
    s = s.replace(/```json/g, '').replace(/```/g, '').trim();
    const start: number = s.indexOf('[');
    const end: number = s.lastIndexOf(']');
    if (start >= 0 && end > start) {
      return s.substring(start, end + 1);
    }
    return s;
  }

  // 安全取字符串（null/undefined → ''）
  private static asString(v: Object): string {
    if (v === undefined || v === null) {
      return '';
    }
    return String(v).trim();
  }

  // 安全取数字（无法解析 → fallback）
  private static asNumber(v: Object, fallback: number): number {
    if (v === undefined || v === null) {
      return fallback;
    }
    const n: number = Number(v);
    return isNaN(n) ? fallback : n;
  }
}
