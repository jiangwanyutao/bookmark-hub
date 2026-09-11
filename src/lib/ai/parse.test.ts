import { describe, expect, it } from 'vitest';
import { parseNewFolders, parseSuggestions, type ParseContext } from './parse';

const ctx: ParseContext = {
  refs: new Map([
    ['b1', { bookmarkId: '101', currentFolderId: '2' }],
    ['b2', { bookmarkId: '102', currentFolderId: '10' }],
  ]),
  folders: new Map([
    ['书签栏 / 开发', '10'],
    ['书签栏 / 开发 / AI', '100'],
  ]),
};

const json = (suggestions: unknown[]) => JSON.stringify({ suggestions });

describe('parseSuggestions', () => {
  it('maps refs and folder paths back to ids', () => {
    expect(
      parseSuggestions(json([{ ref: 'b1', folder: '书签栏 / 开发 / AI', confidence: 0.96, reason: 'AI 文档' }]), ctx),
    ).toEqual([{ bookmarkId: '101', folderId: '100', folderPath: '书签栏 / 开发 / AI', confidence: 0.96, reason: 'AI 文档' }]);
  });

  it('accepts JSON wrapped in a code fence or surrounding text', () => {
    const content = `好的，结果如下：\n\`\`\`json\n${json([{ ref: 'b1', folder: '书签栏 / 开发', confidence: 0.7, reason: '' }])}\n\`\`\``;
    expect(parseSuggestions(content, ctx)).toHaveLength(1);
  });

  it('matches folder paths regardless of spacing around slashes', () => {
    expect(parseSuggestions(json([{ ref: 'b1', folder: '书签栏/开发/AI', confidence: 0.9, reason: '' }]), ctx)[0]!.folderId).toBe(
      '100',
    );
  });

  it('drops unknown refs, unknown folders, bad confidence, moves to the current folder, and duplicates', () => {
    const result = parseSuggestions(
      json([
        { ref: 'b9', folder: '书签栏 / 开发', confidence: 0.9, reason: '' },
        { ref: 'b1', folder: '书签栏 / 不存在', confidence: 0.9, reason: '' },
        { ref: 'b1', folder: '书签栏 / 开发', confidence: 1.5, reason: '' },
        { ref: 'b1', folder: '书签栏 / 开发', confidence: 'high', reason: '' },
        { ref: 'b2', folder: '书签栏 / 开发', confidence: 0.9, reason: '' },
        { ref: 'b1', folder: '书签栏 / 开发 / AI', confidence: 0.8, reason: '' },
        { ref: 'b1', folder: '书签栏 / 开发', confidence: 0.6, reason: '' },
      ]),
      ctx,
    );
    expect(result.map((s) => [s.bookmarkId, s.folderId])).toEqual([['101', '100']]);
  });

  it('fills a missing reason with an empty string', () => {
    expect(parseSuggestions(json([{ ref: 'b1', folder: '书签栏 / 开发', confidence: 0.5 }]), ctx)[0]!.reason).toBe('');
  });

  it('throws a readable error when the content is not usable JSON', () => {
    expect(() => parseSuggestions('抱歉，我无法完成', ctx)).toThrow('AI 返回的内容不是有效的 JSON');
    expect(() => parseSuggestions('{"items": []}', ctx)).toThrow('AI 返回的内容不是有效的 JSON');
  });

  it('ignores new-folder proposals, which parseNewFolders handles', () => {
    expect(
      parseSuggestions(json([{ ref: 'b1', folder: '书签栏 / 开发 / LLM', confidence: 0.9, reason: '', isNewFolder: true }]), ctx),
    ).toEqual([]);
  });
});

describe('parseNewFolders', () => {
  it('accepts a new folder under an existing parent', () => {
    expect(
      parseNewFolders(json([{ ref: 'b1', folder: '书签栏/开发/LLM', confidence: 0.9, reason: '大模型', isNewFolder: true }]), ctx),
    ).toEqual([
      {
        bookmarkId: '101',
        parentId: '10',
        parentPath: '书签栏 / 开发',
        name: 'LLM',
        path: '书签栏 / 开发 / LLM',
        confidence: 0.9,
        reason: '大模型',
      },
    ]);
  });

  it('drops proposals with a missing parent, an existing folder, no flag, a bad name, or bad data', () => {
    expect(
      parseNewFolders(
        json([
          { ref: 'b1', folder: '书签栏 / 不存在 / X', confidence: 0.9, isNewFolder: true },
          { ref: 'b1', folder: '书签栏 / 开发 / AI', confidence: 0.9, isNewFolder: true },
          { ref: 'b1', folder: '书签栏 / 开发 / LLM', confidence: 0.9 },
          { ref: 'b1', folder: `书签栏 / 开发 / ${'长'.repeat(31)}`, confidence: 0.9, isNewFolder: true },
          { ref: 'b1', folder: '书签栏 / 开发 / ', confidence: 0.9, isNewFolder: true },
          { ref: 'b9', folder: '书签栏 / 开发 / LLM', confidence: 0.9, isNewFolder: true },
          { ref: 'b1', folder: '书签栏 / 开发 / LLM', confidence: 2, isNewFolder: true },
        ]),
        ctx,
      ),
    ).toEqual([]);
  });
});
