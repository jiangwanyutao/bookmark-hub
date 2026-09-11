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

  const inFolder = folderId
    ? index.bookmarks.filter((b) => b.ancestorIds.includes(folderId))
    : index.bookmarks;
  const visible = searchBookmarks(inFolder, query, tags);
  // 书签在浏览器里被删掉后，这里自然变成 undefined
  const selected = index.bookmarks.find((b) => b.id === selectedId);

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px]">
      <FolderTree
        roots={roots}
        countByFolder={index.countByFolder}
        selectedId={folderId}
        onSelect={onSelectFolder}
      />
      <section className="flex min-h-0 min-w-0 flex-col">
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          {visible.length.toLocaleString('zh-CN')} 个书签
        </p>
        <BookmarkList bookmarks={visible} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
      <BookmarkDetail
        bookmark={selected}
        folders={listFolders(roots)}
        tags={selected ? (tags.get(selected.url) ?? []) : []}
        onSaveTags={async (next) => {
          if (selected) await saveTags([[selected.url, next]]);
        }}
      />
    </div>
  );
}
