// 结算页 AI 评语接口
// score-algorithm：接入 DeepSeek 真实调用——把"最优路径 + 玩家路径 + 缓存选择差值"喂给模型，
// 生成 CPU 微架构工程师视角点评。无 key 或请求失败时自动降级为规则占位实现，结算页不受影响。

import { http } from '@kit.NetworkKit';
import { DEEPSEEK_API_KEY, DEEPSEEK_ENDPOINT, DEEPSEEK_MODEL } from './ApiConfig';
import { tierShort, layerName } from '../game/data/Semantics';

// 评语所需的结算数据（与 GameEngine.VictoryStats 平行；rating/optimal* 由 ResultPage 传入）
export interface AIPromptStats {
  steps: number;          // 玩家实际步数
  tauVia: number;         // 玩家缓存延迟累计
  tau: number;            // 玩家总 τ
  l1: number;             // L1$ 命中次数
  l2: number;             // L2$ 命中次数
  mem: number;            // DRAM 访问次数
  heatPeak: number[];     // 各层热量峰值
  rating: string;         // CPI 评级 S/A/B/C
  optimalTau: number;     // 理论最优 τ（绕路分析参考）
  optimalSteps: number;   // 理论最优步数
  optimalViaTiers: number[];  // 最优各层应选 tier
  playerViaTiers: number[];   // 玩家各层实际选用 tier（时序）
  // 指令重构新增：CPI = (steps + tauVia) / totalInstr
  totalInstr: number;     // 总指令数（CPI 分母）
  instrType: string;      // 运算场景描述
  hazards: number;        // RAW 数据冒险触发次数
}

// DeepSeek Chat Completions 请求体（OpenAI 兼容）
interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

// 响应体（仅取 choices[0].message.content）
interface ChatRespMessage {
  content: string;
}

interface ChatRespChoice {
  message: ChatRespMessage;
}

interface ChatRespBody {
  choices: ChatRespChoice[];
}

// tier 序列文案："L1$ → DRAM"；空序列回 '无切层'
function formatTierSeq(tiers: number[]): string {
  if (tiers === undefined || tiers === null || tiers.length === 0) {
    return '无切层';
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

// CPI = (步数 + VIA延迟) / 总指令数（new-design 第七节）
function calcCpi(stats: AIPromptStats): number {
  if (stats.totalInstr <= 0) {
    return stats.tau;
  }
  return (stats.steps + stats.tauVia) / stats.totalInstr;
}

// 构造发给 DeepSeek 的 prompt：机器指令 / 流水线视角 + 最优对照差值
export function buildAIPrompt(stats: AIPromptStats): string {
  const cpi: number = calcCpi(stats);
  const heatStr: string = stats.heatPeak.map((h: number, idx: number) => {
    return layerName(idx) + '=' + Math.floor(h);
  }).join('、');

  return [
    '你是一位资深 CPU 微架构工程师，正在 review 一段指令序列的执行轨迹。',
    '请以流水线 / CPI 视角给出 3 行以内、不超过 90 字的中文点评并附一条优化建议：',
    '- 指令类型：' + stats.instrType + '（共 ' + stats.totalInstr + ' 条指令）',
    '- CPI = ' + cpi.toFixed(2) + '（(步数 ' + stats.steps + ' + 缓存延迟 ' + stats.tauVia + ') / 指令数 ' + stats.totalInstr + '）',
    '- 缓存命中：L1$×' + stats.l1 + ' / L2$×' + stats.l2 + ' / DRAM×' + stats.mem,
    '- 缓存层级选择：实际 [' + formatTierSeq(stats.playerViaTiers) + ']  vs  最优 [' + formatTierSeq(stats.optimalViaTiers) + ']',
    '- 数据冒险（RAW）触发：' + stats.hazards + ' 次',
    '- 各层热量峰值：' + heatStr,
    '- 评级：' + stats.rating,
    '关注：缓存层级选择是否最优、RAW 冒险是否拖慢流水线、热管理是否拉高 CPI。语气专业犀利、鼓励改进。'
  ].join('\n');
}

// 获取评语：有 key → 调 DeepSeek；无 key 或失败 → 规则占位（结算页永不卡死）
export async function getAIComment(stats: AIPromptStats): Promise<string> {
  // 未配置 key：直接占位实现（演示默认路径）
  if (DEEPSEEK_API_KEY === undefined || DEEPSEEK_API_KEY === null || DEEPSEEK_API_KEY.length === 0) {
    return Promise.resolve(generatePlaceholderComment(stats));
  }
  try {
    const prompt: string = buildAIPrompt(stats);
    const text: string = await callDeepSeek(prompt);
    if (text === undefined || text === null || text.length === 0) {
      return generatePlaceholderComment(stats);
    }
    return text;
  } catch (_e) {
    // 网络 / 解析失败 → 降级占位
    return generatePlaceholderComment(stats);
  }
}

// 真实调用 DeepSeek（@kit.NetworkKit http）；调用方负责 try/catch 降级
async function callDeepSeek(prompt: string): Promise<string> {
  const httpRequest = http.createHttp();
  try {
    const body: ChatRequestBody = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你是一位资深 CPU 微架构 / 芯片设计工程师，点评犀利、专业、鼓励改进。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 220,
      stream: false
    };
    const resp: http.HttpResponse = await httpRequest.request(DEEPSEEK_ENDPOINT, {
      method: http.RequestMethod.POST,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
      },
      extraData: JSON.stringify(body),
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: 10000,
      readTimeout: 20000
    });
    if (resp.responseCode !== 200) {
      throw new Error('DeepSeek HTTP ' + resp.responseCode);
    }
    // resp.result 为 JSON 字符串；解析取 choices[0].message.content
    const raw: object = JSON.parse(resp.result as string) as object;
    const parsed: ChatRespBody = raw as ChatRespBody;
    if (parsed.choices === undefined || parsed.choices === null || parsed.choices.length === 0) {
      throw new Error('DeepSeek empty choices');
    }
    return parsed.choices[0].message.content.trim();
  } finally {
    // 释放底层请求资源
    httpRequest.destroy();
  }
}

// ===== 以下为占位实现：无 key / 失败时的规则驱动评语 =====

// 规则驱动占位评语：根据 stats 命中条件输出对应段落
function generatePlaceholderComment(stats: AIPromptStats): string {
  const lines: string[] = [];

  // 1) 开头一句：CPI + 评级总览
  lines.push(buildOpening(stats));

  // 2) 缓存选择观察（最重要的一条，必输出）
  lines.push(buildViaObservation(stats));

  // 3) 热管理观察（仅在峰值 ≥ 70 或 < 40 极端时输出）
  const peak: number = stats.heatPeak.reduce((a: number, b: number) => Math.max(a, b), 0);
  if (peak >= 70 || peak < 40) {
    lines.push(buildHeatObservation(stats, peak));
  }

  // 4) 绕路观察（步数显著高于最优时输出）
  if (stats.optimalSteps > 0 && stats.steps >= stats.optimalSteps + 20) {
    const extra: number = stats.steps - stats.optimalSteps;
    lines.push('走线步数 ' + stats.steps + '，比最优多绕 ' + extra + ' 步；下次可在 L1/L2 Cache 层寻找横向直达通道。');
  }

  // 5) 数据冒险观察（触发 RAW 时输出）
  if (stats.hazards > 0) {
    lines.push('触发 ' + stats.hazards + ' 次 RAW 数据冒险，寄存器被迫重载；规划路径时尽量绕开冒险格以减少流水线气泡。');
  }

  return lines.join('\n');
}

// 开场句：CPI + 评级概览
function buildOpening(stats: AIPromptStats): string {
  const cpi: number = calcCpi(stats);
  const cpiStr: string = cpi.toFixed(2);
  if (stats.rating === 'S') {
    return '指令执行评估：CPI = ' + cpiStr + '，逼近超标量并行理想，黄金流水线。';
  }
  if (stats.rating === 'A') {
    return '指令执行评估：CPI = ' + cpiStr + '，L1 全命中级别，节奏稳健。';
  }
  if (stats.rating === 'B') {
    return '指令执行评估：CPI = ' + cpiStr + '，L2 部分命中，仍有优化空间。';
  }
  return '指令执行评估：CPI = ' + cpiStr + '，频繁主存访问，需要重排走线。';
}

// 缓存选择观察：根据 L1$/L2$/DRAM 比例给建议
function buildViaObservation(stats: AIPromptStats): string {
  const total: number = stats.l1 + stats.l2 + stats.mem;
  if (total === 0) {
    return '全程未切层（疑似未穿越任何缓存通孔）。';
  }
  if (stats.mem > stats.l1 + stats.l2) {
    return '路径过度依赖 DRAM ACCESS（' + stats.mem + ' 次），相当于频繁缓存未命中，CPI 因此被拉高。建议优先寻找 L1$ 通孔。';
  }
  if (stats.l1 >= 2) {
    return 'L1$ HIT 利用充分（' + stats.l1 + ' 次），缓存命中路径接近最优。';
  }
  if (stats.l2 > stats.l1 + stats.mem) {
    return 'L2$ HIT 是本局主力（' + stats.l2 + ' 次），属于中等延迟折中策略。';
  }
  return '缓存命中分布：L1$×' + stats.l1 + ' / L2$×' + stats.l2 + ' / DRAM×' + stats.mem + '，层级使用较均衡。';
}

// 热管理观察：高峰值警告 / 低峰值表扬
function buildHeatObservation(stats: AIPromptStats, peak: number): string {
  let hotLayer: number = 0;
  for (let i = 1; i < stats.heatPeak.length; i++) {
    if (stats.heatPeak[i] > stats.heatPeak[hotLayer]) {
      hotLayer = i;
    }
  }
  if (peak >= 90) {
    return layerName(hotLayer) + ' 热量峰值 ' + Math.floor(peak)
        + '，已逼近强制弹层阈值。下次记得绕路触发 PIPELINE FLUSH 降温。';
  }
  if (peak >= 70) {
    return layerName(hotLayer) + ' 热量峰值 ' + Math.floor(peak)
        + '，散热压力明显。建议规划路径时优先经过散热通道。';
  }
  return '热管理优秀（峰值仅 ' + Math.floor(peak) + '），路径与冷却兼顾得当。';
}
