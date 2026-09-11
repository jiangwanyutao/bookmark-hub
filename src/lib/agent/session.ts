import { Agent, type StreamFn } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import { pruneHandledListings } from './context';
import { SYSTEM_PROMPT } from './systemPrompt';
import { createOrganizeTools, type ToolContext } from './tools';

export const MAX_MODEL_CALLS = 60;
const PAUSING_TOOLS = new Set(['ask_user', 'finish']);

export interface OrganizeSession {
  agent: Agent;
  modelCalls(): number;
  /** 用户同意继续后清零调用计数 */
  grantMoreCalls(): void;
}

export function createOrganizeSession(options: {
  model: Model<any>;
  streamFn: StreamFn;
  toolContext: ToolContext;
  maxModelCalls?: number;
  onLimit?: () => void;
}): OrganizeSession {
  const { model, streamFn, toolContext, maxModelCalls = MAX_MODEL_CALLS, onLimit } = options;
  let calls = 0;

  const agent = new Agent({
    initialState: { systemPrompt: SYSTEM_PROMPT, model, tools: createOrganizeTools(toolContext) },
    streamFn,
    // 工具会读写同一份方案，逐个执行避免交错
    toolExecution: 'sequential',
    transformContext: async (messages) => pruneHandledListings(messages, toolContext.getPlan(), toolContext.refs),
    // ask_user / finish 之后停下等用户；同轮混调其他工具时仅靠 terminate 不会停，这里兜底
    shouldStopAfterTurn: ({ toolResults }) => {
      if (toolResults.some((r) => PAUSING_TOOLS.has(r.toolName))) return true;
      if (calls >= maxModelCalls) {
        onLimit?.();
        return true;
      }
      return false;
    },
  });

  agent.subscribe((event) => {
    if (event.type === 'turn_start') calls += 1;
  });

  return {
    agent,
    modelCalls: () => calls,
    grantMoreCalls: () => {
      calls = 0;
    },
  };
}
