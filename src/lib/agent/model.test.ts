import { describe, expect, it } from 'vitest';
import { AGENT_PROVIDER_ID, createAgentModel, toAgentModel } from './model';

const config = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', model: 'deepseek-chat', privacy: 'title_domain' as const };

describe('toAgentModel', () => {
  it('maps the saved AI config to an OpenAI-compatible pi model', () => {
    expect(toAgentModel(config)).toMatchObject({
      id: 'deepseek-chat',
      api: 'openai-completions',
      provider: AGENT_PROVIDER_ID,
      baseUrl: 'https://api.deepseek.com/v1',
      input: ['text'],
      reasoning: false,
    });
  });
});

describe('createAgentModel', () => {
  it('returns the model and a stream function for the agent', () => {
    const { model, streamFn } = createAgentModel(config);
    expect(model.id).toBe('deepseek-chat');
    expect(typeof streamFn).toBe('function');
  });
});
