// 玩家状态模型：离散网格坐标 + 视觉补间
// Day 3 不引入朝向 / 状态机，保持纯数据，便于 GameEngine 驱动
// Day 8 新增：身后 3 格残影（trail）；指令重构新增：持有操作数列表（控制信号寄存器现态）

// 残影队列长度（玩家身后保留的格数）
const TRAIL_LEN: number = 3;

// 持有的操作数（= 已 LOAD 进寄存器文件的值）
export interface HeldOperand {
  label: string;   // "eax" / "#5" / "[addr_A0]"
  kind: number;    // FragmentKind
}

export class Player {
  // 持有操作数列表（控制信号当前掌握的寄存器值）；跨层持续（寄存器文件全局）
  // 拾取碎片 → push；踩 RAW 冒险 → 失效一个；ALU 门通过 → push 结果寄存器
  heldOperands: HeldOperand[] = [];

  // 拾取一个操作数
  addOperand(label: string, kind: number): void {
    this.heldOperands.push({ label: label, kind: kind });
  }

  // 是否持有指定标签的操作数
  hasOperand(label: string): boolean {
    for (let i = 0; i < this.heldOperands.length; i++) {
      if (this.heldOperands[i].label === label) {
        return true;
      }
    }
    return false;
  }

  // RAW 冒险：失效一个持有操作数（优先寄存器类，否则末位）；返回失效的标签（无则 ''）
  invalidateOneOperand(): string {
    if (this.heldOperands.length === 0) {
      return '';
    }
    // 优先剔除寄存器类（kind===0），更贴近"寄存器值被覆盖"语义
    for (let i = this.heldOperands.length - 1; i >= 0; i--) {
      if (this.heldOperands[i].kind === 0) {
        const lbl: string = this.heldOperands[i].label;
        this.heldOperands.splice(i, 1);
        return lbl;
      }
    }
    const last: HeldOperand = this.heldOperands[this.heldOperands.length - 1];
    this.heldOperands.pop();
    return last.label;
  }

  // 当前逻辑坐标（移动结束后停留的格）
  col: number;
  row: number;

  // 补间起点（动画期间使用）
  private fromCol: number;
  private fromRow: number;

  // 0..1 进度：1 表示静止已到位
  private progress: number;

  // 每 tick 进度增量；约 10 tick / 格（@16ms ≈ 160ms 一格）
  // Day 6 起改为可变：过热时 GameEngine 会调 setSpeed(0.05) 让动画时长翻倍
  private speed: number = 0.1;

  // Day 8：身后残影队列（FIFO），每项为 [col, row]
  // 队首为最旧，队尾为最近一次离开的格子；最多保留 TRAIL_LEN 项
  trail: number[][] = [];

  // 由 GameEngine 在 tryMove 前按当前热量调整；幂等
  // 输入 clamp 到 [0.01, 1]，避免 0 卡死或 >1 导致首帧瞬移
  setSpeed(s: number): void {
    const lo: number = 0.01;
    const hi: number = 1;
    this.speed = s < lo ? lo : (s > hi ? hi : s);
  }

  constructor(col: number, row: number) {
    this.col = col;
    this.row = row;
    this.fromCol = col;
    this.fromRow = row;
    this.progress = 1;
  }

  // 启动一次移动：调用方需先做碰撞 / 越界检查
  startMove(dCol: number, dRow: number): void {
    this.fromCol = this.col;
    this.fromRow = this.row;
    // Day 8：把刚离开的格子 push 进 trail；超长丢弃最旧
    this.trail.push([this.col, this.row]);
    if (this.trail.length > TRAIL_LEN) {
      this.trail.shift();
    }
    this.col += dCol;
    this.row += dRow;
    this.progress = 0;
  }

  // Day 8：切层 / 弹层后清空残影（残影属于上一层语义）
  clearTrail(): void {
    this.trail = [];
  }

  // 推进一帧补间，返回是否仍在动画中
  tick(): boolean {
    if (this.progress >= 1) {
      return false;
    }
    this.progress += this.speed;
    if (this.progress > 1) {
      this.progress = 1;
    }
    return this.progress < 1;
  }

  // 当前是否正在补间
  isAnimating(): boolean {
    return this.progress < 1;
  }

  // 视觉插值坐标，供 Painter's 排序与渲染使用
  visualCol(): number {
    return this.fromCol + (this.col - this.fromCol) * this.progress;
  }

  visualRow(): number {
    return this.fromRow + (this.row - this.fromRow) * this.progress;
  }
}
