// 玩家状态模型：离散网格坐标 + 视觉补间
// Day 3 不引入朝向 / 状态机，保持纯数据，便于 GameEngine 驱动

export class Player {
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
    this.col += dCol;
    this.row += dRow;
    this.progress = 0;
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
