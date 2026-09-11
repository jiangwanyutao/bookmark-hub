import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { OrganizePlan } from './plan';
import type { RefTable } from './refs';

export const HANDLED_PLACEHOLDER = '（已处理，省略）';

const listedRefs = (message: AgentMessage): string[] | null => {
  if (message.role !== 'toolResult' || message.toolName !== 'list_bookmarks') return null;
  const refs = (message.details as { refs?: unknown } | undefined)?.refs;
  return Array.isArray(refs) ? refs.filter((r): r is string => typeof r === 'string') : null;
};

/** 书签已全部分配过的旧列表换成占位文字，避免上下文随书签数一直增长。 */
export function pruneHandledListings(messages: AgentMessage[], plan: OrganizePlan, refs: RefTable): AgentMessage[] {
  const handled = (ref: string) => {
    const id = refs.toId(ref);
    return id !== undefined && id in plan.assignments;
  };
  return messages.map((message) => {
    const listed = listedRefs(message);
    if (!listed || listed.length === 0 || !listed.every(handled) || message.role !== 'toolResult') return message;
    return { ...message, content: [{ type: 'text', text: HANDLED_PLACEHOLDER }] };
  });
}
