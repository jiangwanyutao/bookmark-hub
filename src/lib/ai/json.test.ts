import { describe, expect, it } from 'vitest';
import { extractJson, INVALID_JSON } from './json';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a ```json fenced code block', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON with leading and trailing prose', () => {
    expect(extractJson('好的，这是结果：\n{"a":1}\n希望对你有帮助。')).toEqual({ a: 1 });
  });

  it('throws INVALID_JSON for input without an object', () => {
    expect(() => extractJson('没有 JSON')).toThrow(INVALID_JSON);
  });

  it('throws INVALID_JSON for malformed JSON', () => {
    expect(() => extractJson('{"a":}')).toThrow(INVALID_JSON);
  });
});
