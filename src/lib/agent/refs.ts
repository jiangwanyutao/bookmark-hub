/** 会话内书签编号：模型只见 b1、b2…，看不到也编不出真实 id。 */
export interface RefTable {
  toRef(bookmarkId: string): string | undefined;
  toId(ref: string): string | undefined;
}

export function createRefTable(bookmarkIds: string[]): RefTable {
  const refById = new Map(bookmarkIds.map((id, i) => [id, `b${i + 1}`]));
  const idByRef = new Map([...refById].map(([id, ref]) => [ref, id]));
  return {
    toRef: (bookmarkId) => refById.get(bookmarkId),
    toId: (ref) => idByRef.get(ref.trim()),
  };
}
