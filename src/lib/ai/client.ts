import type { AiConfig } from './config';
import type { ChatMessage } from './prompt';

const REQUEST_TIMEOUT_MS = 120_000;
const TEST_MAX_TOKENS = 5;

export class AiRequestError extends Error {}

interface CompletionOptions {
  signal?: AbortSignal;
  maxTokens?: number;
  /** 请求 response_format: json_object；服务商不支持（400）时自动去掉重试一次 */
  jsonMode?: boolean;
}

async function describeHttpError(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string') detail = body.error.message;
  } catch {
    // 响应体不是 JSON，只用状态码说明
  }
  if (res.status === 401 || res.status === 403) return 'API Key 无效或没有权限';
  if (res.status === 404) return '地址或模型不存在，请检查 Base URL（通常到 /v1 这一级）和模型名';
  if (res.status === 429) return '请求太频繁或额度不足，请稍后再试';
  if (res.status >= 500) return `AI 服务暂时故障（${res.status}），请稍后再试`;
  return `请求被拒绝（${res.status}）${detail ? `：${detail}` : ''}`;
}

async function post(config: AiConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (timeout.aborted) throw new AiRequestError('AI 服务超过 2 分钟没有响应，请稍后再试');
    throw new AiRequestError(`连不上 ${new URL(config.baseUrl).host}，请检查 Base URL 和网络`);
  }
}

/** 调用 OpenAI 兼容的 /chat/completions，返回第一条回复的文本。 */
export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  { signal, maxTokens, jsonMode = true }: CompletionOptions = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0,
    ...(maxTokens !== undefined && { max_tokens: maxTokens }),
  };

  let res = await post(config, jsonMode ? { ...body, response_format: { type: 'json_object' } } : body, signal);
  if (res.status === 400 && jsonMode) res = await post(config, body, signal);
  if (!res.ok) throw new AiRequestError(await describeHttpError(res));

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AiRequestError('AI 服务返回的不是 OpenAI 兼容格式');
  return content;
}

/** 发一条极短的请求，验证地址、Key、模型名都可用。 */
export async function testConnection(config: AiConfig): Promise<void> {
  await chatCompletion(config, [{ role: 'user', content: 'ping' }], { maxTokens: TEST_MAX_TOKENS, jsonMode: false });
}
