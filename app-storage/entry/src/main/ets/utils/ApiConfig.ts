// DeepSeek API 配置
// 用法：DEEPSEEK_API_KEY 非空即启用真实 AI（关卡指令生成 + 结算评语）；留空自动降级
// 获取 key：https://platform.deepseek.com/ → API Keys
//
// ⚠️ 本项目为课程演示，按设计要求本地明文配置该 Key；如需复用请替换为自己的私钥。
//    key 仅在内存中用于 HTTPS 请求，不打印日志。

// DeepSeek API Key（课程演示用，明文配置）
export const DEEPSEEK_API_KEY: string = 'sk-15a46c3e165744c68ebc9d6c4be724d3';

// Chat Completions 接口（OpenAI 兼容）
export const DEEPSEEK_ENDPOINT: string = 'https://api.deepseek.com/chat/completions';

// 模型名：deepseek-chat（通用）
export const DEEPSEEK_MODEL: string = 'deepseek-chat';
