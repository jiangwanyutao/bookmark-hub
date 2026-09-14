import { useState } from 'react';
import { listFolders, searchBookmarks, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { useTags } from '@/hooks/useTags';
import { FolderTree } from './FolderTree';
import { BookmarkList } from './BookmarkList';
import { BookmarkDetail } from './BookmarkDetail';
import { PageHeader } from './PageHeader';

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
  const inFolder = folderId ? index.bookmarks.filter((b) => b.ancestorIds.includes(folderId)) : index.bookmarks;
  const visible = searchBookmarks(inFolder, query, tags);
  // 书签在浏览器里被删掉后，这里自然变成 undefined
  const selected = index.bookmarks.find((b) => b.id === selectedId);
  const folderName = folderId ? (folders.find((f) => f.id === folderId)?.path ?? '目录') : '全部书签';

  // 三栏面板：目录 / 列表 / 详情，各自滚动
  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4 px-6 py-5">
      <PageHeader
        title={folderName}
        subtitle={`${visible.length.toLocaleString('zh-CN')} 个书签${query ? ` · 搜索「${query}」` : ''}`}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_20rem] gap-4">
        <FolderTree roots={roots} countByFolder={index.countByFolder} selectedId={folderId} onSelect={onSelectFolder} />
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
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
    </div>
  );
}
