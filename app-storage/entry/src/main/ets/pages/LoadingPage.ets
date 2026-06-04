// 终端风格加载页（new-design 2.2）
// 等待 DeepSeek 返回期间显示终端日志 + 进度条；返回后解析指令、写入 ProgramStore，跳 GamePage
import { router } from '@kit.ArkUI';
import { Difficulty, InstructionProgram, difficultyConfig } from '../game/data/Instruction';
import { generateProgram } from '../utils/DeepSeekService';
import { InstructionGraph, ProgramPlan } from '../utils/InstructionGraph';
import { setProgram } from '../utils/ProgramStore';

// 路由参数
interface LoadingParams {
  difficulty: number;
}

@Entry
@Component
struct LoadingPage {
  @State logLines: string[] = [];
  @State progress: number = 0;
  private difficulty: Difficulty = Difficulty.NORMAL;
  private progressTimer: number = -1;
  private navigated: boolean = false;

  aboutToAppear(): void {
    const raw: object = router.getParams() as object;
    if (raw !== null && raw !== undefined) {
      const p: LoadingParams = raw as LoadingParams;
      if (p.difficulty !== undefined && p.difficulty !== null) {
        this.difficulty = p.difficulty as Difficulty;
      }
    }
    const cfg = difficultyConfig(this.difficulty);
    this.pushLog('> Connecting to DeepSeek API...');
    this.pushLog('> Generating instruction sequence [' + cfg.label + ' / ' + cfg.instrCount + ' ops]...');

    // 假进度条：缓慢推进到 90%，等真实返回后冲 100%
    this.progressTimer = setInterval(() => {
      if (this.progress < 90) {
        this.progress += 3;
      }
    }, 120);

    this.runGeneration();
  }

  aboutToDisappear(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.progressTimer !== -1) {
      clearInterval(this.progressTimer);
      this.progressTimer = -1;
    }
  }

  private pushLog(line: string): void {
    this.logLines = this.logLines.concat([line]);
  }

  // 调用生成 + 解析 + 跳转
  private async runGeneration(): Promise<void> {
    let program: InstructionProgram;
    try {
      program = await generateProgram(this.difficulty);
    } catch (_e) {
      // generateProgram 内部已兜底，这里再保一层
      this.pushLog('> [WARN] API 异常，载入离线预置序列。');
      return;
    }

    if (program.fromFallback) {
      this.pushLog('> [WARN] API 不可用，载入离线预置序列。');
    } else {
      this.pushLog('> Response received. Parsing operand dependency graph...');
    }
    this.pushLog('> Scene: ' + program.instrType + ' (' + program.instructions.length + ' ops)');

    // 逐行打印前几条指令（终端滚动感）
    const maxPrint: number = Math.min(program.instructions.length, 6);
    for (let i = 0; i < maxPrint; i++) {
      const ins = program.instructions[i];
      this.pushLog('  [' + ins.index + '] ' + ins.mnemonic + ' ' + ins.operands);
    }
    if (program.instructions.length > maxPrint) {
      this.pushLog('  ... (+' + (program.instructions.length - maxPrint) + ' more)');
    }

    // 构建分配方案并写入共享单例
    const plan: ProgramPlan = InstructionGraph.buildPlan(program);
    setProgram(program, plan);

    this.pushLog('> Allocating fragments to layers...');
    this.pushLog('> Map render complete.');
    this.progress = 100;
    this.stopTimer();

    // 略停后进入游戏
    setTimeout(() => {
      this.goGame();
    }, 700);
  }

  private goGame(): void {
    if (this.navigated) {
      return;
    }
    this.navigated = true;
    router.replaceUrl({ url: 'pages/GamePage' });
  }

  build() {
    Column() {
      Text('TauRealmMaze · 指令装载')
        .fontSize(16)
        .fontColor('#22d3a8')
        .margin({ bottom: 16 })

      // 终端日志区
      Scroll() {
        Column() {
          ForEach(this.logLines, (line: string, idx: number) => {
            Text(line)
              .fontSize(13)
              .fontFamily('monospace')
              .fontColor(line.indexOf('[WARN]') >= 0 ? '#ff9a40' : '#7df7d4')
              .width('100%')
              .textAlign(TextAlign.Start)
              .margin({ bottom: 2 })
          }, (line: string, idx: number) => idx + '-' + line)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
      }
      .width(560)
      .height(280)
      .padding(16)
      .backgroundColor('#0d1424')
      .borderRadius(8)
      .border({ width: 1, color: '#22d3a833' })
      .align(Alignment.TopStart)

      // 进度条
      Progress({ value: this.progress, total: 100, type: ProgressType.Linear })
        .color('#22d3a8')
        .style({ strokeWidth: 8 })
        .width(560)
        .margin({ top: 20 })
      Text(Math.floor(this.progress) + ' %')
        .fontSize(12)
        .fontColor('#88a0b8')
        .margin({ top: 6 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#0a0e1a')
  }
}
