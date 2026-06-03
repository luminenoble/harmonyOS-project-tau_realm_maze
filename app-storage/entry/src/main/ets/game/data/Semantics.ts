// 机器指令世界观语义映射：把游戏机制术语统一映射到 CPU 流水线 / 缓存概念
// 玩家 = 一条机器指令（如 LOAD R1,[addr]），目标是走完取指→译码→执行→访存→写回
// 集中此处避免散落硬编码，UI / 结算 / Overlay 共用

// 层语义名：Layer 0=Register File（最近最热，积热 ×2）/ 1=L1/L2 Cache / 2=Memory Bus（最远最冷）
export const LAYER_NAMES: string[] = ['Register File', 'L1/L2 Cache', 'Memory Bus'];

// 层语义名；越界兜底为通用 "Layer N"
export function layerName(layer: number): string {
  if (layer < 0 || layer >= LAYER_NAMES.length) {
    return 'Layer ' + layer;
  }
  return LAYER_NAMES[layer];
}

// VIA tier → 缓存命中术语：0=L1$ HIT（1 周期）/ 1=L2$ HIT（3 周期）/ 2=DRAM ACCESS（6 周期）
export const TIER_CACHE_NAMES: string[] = ['L1$ HIT', 'L2$ HIT', 'DRAM ACCESS'];
export const TIER_SHORT: string[] = ['L1$', 'L2$', 'DRAM'];
export const TIER_DELAYS: number[] = [1, 3, 6];

// 缓存命中全称；非法 tier 退化为 DRAM（最差，与延迟模型一致）
export function tierCacheName(tier: number): string {
  if (tier < 0 || tier >= TIER_CACHE_NAMES.length) {
    return 'DRAM ACCESS';
  }
  return TIER_CACHE_NAMES[tier];
}

// 缓存命中简称
export function tierShort(tier: number): string {
  if (tier < 0 || tier >= TIER_SHORT.length) {
    return 'DRAM';
  }
  return TIER_SHORT[tier];
}

// 行为语义术语（文案用）
export const TERM_FRAGMENT: string = 'LOAD 操作数';      // 收集信号碎片 = 取操作数
export const TERM_GATE: string = 'ALU 运算';             // 逻辑门 = AND/OR/XOR
export const TERM_THERMAL: string = 'PIPELINE FLUSH';    // 散热 = 流水线气泡
export const TERM_RESTRUCTURE: string = 'BRANCH MISPRED';// 动态重构 = 分支预测失败
export const TERM_EXIT: string = 'STORE / WB';           // 通关 = 写回寄存器/内存

// CPI（Cycles Per Instruction）评级阈值：CPI = playerτ / optimalτ
// S：超标量并行理想 / A：L1 全命中 / B：L2 部分命中 / C：频繁主存访问
export const CPI_S: number = 1.2;
export const CPI_A: number = 2.0;
export const CPI_B: number = 4.0;

// 由 CPI 给出 S/A/B/C 评级
export function cpiRating(cpi: number): string {
  if (cpi <= CPI_S) {
    return 'S';
  }
  if (cpi <= CPI_A) {
    return 'A';
  }
  if (cpi <= CPI_B) {
    return 'B';
  }
  return 'C';
}

// 各评级一句话语义（结算页副标题）
export function ratingTagline(rating: string): string {
  if (rating === 'S') {
    return '超标量并行 · 黄金路径';
  }
  if (rating === 'A') {
    return 'L1 全命中 · 节奏稳健';
  }
  if (rating === 'B') {
    return 'L2 部分命中 · 有优化空间';
  }
  return '频繁主存访问 · 需重排走线';
}
