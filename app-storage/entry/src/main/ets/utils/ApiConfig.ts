// DeepSeek API 配置
// 用法：把 DEEPSEEK_API_KEY 填成你的私钥即可启用真实 AI 评语；留空则自动降级为占位实现
// 获取 key：https://platform.deepseek.com/ → API Keys
//
// ⚠️ 安全：演示 / 提交仓库时请保持 KEY 为空串，切勿把私钥提交进 Git。
//    key 不入库、不打印日志；仅在结算页内存中用于一次 HTTPS 请求。

// 你的 DeepSeek API Key（本地填入，提交保持空）
export const DEEPSEEK_API_KEY: string = '';

// Chat Completions 接口（OpenAI 兼容）
export const DEEPSEEK_ENDPOINT: string = 'https://api.deepseek.com/chat/completions';

// 模型名：deepseek-chat（通用）
export const DEEPSEEK_MODEL: string = 'deepseek-chat';
