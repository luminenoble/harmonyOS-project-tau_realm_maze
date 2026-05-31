// 结算页 AI 评语接口（Day 8 占位实现 + 真接口预留）
// 演示版基于规则拼接 "芯片工程师视角" 评语；Day 9+ 替换为真实 LLM 调用零改动

// 评语所需的结算数据（与 GameEngine.VictoryStats 平行；rating 由 ResultPage 算完传入）
export interface AIPromptStats {
  steps: number;
  tauVia: number;
  tau: number;
  l1: number;
  l2: number;
  mem: number;
  heatPeak: number[];
  rating: string;
}

// 构造真实 LLM 调用的 prompt 模板
// Day 8 占位实现内部不会调用它，但导出便于调试与后续接入
// 风格：芯片工程师 + 韬定律视角，要求评语 ≤ 3 行
export function buildAIPrompt(stats: AIPromptStats): string {
  const heatStr: string = stats.heatPeak.map((h: number, idx: number) => {
    return 'L' + idx + '=' + Math.floor(h);
  }).join(', ');

  // 中文 prompt；演示用，参数名贴近实际游戏术语
  return [
    '你是一位芯片设计工程师，请用韬定律（Tao\'s Law）的视角',
    '基于以下走线数据给出 3 行以内的简短评语（不超过 80 字）：',
    '- 总 τ = ' + stats.tau + ' cycles（步数 ' + stats.steps + ' + VIA 延迟 ' + stats.tauVia + '）',
    '- VIA 使用：L1×' + stats.l1 + ' / L2×' + stats.l2 + ' / MEM×' + stats.mem,
    '- 各层热量峰值：' + heatStr,
    '- 评级：' + stats.rating,
    '关注点：缓存层级选择是否合理、热管理是否到位、是否存在绕路。'
  ].join('\n');
}

// 获取评语；演示版规则驱动，真实接入时替换内部实现即可
// 接口签名稳定为 Promise<string>，方便 Day 9+ 切到 fetch / axios 等异步调用
export async function getAIComment(stats: AIPromptStats): Promise<string> {
  // Day 8: 占位实现 — 规则驱动拼接评语
  // Day 9: 替换为真实 API 调用，例如:
  //   const prompt = buildAIPrompt(stats);
  //   const resp = await fetch('https://api.example.com/chat', { body: prompt });
  //   return resp.text();
  return Promise.resolve(generatePlaceholderComment(stats));
}

// 规则驱动占位评语：根据 stats 命中条件输出对应段落
// 输出格式：1-3 行，每行一个观察点；以"."分句方便 ResultPage 渲染
function generatePlaceholderComment(stats: AIPromptStats): string {
  const lines: string[] = [];

  // 1) 开头一句：基于评级总览
  lines.push(buildOpening(stats));

  // 2) VIA 选择观察（最重要的一条，必输出）
  lines.push(buildViaObservation(stats));

  // 3) 热管理观察（仅在峰值 ≥ 70 或 < 40 极端时输出）
  const peak: number = stats.heatPeak.reduce((a: number, b: number) => Math.max(a, b), 0);
  if (peak >= 70 || peak < 40) {
    lines.push(buildHeatObservation(stats, peak));
  }

  // 4) 绕路观察（仅在步数较高时输出）
  if (stats.steps >= 100) {
    lines.push('走线步数 ' + stats.steps + '，存在显著绕路；下次可在 Layer 1 寻找横向直达通道。');
  }

  return lines.join('\n');
}

// 开场句：评级 + τ 概览
function buildOpening(stats: AIPromptStats): string {
  if (stats.rating === 'S') {
    return '链路评估：τ = ' + stats.tau + '，黄金路径级别走线。';
  }
  if (stats.rating === 'A') {
    return '链路评估：τ = ' + stats.tau + '，整体节奏稳健。';
  }
  if (stats.rating === 'B') {
    return '链路评估：τ = ' + stats.tau + '，存在优化空间。';
  }
  return '链路评估：τ = ' + stats.tau + '，时延偏高，需要重新规划走线。';
}

// VIA 使用观察：根据 L1/L2/MEM 比例给建议
function buildViaObservation(stats: AIPromptStats): string {
  const total: number = stats.l1 + stats.l2 + stats.mem;
  if (total === 0) {
    return 'VIA 通道未被使用（疑似未切层）。';
  }
  if (stats.mem > stats.l1 + stats.l2) {
    return '你的路径过度依赖 MEM-VIA（' + stats.mem + ' 次），相当于频繁走主存路径，τ 因此偏高。建议优先寻找 L1 通孔。';
  }
  if (stats.l1 >= 2 && stats.tau <= 80) {
    return 'L1-VIA 利用充分（' + stats.l1 + ' 次），缓存命中路径接近最优。';
  }
  if (stats.l2 > stats.l1 + stats.mem) {
    return 'L2-VIA 是本局主力（' + stats.l2 + ' 次），属于中等延迟折中策略。';
  }
  return 'VIA 分布：L1×' + stats.l1 + ' / L2×' + stats.l2 + ' / MEM×' + stats.mem + '，缓存层级使用较均衡。';
}

// 热管理观察：高峰值警告 / 低峰值表扬
function buildHeatObservation(stats: AIPromptStats, peak: number): string {
  // 找出最热的层
  let hotLayer: number = 0;
  for (let i = 1; i < stats.heatPeak.length; i++) {
    if (stats.heatPeak[i] > stats.heatPeak[hotLayer]) {
      hotLayer = i;
    }
  }
  if (peak >= 90) {
    return 'Layer ' + hotLayer + ' 热量峰值 ' + Math.floor(peak)
        + '，已逼近强制弹层阈值。下次记得绕路踩散热通道。';
  }
  if (peak >= 70) {
    return 'Layer ' + hotLayer + ' 热量峰值 ' + Math.floor(peak)
        + '，散热压力明显。建议规划路径时优先经过 THERMAL_VIA。';
  }
  return '热管理优秀（峰值仅 ' + Math.floor(peak) + '），路径与冷却兼顾得当。';
}
