import { toast } from 'sonner';
import { applyBatch, undoBatch, type Intent } from './history';
import { getHubCtx } from './hubContext';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 执行并记录一批操作，成功后弹出带「撤销」的提示。返回是否成功。 */
export async function runBatch(label: string, intents: Intent[], successMessage: string): Promise<boolean> {
  try {
    const batch = await applyBatch(await getHubCtx(), label, intents);
    toast.success(successMessage, {
      action: { label: '撤销', onClick: () => void undoWithToast(batch.id) },
    });
    return true;
  } catch (e) {
    toast.error(`操作失败：${errorMessage(e)}。已完成的部分可以在「操作记录」里撤销。`);
    return false;
  }
}

export async function undoWithToast(batchId: string): Promise<boolean> {
  try {
    const { undone, skipped } = await undoBatch(await getHubCtx(), batchId);
    if (skipped === 0) toast.success(`已撤销 ${undone} 项操作`);
    else toast.warning(`已撤销 ${undone} 项，${skipped} 项因你之后手动修改过而跳过`);
    return true;
  } catch (e) {
    toast.error(`撤销失败：${errorMessage(e)}`);
    return false;
  }
}
