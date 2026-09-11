import { describe, expect, it } from 'vitest';
import { buildMessages, toAiItem } from './prompt';

const bookmark = { title: 'OpenAI API Docs', url: 'https://platform.openai.com/docs?token=abc&tab=1', domain: 'platform.openai.com' };

describe('toAiItem', () => {
  it('sends only the title at the strictest privacy level', () => {
    expect(toAiItem('b1', bookmark, 'title')).toEqual({ ref: 'b1', title: 'OpenAI API Docs' });
  });

  it('adds the domain at the default level', () => {
    expect(toAiItem('b1', bookmark, 'title_domain')).toEqual({
      ref: 'b1',
      title: 'OpenAI API Docs',
      domain: 'platform.openai.com',
    });
  });

  it('adds the url with sensitive parameters removed', () => {
    expect(toAiItem('b1', bookmark, 'title_url')).toEqual({
      ref: 'b1',
      title: 'OpenAI API Docs',
      url: 'https://platform.openai.com/docs?tab=1',
    });
  });

  it('never sends intranet bookmarks', () => {
    expect(toAiItem('b1', { title: 'Jira', url: 'http://jira/browse/X-1', domain: 'jira' }, 'title')).toBeNull();
  });
});

describe('buildMessages', () => {
  it('gives the model the existing folders and the bookmarks as JSON', () => {
    const [system, user] = buildMessages(
      [{ ref: 'b1', title: 'OpenAI API Docs', domain: 'platform.openai.com' }],
      ['书签栏 / 开发', '书签栏 / 开发 / AI'],
    );
    expect(system!.role).toBe('system');
    expect(user!.role).toBe('user');
    expect(user!.content).toContain('书签栏 / 开发 / AI');
    expect(user!.content).toContain('{"ref":"b1","title":"OpenAI API Docs","domain":"platform.openai.com"}');
  });
});
