// DeepSeek 指令序列生成服务
// 每局开始向 DeepSeek 请求一段合法汇编序列（new-design 2.1）；无 key / 失败 → 离线向量内积预置
// 评语接口仍在 AIComment.ts；本文件只负责「关卡指令」生成

import { http } from '@kit.NetworkKit';
import { DEEPSEEK_API_KEY, DEEPSEEK_ENDPOINT, DEEPSEEK_MODEL } from './ApiConfig';
import {
  Difficulty, DifficultyConfig, difficultyConfig,
  Instruction, InstructionProgram
} from '../game/data/Instruction';
import { InstructionGraph } from './InstructionGraph';

// DeepSeek Chat Completions 请求体（OpenAI 兼容，与 AIComment 平行）
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

interface ChatRespMessage {
  content: string;
}

interface ChatRespChoice {
  message: ChatRespMessage;
}

interface ChatRespBody {
  choices: ChatRespChoice[];
}

// 按 new-design 2.1 模板构造 prompt
export function buildProgramPrompt(cfg: DifficultyConfig): string {
  return [
    '你是一个 x86 汇编教学助手。请生成一段 ' + cfg.instrCount + ' 条指令的合法汇编序列，要求：',
    '1. 只使用以下指令集：LOAD、STORE、MOV、ADD、SUB、MUL、AND、OR、XOR、SHL、SHR',
    '2. 只使用寄存器：eax、ebx、ecx、edx、esi、edi（最多使用其中 4 个）',
    '3. 序列必须描述一个有意义的运算（参考场景：' + cfg.scene + '），并以 STORE 写回一个结果寄存器结尾',
    '4. 每条指令附带一行中文注释说明其作用',
    '5. 不要出现：浮点指令、跳转指令（JMP/JE 等）、栈操作（PUSH/POP）、系统调用',
    '6. 返回格式为纯 JSON 数组（不要任何额外解释 / markdown 围栏），每项包含 index（序号，从1）、',
    '   mnemonic（指令助记符）、operands（操作数字符串）、comment（中文注释）、depth（DAG 深度，从0）',
    '7. 操作数依赖图中，同一 depth 的指令数不超过 ' + cfg.maxWidth + ' 条',
    '8. 另起一行在 JSON 后面用 // SCENE: 标注本序列描述的运算场景中文名（如「1×2 向量内积」）'
  ].join('\n');
}

// 生成本局程序：有 key → 调 DeepSeek 解析；任何异常 → 离线预置
export async function generateProgram(difficulty: Difficulty): Promise<InstructionProgram> {
  const cfg: DifficultyConfig = difficultyConfig(difficulty);

  // 未配置 key：直接离线
  if (DEEPSEEK_API_KEY === undefined || DEEPSEEK_API_KEY === null || DEEPSEEK_API_KEY.length === 0) {
    return Promise.resolve(offlineProgram(difficulty));
  }
  try {
    const prompt: string = buildProgramPrompt(cfg);
    const text: string = await callDeepSeek(prompt);
    const instrs: Instruction[] = InstructionGraph.parseInstructions(text);
    if (instrs.length === 0) {
      return offlineProgram(difficulty);
    }
    return {
      difficulty: difficulty,
      instrType: extractScene(text, cfg.scene),
      instructions: instrs,
      fromFallback: false
    };
  } catch (_e) {
    return offlineProgram(difficulty);
  }
}

// 从返回文本提取 "// SCENE: xxx" 标注；缺失则用难度默认场景
function extractScene(raw: string, fallback: string): string {
  const idx: number = raw.indexOf('SCENE:');
  if (idx < 0) {
    return fallback;
  }
  let tail: string = raw.substring(idx + 'SCENE:'.length).trim();
  // 截到行尾
  const nl: number = tail.indexOf('\n');
  if (nl >= 0) {
    tail = tail.substring(0, nl).trim();
  }
  return tail.length > 0 ? tail : fallback;
}

// 真实调用 DeepSeek（@kit.NetworkKit http）；调用方负责 try/catch 降级
async function callDeepSeek(prompt: string): Promise<string> {
  const httpRequest = http.createHttp();
  try {
    const body: ChatRequestBody = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你是严谨的 x86 汇编教学助手，只输出题目要求的 JSON。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 1200,
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
      readTimeout: 30000
    });
    if (resp.responseCode !== 200) {
      throw new Error('DeepSeek HTTP ' + resp.responseCode);
    }
    const raw: object = JSON.parse(resp.result as string) as object;
    const parsed: ChatRespBody = raw as ChatRespBody;
    if (parsed.choices === undefined || parsed.choices === null || parsed.choices.length === 0) {
      throw new Error('DeepSeek empty choices');
    }
    return parsed.choices[0].message.content.trim();
  } finally {
    httpRequest.destroy();
  }
}

// ===== 离线预置：1×2 向量内积（new-design 5.2 示例）=====
// API 不可用时返回，保证演示可玩；fromFallback=true 供 UI 标注
export function offlineProgram(difficulty: Difficulty): InstructionProgram {
  const instructions: Instruction[] = [
    { index: 1, mnemonic: 'LOAD',  operands: 'eax, [addr_A0]',     comment: '取向量 A[0]',        depth: 0 },
    { index: 2, mnemonic: 'LOAD',  operands: 'ebx, [addr_B0]',     comment: '取向量 B[0]',        depth: 0 },
    { index: 3, mnemonic: 'MUL',   operands: 'ecx, eax, ebx',      comment: 'ecx = A[0] * B[0]',  depth: 1 },
    { index: 4, mnemonic: 'LOAD',  operands: 'eax, [addr_A1]',     comment: '取向量 A[1]',        depth: 0 },
    { index: 5, mnemonic: 'LOAD',  operands: 'ebx, [addr_B1]',     comment: '取向量 B[1]',        depth: 0 },
    { index: 6, mnemonic: 'MUL',   operands: 'edx, eax, ebx',      comment: 'edx = A[1] * B[1]',  depth: 1 },
    { index: 7, mnemonic: 'ADD',   operands: 'eax, ecx, edx',      comment: 'eax = 内积结果',     depth: 2 },
    { index: 8, mnemonic: 'STORE', operands: '[result], eax',      comment: '写回内积结果',       depth: 3 }
  ];
  return {
    difficulty: difficulty,
    instrType: '1×2 向量内积',
    instructions: instructions,
    fromFallback: true
  };
}
