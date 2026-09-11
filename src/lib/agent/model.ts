import type { StreamFn } from '@earendil-works/pi-agent-core';
import { createModels, createProvider, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { AiConfig } from '../ai/config';

export const AGENT_PROVIDER_ID = 'user-openai-compatible';
const CONTEXT_WINDOW = 64_000;
const MAX_OUTPUT_TOKENS = 8_000;

/** 用户在设置页配置的 OpenAI 兼容服务 → pi 的模型描述。 */
export function toAgentModel(config: AiConfig): Model<'openai-completions'> {
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: AGENT_PROVIDER_ID,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
}

/** Key 显式传入（浏览器没有环境变量），只发给用户填写的 Base URL。 */
export function createAgentModel(config: AiConfig): { model: Model<'openai-completions'>; streamFn: StreamFn } {
  const model = toAgentModel(config);
  const provider = createProvider({
    id: AGENT_PROVIDER_ID,
    name: '用户配置的 OpenAI 兼容服务',
    baseUrl: config.baseUrl,
    auth: { apiKey: { name: 'API Key', resolve: async () => ({ auth: { apiKey: config.apiKey } }) } },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  return { model, streamFn: models.streamSimple.bind(models) };
}
