import { describe, expect, it } from 'vitest';
import { aggregateByHost, classify, type NetworkMode, type Observation, type ScanResult } from './classify';

const obs = (over: Partial<Observation> = {}): Observation => ({
  requestedUrl: 'https://a.com/post/1',
  redirectStatuses: [],
  ...over,
});
const at = (finalUrl: string, redirectStatuses: number[], status = 200) => obs({ status, finalUrl, redirectStatuses });

describe('classify', () => {
  it.each<[string, Observation, NetworkMode, ReturnType<typeof classify>]>([
    ['2xx', obs({ status: 200, finalUrl: 'https://a.com/post/1' }), 'normal', { health: 'healthy', failReason: null, redirectTo: null }],
    ['temporary redirect', at('https://a.com/post/1-new', [302]), 'normal', { health: 'healthy', failReason: null, redirectTo: null }],
    ['301', at('https://b.com/post/1', [301]), 'normal', { health: 'redirected', failReason: null, redirectTo: 'https://b.com/post/1' }],
    ['301 then 308', at('https://b.com/p/1', [301, 308]), 'normal', { health: 'redirected', failReason: null, redirectTo: 'https://b.com/p/1' }],
    ['301 then 302', at('https://b.com/p/1', [301, 302]), 'normal', { health: 'healthy', failReason: null, redirectTo: null }],
    ['permanent redirect to home', at('https://a.com/', [301]), 'normal', { health: 'suspicious', failReason: 'moved_to_home', redirectTo: null }],
    ['redirect to login path', at('https://a.com/login?next=/post/1', [302]), 'normal', { health: 'unknown', failReason: 'need_login', redirectTo: null }],
    ['redirect to login host', at('https://passport.a.com/', [301]), 'normal', { health: 'unknown', failReason: 'need_login', redirectTo: null }],
    ['404', obs({ status: 404 }), 'normal', { health: 'broken', failReason: 'not_found', redirectTo: null }],
    ['410', obs({ status: 410 }), 'normal', { health: 'broken', failReason: 'not_found', redirectTo: null }],
    ['404 on restricted network', obs({ status: 404 }), 'restricted', { health: 'broken', failReason: 'not_found', redirectTo: null }],
    ['401', obs({ status: 401 }), 'normal', { health: 'unknown', failReason: 'need_login', redirectTo: null }],
    ['403', obs({ status: 403 }), 'normal', { health: 'unknown', failReason: 'need_login', redirectTo: null }],
    ['429', obs({ status: 429 }), 'normal', { health: 'unknown', failReason: 'rate_limited', redirectTo: null }],
    ['503', obs({ status: 503 }), 'normal', { health: 'unknown', failReason: 'server_error', redirectTo: null }],
    ['400', obs({ status: 400 }), 'normal', { health: 'unknown', failReason: 'http_error', redirectTo: null }],
    ['dns', obs({ netError: 'net::ERR_NAME_NOT_RESOLVED' }), 'normal', { health: 'broken', failReason: 'dns', redirectTo: null }],
    ['dns on restricted network', obs({ netError: 'net::ERR_NAME_NOT_RESOLVED' }), 'restricted', { health: 'unknown', failReason: 'maybe_vpn', redirectTo: null }],
    ['cert', obs({ netError: 'net::ERR_CERT_COMMON_NAME_INVALID' }), 'normal', { health: 'suspicious', failReason: 'cert', redirectTo: null }],
    ['cert on restricted network', obs({ netError: 'net::ERR_CERT_COMMON_NAME_INVALID' }), 'restricted', { health: 'unknown', failReason: 'maybe_vpn', redirectTo: null }],
    ['timeout', obs({ timedOut: true }), 'normal', { health: 'unknown', failReason: 'timeout', redirectTo: null }],
    ['timeout on restricted network', obs({ timedOut: true }), 'restricted', { health: 'unknown', failReason: 'maybe_vpn', redirectTo: null }],
    ['connection reset', obs({ netError: 'net::ERR_CONNECTION_RESET' }), 'normal', { health: 'unknown', failReason: 'connection', redirectTo: null }],
    ['connection reset on restricted network', obs({ netError: 'net::ERR_CONNECTION_RESET' }), 'restricted', { health: 'unknown', failReason: 'maybe_vpn', redirectTo: null }],
    ['too many redirects', obs({ netError: 'net::ERR_TOO_MANY_REDIRECTS' }), 'restricted', { health: 'suspicious', failReason: 'too_many_redirects', redirectTo: null }],
  ])('%s', (_name, observation, mode, expected) => {
    expect(classify(observation, mode)).toEqual(expected);
  });
});

describe('classify on a host the user marked as needing VPN', () => {
  it('treats network failures as maybe_vpn even on a normal network', () => {
    expect(classify(obs({ netError: 'net::ERR_NAME_NOT_RESOLVED' }), 'normal', { vpnHost: true })).toEqual({
      health: 'unknown',
      failReason: 'maybe_vpn',
      redirectTo: null,
    });
  });

  it('still trusts real http responses', () => {
    expect(classify(obs({ status: 404 }), 'normal', { vpnHost: true }).health).toBe('broken');
  });
});

const result = (url: string, health: ScanResult['health'], failReason: ScanResult['failReason']): ScanResult => ({
  url,
  health,
  failReason,
  httpStatus: null,
  netError: null,
  redirectTo: null,
  networkMode: 'normal',
  checkedAt: 1,
});

describe('aggregateByHost', () => {
  it('moves every url of a host that failed only at the network level into pending', () => {
    const changed = aggregateByHost([
      result('https://dead.com/1', 'broken', 'dns'),
      result('https://dead.com/2', 'broken', 'dns'),
      result('https://dead.com/3', 'broken', 'dns'),
    ]);
    expect(changed.map((r) => [r.health, r.failReason])).toEqual([
      ['unknown', 'site_unreachable'],
      ['unknown', 'site_unreachable'],
      ['unknown', 'site_unreachable'],
    ]);
  });

  it('only returns results that actually change', () => {
    const changed = aggregateByHost([
      result('https://x.com/1', 'broken', 'dns'),
      result('https://x.com/2', 'suspicious', 'cert'),
      result('https://x.com/3', 'unknown', 'timeout'),
    ]);
    expect(changed.map((r) => r.url)).toEqual(['https://x.com/1', 'https://x.com/2']);
  });

  it('leaves hosts alone when any url responded, or when there are fewer than 3 urls', () => {
    expect(
      aggregateByHost([
        result('https://y.com/1', 'broken', 'dns'),
        result('https://y.com/2', 'broken', 'dns'),
        result('https://y.com/3', 'healthy', null),
        result('https://z.com/1', 'broken', 'dns'),
        result('https://z.com/2', 'broken', 'dns'),
      ]),
    ).toEqual([]);
  });
});
