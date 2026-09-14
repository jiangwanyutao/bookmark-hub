import { useState } from 'react';
import { listFolders, searchBookmarks, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { useTags } from '@/hooks/useTags';
import { FolderTree } from './FolderTree';
import { BookmarkList } from './BookmarkList';
import { BookmarkDetail } from './BookmarkDetail';

interface Props {
  roots: TreeNode[];
  index: BookmarkIndex;
  query: string;
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
}

export function BookmarksView({ roots, index, query, folderId, onSelectFolder }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { tags, save: saveTags } = useTags();

  const folders = listFolders(roots);
  const inFolder = folderId
    ? index.bookmarks.filter((b) => b.ancestorIds.includes(folderId))
    : index.bookmarks;
  const visible = searchBookmarks(inFolder, query, tags);
  // 书签在浏览器里被删掉后，这里自然变成 undefined
  const selected = index.bookmarks.find((b) => b.id === selectedId);
  const folderName = folderId ? (folders.find((f) => f.id === folderId)?.path ?? '目录') : '全部书签';

  return (
    <div className="grid h-full grid-cols-[240px_minmax(0,1fr)_340px]">
      <FolderTree
        roots={roots}
        countByFolder={index.countByFolder}
        selectedId={folderId}
        onSelect={onSelectFolder}
      />
      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-5">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{folderName}</h1>
            {query && <p className="truncate text-xs text-muted-foreground">搜索「{query}」</p>}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{visible.length.toLocaleString('zh-CN')}</span> 个书签
          </span>
        </header>
        <BookmarkList bookmarks={visible} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
      <BookmarkDetail
        bookmark={selected}
        folders={folders}
        tags={selected ? (tags.get(selected.url) ?? []) : []}
        onSaveTags={async (next) => {
          if (selected) await saveTags([[selected.url, next]]);
        }}
      />
    </div>
  );
}
