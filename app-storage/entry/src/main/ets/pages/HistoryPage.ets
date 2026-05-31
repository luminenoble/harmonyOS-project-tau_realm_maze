// 历史记录页：展示当前用户的通关记录列表
// 支持评级筛选（全部/S/A/B/C）+ 时间筛选（全部/今天/本周/本月）

import { router } from '@kit.ArkUI';
import { GameRecord, queryGameRecords, RecordFilter, initDb } from '../utils/DbHelper';
import { getCurrentUserId } from '../utils/UserSession';

// 评级筛选选项
const RATING_OPTIONS: string[] = ['全部', 'S', 'A', 'B', 'C'];

// 时间筛选选项：显示名 → 内部值
interface TimeOption {
  label: string;
  value: string;
}
const TIME_OPTIONS: TimeOption[] = [
  { label: '全部', value: '' },
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' }
];

@Entry
@Component
struct HistoryPage {
  @State records: GameRecord[] = [];
  @State selectedRating: number = 0;   // 索引，0=全部
  @State selectedTime: number = 0;     // 索引，0=全部
  @State loading: boolean = true;

  aboutToAppear(): void {
    this.loadRecords();
  }

  // 加载记录（先确保 DB 已就绪，再应用筛选条件）
  private async loadRecords(): Promise<void> {
    this.loading = true;
    await initDb(getContext(this));
    const userId: number = getCurrentUserId();
    if (userId < 0) {
      this.loading = false;
      return;
    }

    const filter: RecordFilter = {};
    // 评级筛选
    if (this.selectedRating > 0) {
      filter.rating = RATING_OPTIONS[this.selectedRating];
    }
    // 时间筛选
    if (this.selectedTime > 0) {
      filter.timeRange = TIME_OPTIONS[this.selectedTime].value;
    }

    try {
      this.records = await queryGameRecords(userId, filter);
    } catch (_e) {
      this.records = [];
    }
    this.loading = false;
  }

  // 评级牌颜色
  private ratingColor(rating: string): string {
    if (rating === 'S') return '#ffd24a';
    if (rating === 'A') return '#22d3a8';
    if (rating === 'B') return '#d6dde6';
    return '#d63b3b';
  }

  // 格式化时间戳
  private formatTime(ts: number): string {
    const d: Date = new Date(ts);
    const mon: string = (d.getMonth() + 1).toString().padStart(2, '0');
    const day: string = d.getDate().toString().padStart(2, '0');
    const hour: string = d.getHours().toString().padStart(2, '0');
    const min: string = d.getMinutes().toString().padStart(2, '0');
    return mon + '-' + day + ' ' + hour + ':' + min;
  }

  // 筛选栏
  @Builder
  FilterBar() {
    Column() {
      // 评级筛选
      Row() {
        Text('评级')
          .fontSize(13)
          .fontColor('#88a0b8')
          .width(40)

        ForEach(RATING_OPTIONS, (opt: string, idx: number) => {
          Text(opt)
            .fontSize(13)
            .fontColor(this.selectedRating === idx ? '#0a0e1a' : '#88a0b8')
            .backgroundColor(this.selectedRating === idx ? '#22d3a8' : '#1a2238')
            .borderRadius(4)
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .margin({ left: 8 })
            .onClick(() => {
              this.selectedRating = idx;
              this.loadRecords();
            })
        }, (opt: string) => opt)
      }
      .width('100%')
      .margin({ bottom: 12 })

      // 时间筛选
      Row() {
        Text('时间')
          .fontSize(13)
          .fontColor('#88a0b8')
          .width(40)

        ForEach(TIME_OPTIONS, (opt: TimeOption, idx: number) => {
          Text(opt.label)
            .fontSize(13)
            .fontColor(this.selectedTime === idx ? '#0a0e1a' : '#88a0b8')
            .backgroundColor(this.selectedTime === idx ? '#22d3a8' : '#1a2238')
            .borderRadius(4)
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .margin({ left: 8 })
            .onClick(() => {
              this.selectedTime = idx;
              this.loadRecords();
            })
        }, (opt: TimeOption) => opt.value)
      }
      .width('100%')
    }
    .padding({ left: 24, right: 24, top: 16, bottom: 16 })
  }

  // 单条记录卡片
  @Builder
  RecordCard(record: GameRecord) {
    Row() {
      // 左侧：评级大字
      Column() {
        Text(record.rating)
          .fontSize(36)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.ratingColor(record.rating))
        Text('τ=' + record.tau)
          .fontSize(12)
          .fontColor('#88a0b8')
          .margin({ top: 2 })
      }
      .width(70)
      .alignItems(HorizontalAlign.Center)

      // 中间：详细数据
      Column() {
        // 步数 + VIA 延迟
        Text('步数 ' + record.steps + '  +  VIA延迟 ' + record.tauVia)
          .fontSize(13)
          .fontColor('#cfe3ff')
          .margin({ bottom: 4 })

        // VIA 分布
        Row() {
          Text('L1×' + record.l1Count)
            .fontSize(11)
            .fontColor('#ffd24a')
          Text('  L2×' + record.l2Count)
            .fontSize(11)
            .fontColor('#d6dde6')
          Text('  MEM×' + record.memCount)
            .fontSize(11)
            .fontColor('#c98b5b')
        }
        .margin({ bottom: 4 })

        // AI 评语摘要（截断显示）
        if (record.aiComment !== '') {
          Text(record.aiComment.length > 40
            ? record.aiComment.substring(0, 40) + '...'
            : record.aiComment)
            .fontSize(11)
            .fontColor('#5a7088')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
      .padding({ left: 12 })

      // 右侧：时间
      Text(this.formatTime(record.playedAt))
        .fontSize(11)
        .fontColor('#3a4a60')
        .width(80)
        .textAlign(TextAlign.End)
    }
    .width('100%')
    .padding(16)
    .backgroundColor('#111928')
    .borderRadius(8)
    .border({ width: 1, color: '#22d3a818' })
    .margin({ bottom: 8 })
  }

  build() {
    Column() {
      // 顶栏：返回 + 标题
      Row() {
        Button('← 返回')
          .fontSize(13)
          .fontColor('#88a0b8')
          .backgroundColor('#1a2238')
          .height(34)
          .onClick(() => {
            router.back();
          })

        Text('历史记录')
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor('#e8f4ff')
          .margin({ left: 16 })

        Blank()

        Text(this.records.length + ' 条记录')
          .fontSize(12)
          .fontColor('#5a7088')
      }
      .width('100%')
      .padding({ left: 24, right: 24, top: 20, bottom: 8 })

      // 筛选栏
      this.FilterBar()

      // 记录列表
      if (this.loading) {
        Column() {
          Text('加载中...')
            .fontSize(14)
            .fontColor('#5a7088')
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else if (this.records.length === 0) {
        Column() {
          Text('暂无记录')
            .fontSize(16)
            .fontColor('#3a4a60')
          Text('完成通关后记录将自动保存')
            .fontSize(12)
            .fontColor('#2a3a50')
            .margin({ top: 8 })
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        List({ space: 0 }) {
          ForEach(this.records, (record: GameRecord) => {
            ListItem() {
              this.RecordCard(record)
            }
          }, (record: GameRecord) => record.id.toString())
        }
        .layoutWeight(1)
        .padding({ left: 24, right: 24 })
        .scrollBar(BarState.Auto)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0a0e1a')
  }
}
