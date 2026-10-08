// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { addHighlight, applyHighlights, deleteHighlight, listHighlights, updateNote } from './highlights';
import { openHubDB } from './db';

describe('applyHighlights', () => {
  const marks = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('mark')];

  it('wraps the first occurrence of a highlight inside one text node', () => {
    const { html, found } = applyHighlights('<p>alpha beta gamma beta</p>', [{ id: 'h1', text: 'beta' }]);
    expect(html).toBe('<p>alpha <mark data-highlight-id="h1">beta</mark> gamma beta</p>');
    expect(found).toEqual(new Set(['h1']));
  });

  it('wraps a highlight that spans several elements piece by piece', () => {
    const { html } = applyHighlights('<p>one <b>two</b> three</p>', [{ id: 'h1', text: 'ne two th' }]);
    expect(marks(html).map((m) => m.textContent)).toEqual(['ne ', 'two', ' th']);
    expect(html).toContain('<b><mark data-highlight-id="h1">two</mark></b>');
  });

  it('matches across whitespace differences from the selection', () => {
    const { found } = applyHighlights('<p>line one</p>\n<p>line two</p>', [{ id: 'h1', text: 'one\n\nline' }]);
    expect(found.has('h1')).toBe(true);
  });

  it('reports highlights whose text is no longer in the page', () => {
    const { html, found } = applyHighlights('<p>new text</p>', [{ id: 'gone', text: 'old text' }]);
    expect(found.size).toBe(0);
    expect(html).toBe('<p>new text</p>');
  });
});

describe('highlight store', () => {
  it('adds, lists by url in creation order, edits notes and deletes', async () => {
    const db = await openHubDB();
    const a = await addHighlight(db, { url: 'https://a.com/', text: 'first' }, 1);
    await addHighlight(db, { url: 'https://a.com/', text: 'second' }, 2);
    await addHighlight(db, { url: 'https://b.com/', text: 'other' }, 3);
    await updateNote(db, a.id, '  my note  ');

    const list = await listHighlights(db, 'https://a.com/');
    expect(list.map((h) => h.text)).toEqual(['first', 'second']);
    expect(list[0]?.note).toBe('my note');

    await deleteHighlight(db, a.id);
    expect((await listHighlights(db, 'https://a.com/')).map((h) => h.text)).toEqual(['second']);
  });
});
