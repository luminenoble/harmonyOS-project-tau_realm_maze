// 本局指令程序的跨页面共享（模块级单例）
// LoadingPage 生成后 set，GamePage 读取构建地图；避免 router 传大对象
// 注意：单例随进程存活；重新开局前由 LoadingPage 覆盖写入

import { InstructionProgram } from '../game/data/Instruction';
import { ProgramPlan } from './InstructionGraph';

let _program: InstructionProgram | null = null;
let _plan: ProgramPlan | null = null;

// 写入本局程序 + 分配方案
export function setProgram(program: InstructionProgram, plan: ProgramPlan): void {
  _program = program;
  _plan = plan;
}

// 读取本局程序（未设置返回 null）
export function getProgram(): InstructionProgram | null {
  return _program;
}

// 读取本局分配方案（未设置返回 null）
export function getPlan(): ProgramPlan | null {
  return _plan;
}

// 清空（返回主菜单时可调用）
export function clearProgram(): void {
  _program = null;
  _plan = null;
}
