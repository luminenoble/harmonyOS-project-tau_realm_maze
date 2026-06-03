// 结算页：通关后展示 τ 值 + S/A/B/C 评级 + VIA 分布 + 热量峰值
// 平板横屏布局：左侧大评级牌 + 右侧统计 + 底部按钮
// Day 8 在评级牌下方追加"芯片工程师评语"区（接 AIComment.ts）

import { router } from '@kit.ArkUI';
import { getAIComment, AIPromptStats } from '../utils/AIComment';
import { insertGameRecord, initDb } from '../utils/DbHelper';
import { getCurrentUserId } from '../utils/UserSession';
import { cpiRating, ratingTagline, layerName, tierShort } from '../game/data/Semantics';

// 通过 router.getParams() 传入的结构；字段必须与 GameEngine.VictoryStats 对齐
// score-algorithm：新增最优路径对照字段，CPI = tau / optimalTau
interface ResultParams {
  steps: number;
  tauVia: number;
  tau: number;
  l1: number;
  l2: number;
  mem: number;
  heatPeak: number[];
  optimalTau: number;
  optimalSteps: number;
  optimalViaTiers: number[];
  playerViaTiers: number[];
}

@Entry
@Component
struct ResultPage {
  // 解析路由参数；缺省给 0 / 空数组兜底（避免直接打开页面时崩溃）
  @State steps: number = 0;
  @State tauVia: number = 0;
  @State tau: number = 0;
  @State l1: number = 0;
  @State l2: number = 0;
  @State mem: number = 0;
  @State heatPeak: number[] = [0, 0, 0];
  // score-algorithm：最优路径对照（CPI 分母 + tier 选择对比）
  @State optimalTau: number = 1;
  @State optimalSteps: number = 0;
  @State optimalViaTiers: number[] = [];
  @State playerViaTiers: number[] = [];
  // Day 8：AI 评语；加载中显示占位文案，getAIComment resolve 后切到正文
  @State aiComment: string = '正在分析指令执行...';
  // 是否已保存到数据库（避免重复写入）
  private saved: boolean = false;

  aboutToAppear(): void {
    const raw: object = router.getParams() as object;
    if (raw === null || raw === undefined) {
      return;
    }
    const p: ResultParams = raw as ResultParams;
    this.steps = p.steps;
    this.tauVia = p.tauVia;
    this.tau = p.tau;
    this.l1 = p.l1;
    this.l2 = p.l2;
    this.mem = p.mem;
    if (p.heatPeak !== undefined && p.heatPeak !== null && p.heatPeak.length > 0) {
      this.heatPeak = p.heatPeak;
    }
    // score-algorithm：最优对照（optimalTau 兜底 ≥1 防 CPI 除零）
    if (p.optimalTau !== undefined && p.optimalTau !== null && p.optimalTau > 0) {
      this.optimalTau = p.optimalTau;
    }
    if (p.optimalSteps !== undefined && p.optimalSteps !== null) {
      this.optimalSteps = p.optimalSteps;
    }
    if (p.optimalViaTiers !== undefined && p.optimalViaTiers !== null) {
      this.optimalViaTiers = p.optimalViaTiers;
    }
    if (p.playerViaTiers !== undefined && p.playerViaTiers !== null) {
      this.playerViaTiers = p.playerViaTiers;
    }
    // Day 8：异步取 AI 评语（演示版 Promise.resolve 立即完成）
    this.loadAIComment();
  }

  // 异步加载评语，完成后自动保存记录到数据库
  private loadAIComment(): void {
    const stats: AIPromptStats = {
      steps: this.steps,
      tauVia: this.tauVia,
      tau: this.tau,
      l1: this.l1,
      l2: this.l2,
      mem: this.mem,
      heatPeak: this.heatPeak,
      rating: this.rating()
    };
    getAIComment(stats)
      .then((text: string) => {
        this.aiComment = text;
        // 评语就绪后保存完整记录
        this.saveRecord(text);
      })
      .catch((_err: Error) => {
        this.aiComment = '评语生成失败，请重试。';
        // 即使评语失败也保存记录
        this.saveRecord('');
      });
  }

  // 将通关数据 + AI 评语写入数据库
  private async saveRecord(comment: string): Promise<void> {
    if (this.saved) {
      return;
    }
    this.saved = true;
    const uid: number = getCurrentUserId();
    if (uid < 0) {
      return;
    }
    try {
      await initDb(getContext(this));
      await insertGameRecord(
        uid, this.steps, this.tauVia, this.tau,
        this.rating(), this.l1, this.l2, this.mem,
        this.heatPeak, comment
      );
    } catch (_e) {
      // 存储失败静默处理，不影响结算展示
    }
  }

  // CPI = 玩家 τ / 理论最优 τ（1.0 = 完美）；optimalTau 已兜底 ≥1
  private cpi(): number {
    if (this.optimalTau <= 0) {
      return this.tau;
    }
    return this.tau / this.optimalTau;
  }

  // CPI 评级：S ≤1.2 / A ≤2.0 / B ≤4.0 / C
  private rating(): string {
    return cpiRating(this.cpi());
  }

  // 评级牌颜色：S 金 / A 青绿 / B 银 / C 暗红
  private ratingColor(): string {
    const r: string = this.rating();
    if (r === 'S') {
      return '#ffd24a';
    }
    if (r === 'A') {
      return '#22d3a8';
    }
    if (r === 'B') {
      return '#d6dde6';
    }
    return '#d63b3b';
  }

  // 流水线效率 = 最优 τ / 玩家 τ × 100，cap 100（玩家=最优 → 100%）
  private pipelineEfficiency(): number {
    if (this.tau <= 0) {
      return 0;
    }
    const v: number = this.optimalTau / this.tau * 100;
    if (v > 100) {
      return 100;
    }
    return Math.round(v * 10) / 10;
  }

  // 热量峰值色：≥80 红 / ≥50 黄 / 其他青绿（与 GamePage 一致）
  private heatPeakColor(v: number): string {
    if (v >= 80) {
      return '#ff6b6b';
    }
    if (v >= 50) {
      return '#ffd166';
    }
    return '#22d3a8';
  }

  // 左侧：CPI 评级牌 + 实际/最优 τ + 流水线效率
  @Builder
  RatingPanel() {
    Column() {
      Text('指令执行报告')
        .fontSize(20)
        .fontColor('#88a0b8')
        .margin({ bottom: 4 })
      Text('LOAD R1, [addr] · 取指→译码→执行→访存→写回')
        .fontSize(11)
        .fontColor('#5a7088')
        .margin({ bottom: 18 })

      // 评级大字 + 语义副标题
      Text(this.rating())
        .fontSize(132)
        .fontWeight(FontWeight.Bold)
        .fontColor(this.ratingColor())
        .margin({ bottom: 2 })
      Text(ratingTagline(this.rating()))
        .fontSize(13)
        .fontColor(this.ratingColor())
        .margin({ bottom: 16 })

      // CPI 核心指标（= 实际 τ / 理论最优 τ）
      Text('CPI = ' + this.cpi().toFixed(2))
        .fontSize(28)
        .fontColor('#e8f4ff')
        .margin({ bottom: 4 })
      Text('实际 τ ' + this.tau + '  ·  理论最优 ' + this.optimalTau + ' cycles')
        .fontSize(13)
        .fontColor('#5a7088')
        .margin({ bottom: 2 })
      Text('步数 ' + this.steps + ' + 缓存延迟 ' + this.tauVia
          + '   (最优步数 ' + this.optimalSteps + ')')
        .fontSize(12)
        .fontColor('#5a7088')
        .margin({ bottom: 18 })

      // 流水线效率（最优 / 实际）
      Text('流水线效率  ' + this.pipelineEfficiency() + ' %')
        .fontSize(16)
        .fontColor('#22d3a8')
        .margin({ bottom: 20 })

      // Day 8：芯片工程师评语卡片
      this.AICommentCard()
    }
    .width(360)
    .height('100%')
    .padding({ left: 24, right: 24, top: 48 })
    .alignItems(HorizontalAlign.Center)
  }

  // 评语卡片：标题 + 多行评语；与评级牌同色系深底
  @Builder
  AICommentCard() {
    Column() {
      Text('芯片工程师评语')
        .fontSize(12)
        .fontColor('#5a7088')
        .alignSelf(ItemAlign.Start)
        .margin({ bottom: 6 })
      Text(this.aiComment)
        .fontSize(13)
        .fontColor('#cfe3ff')
        .lineHeight(18)
        .textAlign(TextAlign.Start)
        .width('100%')
    }
    .width(300)
    .padding(12)
    .backgroundColor('#0d1424')
    .borderRadius(6)
    .border({ width: 1, color: '#22d3a833' })
    .alignItems(HorizontalAlign.Start)
  }

  // tier 序列文案："L1$ → DRAM"；空序列显示 '—'
  private tierSeqText(tiers: number[]): string {
    if (tiers === undefined || tiers === null || tiers.length === 0) {
      return '—';
    }
    let s: string = '';
    for (let i = 0; i < tiers.length; i++) {
      s += tierShort(tiers[i]);
      if (i < tiers.length - 1) {
        s += ' → ';
      }
    }
    return s;
  }

  // 右侧：缓存命中分布 + 最优/实际选择对照 + 各层热量峰值
  @Builder
  StatsPanel() {
    Column() {
      // 缓存命中分布（VIA 三级）
      Text('── 缓存命中分布 ──')
        .fontSize(14)
        .fontColor('#5a7088')
        .margin({ top: 48, bottom: 16 })

      this.ViaRow('L1$', this.l1, '#ffd24a', 'HIT · 1 cycle')
      this.ViaRow('L2$', this.l2, '#d6dde6', 'HIT · 3 cycles')
      this.ViaRow('DRAM', this.mem, '#c98b5b', 'ACCESS · 6 cycles')

      // 最优 vs 实际 缓存选择序列对照
      Row() {
        Text('最优建议')
          .fontSize(12)
          .fontColor('#5a7088')
          .width(72)
        Text(this.tierSeqText(this.optimalViaTiers))
          .fontSize(13)
          .fontColor('#22d3a8')
      }
      .margin({ top: 14 })
      Row() {
        Text('你的选择')
          .fontSize(12)
          .fontColor('#5a7088')
          .width(72)
        Text(this.tierSeqText(this.playerViaTiers))
          .fontSize(13)
          .fontColor('#ffd166')
      }
      .margin({ top: 6 })

      // 各层热量峰值
      Text('── 各层热量峰值 ──')
        .fontSize(14)
        .fontColor('#5a7088')
        .margin({ top: 28, bottom: 16 })

      ForEach(this.heatPeak, (peak: number, idx: number) => {
        this.HeatRow(idx, peak)
      }, (peak: number, idx: number) => idx + '-' + peak)
    }
    .layoutWeight(1)
    .height('100%')
    .padding({ left: 40, right: 40 })
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  ViaRow(label: string, count: number, color: string, hint: string) {
    Row() {
      Text(label)
        .fontSize(18)
        .fontColor(color)
        .width(60)
      Text('× ' + count)
        .fontSize(18)
        .fontColor('#e8f4ff')
        .width(60)
      Text(hint)
        .fontSize(12)
        .fontColor('#5a7088')
    }
    .margin({ bottom: 8 })
  }

  @Builder
  HeatRow(layer: number, peak: number) {
    Row() {
      Text(layerName(layer))
        .fontSize(12)
        .fontColor('#88a0b8')
        .width(104)
      Progress({ value: peak, total: 100, type: ProgressType.Linear })
        .color(this.heatPeakColor(peak))
        .style({ strokeWidth: 8 })
        .width(140)
      Text(Math.floor(peak) + ' / 100')
        .fontSize(14)
        .fontColor(this.heatPeakColor(peak))
        .margin({ left: 12 })
    }
    .margin({ bottom: 8 })
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Row() {
        this.RatingPanel()
        this.StatsPanel()
      }
      .width('100%')
      .height('100%')

      // 底部操作按钮
      Row() {
        Button('再来一局')
          .fontSize(14)
          .backgroundColor('#1a2238')
          .fontColor('#22d3a8')
          .height(40)
          .width(140)
          .onClick(() => {
            router.replaceUrl({ url: 'pages/GamePage' });
          })
        Button('返回主菜单')
          .fontSize(14)
          .backgroundColor('#22d3a8')
          .fontColor('#0a0e1a')
          .height(40)
          .width(140)
          .margin({ left: 16 })
          .onClick(() => {
            router.replaceUrl({ url: 'pages/Index' });
          })
      }
      .margin({ right: 40, bottom: 40 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0a0e1a')
  }
}
