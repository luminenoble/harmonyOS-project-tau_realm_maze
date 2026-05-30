// 散热管理：每层独立热量值（0..100），底层积热 ×2，过热减速 / 强制弹层
// 映射韬定律下三维堆叠芯片的核心痛点：纵向叠层后底层散热困难

export class HeatManager {
  // 上限 / 阈值（公开静态供 GameEngine 与 UI 共享判断逻辑）
  static readonly MAX: number = 100;
  static readonly OVERHEAT_THRESHOLD: number = 80;    // 减速触发线
  static readonly FORCE_POP_THRESHOLD: number = 100;  // 强制弹层触发线
  static readonly HEAT_PER_STEP_BASE: number = 2;     // 中层每步 +2
  static readonly BOTTOM_LAYER_MULT: number = 2;      // 底层（Layer 0）×2 = +4
  static readonly COOL_AMOUNT: number = 30;           // THERMAL_VIA 单次降温

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

  // 玩家在 layer 走一步：按层级倍率升温，cap 在 MAX
  // 底层（Layer 0）倍率 ×2，其他层 ×1
  tickStep(layer: number): void {
    if (layer < 0 || layer >= this.layerCount) {
      return;
    }
    const mult: number = (layer === 0) ? HeatManager.BOTTOM_LAYER_MULT : 1;
    const next: number = this.heats[layer] + HeatManager.HEAT_PER_STEP_BASE * mult;
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
