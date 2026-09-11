import { useState } from 'react';
import { searchBookmarks, type BookmarkIndex, type TreeNode } from '../lib/bookmarks';
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

  const inFolder = folderId
    ? index.bookmarks.filter((b) => b.ancestorIds.includes(folderId))
    : index.bookmarks;
  const visible = searchBookmarks(inFolder, query);
  // 书签在浏览器里被删掉后，这里自然变成 undefined
  const selected = index.bookmarks.find((b) => b.id === selectedId);

  return (
    <div className="bookmarks-view">
      <FolderTree
        roots={roots}
        countByFolder={index.countByFolder}
        selectedId={folderId}
        onSelect={onSelectFolder}
      />
      <section className="list-pane">
        <p className="list-count">{visible.length.toLocaleString('zh-CN')} 个书签</p>
        <BookmarkList bookmarks={visible} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
      <BookmarkDetail bookmark={selected} />
    </div>
  );
}
