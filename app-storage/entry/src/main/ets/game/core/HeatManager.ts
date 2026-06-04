// 散热管理：每层独立热量值（0..100），三层独立积热速率，过热减速 / 强制弹层
// 映射韬定律下三维堆叠芯片的核心痛点：纵向叠层后底层散热困难
// new-design 8.2：阈值下调 60/90 适配 19×19 更大地图；三层速率 [2, 1.5, 1]（4:3:2 耐久比）

export class HeatManager {
  // 上限 / 阈值（公开静态供 GameEngine 与 UI 共享判断逻辑）
  static readonly MAX: number = 100;
  static readonly OVERHEAT_THRESHOLD: number = 60;    // 减速触发线（原 80 → 60）
  static readonly FORCE_POP_THRESHOLD: number = 90;   // 强制弹层触发线（原 100 → 90）
  static readonly COOL_AMOUNT: number = 30;           // THERMAL_VIA 单次降温
  // 三层独立积热速率（new-design 8.2）：Layer 0 最快 → 最先过热
  // 下标对齐层号；越界层（理论不存在）退化为顶层速率 1
  static readonly HEAT_RATES: number[] = [2, 1.5, 1];

  readonly layerCount: number;
  // 各层独立热量；构造时全部 0
  private heats: number[];

  constructor(layerCount: number) {
    this.layerCount = layerCount;
    this.heats = [];
    for (let i = 0; i < layerCount; i++) {
      this.heats.push(0);
    }
  }

  // 该层每步积热速率；越界退化为 1
  static rateOf(layer: number): number {
    if (layer < 0 || layer >= HeatManager.HEAT_RATES.length) {
      return 1;
    }
    return HeatManager.HEAT_RATES[layer];
  }

  // 玩家在 layer 走一步：按该层速率升温，cap 在 MAX
  tickStep(layer: number): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    const next: number = this.heats[layer] + HeatManager.rateOf(layer);
    this.heats[layer] = next > HeatManager.MAX ? HeatManager.MAX : next;
  }

  // 踩到 THERMAL_VIA：本层热量 -amount，下界 0
  cool(layer: number, amount: number = HeatManager.COOL_AMOUNT): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    const next: number = this.heats[layer] - amount;
    this.heats[layer] = next < 0 ? 0 : next;
  }

  // 强制弹层后调用：把指定层热量清零（玩家离开本层后"凉下来"）
  reset(layer: number): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    this.heats[layer] = 0;
  }

  getHeat(layer: number): number {
    if (layer < 0 || layer >= this.layerCount) {
      return 0;
    }
    return this.heats[layer];
  }

  // 过热：进入减速区间（≥ 80）
  isOverheated(layer: number): boolean {
    return this.getHeat(layer) >= HeatManager.OVERHEAT_THRESHOLD;
  }

  // 临界：触发强制弹层（= 100，cap 后稳定在 100）
  isForcedPop(layer: number): boolean {
    return this.getHeat(layer) >= HeatManager.FORCE_POP_THRESHOLD;
  }
}
