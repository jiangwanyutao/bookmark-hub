import { describe, expect, it } from 'vitest';
import { isIntranetHost, skipReason, stripSensitiveParams } from './rules';

describe('stripSensitiveParams', () => {
  it('removes sensitive parameters case-insensitively and keeps the rest', () => {
    expect(stripSensitiveParams('https://x.com/p?Token=1&id=2&code=3')).toBe('https://x.com/p?id=2');
  });

  it('leaves urls without sensitive parameters and non-urls unchanged', () => {
    expect(stripSensitiveParams('https://x.com/p?id=2')).toBe('https://x.com/p?id=2');
    expect(stripSensitiveParams('not a url')).toBe('not a url');
  });
});

describe('isIntranetHost', () => {
  it.each([
    ['localhost', true],
    ['api.localhost', true],
    ['127.0.0.1', true],
    ['[::1]', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.1.1', true],
    ['[fd12::1]', true],
    ['[fe80::1]', true],
    ['nas.local', true],
    ['svc.internal', true],
    ['router.lan', true],
    ['wiki.corp', true],
    ['printer.home.arpa', true],
    ['jira', true],
    ['example.com', false],
    ['8.8.8.8', false],
    ['[2001:db8::1]', false],
  ])('%s → %s', (host, expected) => {
    expect(isIntranetHost(host)).toBe(expected);
  });
});

describe('skipReason', () => {
  it.each([
    ['chrome://settings', 'non_web'],
    ['javascript:void(0)', 'non_web'],
    ['file:///C:/notes.txt', 'non_web'],
    ['http://localhost:3000/', 'intranet'],
    ['http://jira/browse/X-1', 'intranet'],
    ['https://x.com/magic?token=abc', 'sensitive'],
    ['https://x.com/callback?Code=1', 'sensitive'],
    ['https://x.com/p?access_token=1', 'sensitive'],
    ['https://example.com/article?id=1', null],
    ['https://keyboard.com/?keyword=x', null],
  ])('%s → %s', (url, expected) => {
    expect(skipReason(url)).toBe(expected);
  });
});
