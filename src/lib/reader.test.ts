// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeArticle } from './reader';

describe('sanitizeArticle', () => {
  it('drops scripts, event handlers and javascript: links', () => {
    const html = sanitizeArticle('<p onclick="x()">hi<script>alert(1)</script><img src="a.png" onerror="x()"><a href="javascript:x()">j</a></p>');
    expect(html).not.toMatch(/script|onclick|onerror|javascript:/);
    expect(html).toContain('hi');
  });

  it('drops forms, iframes and inline styles', () => {
    const html = sanitizeArticle('<form><input></form><iframe src="https://x.com"></iframe><p style="position:fixed">t</p>');
    expect(html).not.toMatch(/form|input|iframe|style=/);
  });

  it('opens links in a new tab without leaking the opener', () => {
    const html = sanitizeArticle('<a href="https://example.com/">x</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
