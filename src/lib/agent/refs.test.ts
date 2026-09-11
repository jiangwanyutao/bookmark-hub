import { describe, expect, it } from 'vitest';
import { createRefTable } from './refs';

describe('createRefTable', () => {
  const refs = createRefTable(['101', '205', '9']);

  it('numbers bookmarks b1…bN in the given order', () => {
    expect(['101', '205', '9'].map((id) => refs.toRef(id))).toEqual(['b1', 'b2', 'b3']);
  });

  it('maps refs back to real ids, tolerating surrounding spaces', () => {
    expect(refs.toId('b2')).toBe('205');
    expect(refs.toId(' b3 ')).toBe('9');
  });

  it('returns undefined for unknown ids and refs', () => {
    expect(refs.toRef('404')).toBeUndefined();
    expect(refs.toId('b99')).toBeUndefined();
  });
});
