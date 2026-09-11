import { toast } from 'sonner';
import { browser } from 'wxt/browser';

export type PermissionResult = 'granted' | 'denied' | 'error';

/**
 * 申请可选权限，不抛异常。必须是点击后的第一个 await，浏览器只在用户手势内弹出授权框；
 * 已授权时直接返回 granted。浏览器拒绝调用时（多为扩展没有按最新 manifest 重新加载）
 * 在这里提示原因，调用方只需处理 denied。
 */
export async function requestPermissions(
  permissions: Parameters<typeof browser.permissions.request>[0],
): Promise<PermissionResult> {
  try {
    return (await browser.permissions.request(permissions)) ? 'granted' : 'denied';
  } catch (e) {
    console.error('permissions.request failed', e);
    const reason = e instanceof Error ? e.message : String(e);
    toast.error(`无法申请权限：${reason}。请在 chrome://extensions 里重新加载 Bookmark Hub 后再试。`);
    return 'error';
  }
}
