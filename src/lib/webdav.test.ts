import { describe, it, expect, vi, afterEach } from 'vitest';
import { basicAuth, downloadBackup, normalizeFolderUrl, uploadBackup, type WebDavConfig } from './webdav';

const config: WebDavConfig = { folderUrl: 'https://dav.example.com/dav/backup/', username: '我', password: 'p:w' };

describe('normalizeFolderUrl', () => {
  it('keeps http(s) folders and adds the trailing slash', () => {
    expect(normalizeFolderUrl(' https://dav.jianguoyun.com/dav/书签 ')).toBe('https://dav.jianguoyun.com/dav/%E4%B9%A6%E7%AD%BE/');
    expect(normalizeFolderUrl('http://192.168.1.5:5005/webdav/')).toBe('http://192.168.1.5:5005/webdav/');
  });

  it('rejects other schemes, garbage and urls with credentials', () => {
    expect(normalizeFolderUrl('ftp://x.com/')).toBeNull();
    expect(normalizeFolderUrl('not a url')).toBeNull();
    expect(normalizeFolderUrl('https://u:p@x.com/')).toBeNull();
  });
});

describe('basicAuth', () => {
  it('encodes non-ASCII usernames as UTF-8', () => {
    expect(basicAuth('我', 'p:w')).toBe(`Basic ${btoa(String.fromCharCode(...new TextEncoder().encode('我:p:w')))}`);
  });
});

describe('upload / download', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = (status: number, body = '') => {
    const fetchMock = vi.fn(async () => new Response(status === 204 ? null : body, { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('PUTs the backup file into the folder without cookies', async () => {
    const fetchMock = stubFetch(201);
    await uploadBackup(config, '<html>');
    expect(fetchMock).toHaveBeenCalledWith('https://dav.example.com/dav/backup/bookmark-checkup.html', expect.objectContaining({
      method: 'PUT',
      body: '<html>',
      credentials: 'omit',
      headers: expect.objectContaining({ Authorization: basicAuth('我', 'p:w') }),
    }));
  });

  it('returns null when there is no backup yet', async () => {
    stubFetch(404);
    expect(await downloadBackup(config)).toBeNull();
    stubFetch(200, '<html>ok');
    expect(await downloadBackup(config)).toBe('<html>ok');
  });

  it('explains common failures in words a user can act on', async () => {
    stubFetch(401);
    await expect(uploadBackup(config, '')).rejects.toThrow(/用户名或密码/);
    stubFetch(409);
    await expect(uploadBackup(config, '')).rejects.toThrow(/文件夹不存在/);
    stubFetch(507);
    await expect(uploadBackup(config, '')).rejects.toThrow(/空间不足/);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(downloadBackup(config)).rejects.toThrow(/连不上/);
  });
});
