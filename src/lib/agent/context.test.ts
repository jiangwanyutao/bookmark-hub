import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { HANDLED_PLACEHOLDER, pruneHandledListings } from './context';
import type { OrganizePlan } from './plan';
import { createRefTable } from './refs';

const refs = createRefTable(['a', 'b', 'c']); // a=b1 b=b2 c=b3
const plan: OrganizePlan = { scope: { folderIds: ['2'], rootFolderId: '1' }, categories: ['教程'], assignments: { a: '教程', b: '教程' } };

const listing = (id: string, listed: string[]): AgentMessage => ({
  role: 'toolResult',
  toolCallId: id,
  toolName: 'list_bookmarks',
  content: [{ type: 'text', text: `列表 ${listed.join(',')}` }],
  details: { refs: listed },
  isError: false,
  timestamp: 1,
});

describe('pruneHandledListings', () => {
  const messages: AgentMessage[] = [
    { role: 'user', content: '开始', timestamp: 1 },
    listing('l1', ['b1', 'b2']),
    listing('l2', ['b2', 'b3']),
    { role: 'toolResult', toolCallId: 'f', toolName: 'list_folders', content: [{ type: 'text', text: '目录' }], details: {}, isError: false, timestamp: 1 },
  ];

  it('replaces listings whose bookmarks are all assigned, keeping details', () => {
    const pruned = pruneHandledListings(messages, plan, refs);
    const first = pruned[1] as Extract<AgentMessage, { role: 'toolResult' }>;
    expect(first.content).toEqual([{ type: 'text', text: HANDLED_PLACEHOLDER }]);
    expect(first.details).toEqual({ refs: ['b1', 'b2'] });
  });

  it('keeps partially handled listings and other messages unchanged', () => {
    const pruned = pruneHandledListings(messages, plan, refs);
    expect(pruned[2]).toBe(messages[2]);
    expect(pruned[3]).toBe(messages[3]);
    expect(pruned[0]).toBe(messages[0]);
  });

  it('does not mutate the input', () => {
    pruneHandledListings(messages, plan, refs);
    expect((messages[1] as { content: { text: string }[] }).content[0]!.text).toBe('列表 b1,b2');
  });
});
