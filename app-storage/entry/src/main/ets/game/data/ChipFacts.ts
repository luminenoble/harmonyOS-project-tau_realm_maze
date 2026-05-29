// 芯片知识科普文本池
// 拾取信号碎片时随机弹一句，增强"韬定律"主题代入感

// 一句一行，避免长段落（Dialog 显示效果）
export const CHIP_FACTS: string[] = [
  '晶体管：芯片的最小开关，二维平面电路的基石。',
  '韬定律：芯片从平面布局演进到三维堆叠的设计跃迁。',
  'Via（通孔）：连接不同电路层的垂直信号通道。',
  'FinFET：鳍式晶体管，3D 结构突破二维栅长极限。',
  'EDA：电子设计自动化，芯片设计的核心软件工具链。',
  'Chiplet：芯粒，多个小芯片堆叠成大芯片的封装方案。',
  'HBM：高带宽内存，通过 TSV 垂直堆叠实现高速访问。',
  'TSV：硅通孔，3D IC 中跨晶圆的垂直互连工艺。',
  '2.5D 封装：Interposer 上并排多颗 die 的中间路径。',
  '3D 封装：芯片纵向堆叠，缩短互连降低功耗。',
  'RTL：寄存器传输级，硬件设计的高层描述语言。',
  '光刻：用紫外光把电路图案"印"到硅片上的工艺。'
];

// 顺序取文本：counter 单调递增、取模循环，避免连续重复
// 调用方维护 counter（如 GameEngine.fragments 总数）
export function pickFact(counter: number): string {
  const n: number = CHIP_FACTS.length;
  const i: number = ((counter % n) + n) % n;
  return CHIP_FACTS[i];
}
