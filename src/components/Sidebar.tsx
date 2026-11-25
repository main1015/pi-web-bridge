import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  AtSign,
} from 'lucide-react';
import type { SessionSummary, WorkspaceFileNode, WorkspaceTemplate } from '../types/pi';

interface SidebarProps {
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  fileTree: WorkspaceFileNode[];
  activeFilePath: string | null;
  onOpenFile: (path: string) => void;
  onAttachFile: (path: string) => void;
  onCreateFile: (path: string, type: 'file' | 'directory') => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onRefreshTree: () => void;
  onResetWorkspace: (template: WorkspaceTemplate) => Promise<void>;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  return `${Math.floor(diffHr / 24)} 天前`;
}

function FileTreeItem({
  node,
  depth,
  activeFilePath,
  onOpenFile,
  onAttachFile,
  onDeleteFile,
}: {
  node: WorkspaceFileNode;
  depth: number;
  activeFilePath: string | null;
  onOpenFile: (path: string) => void;
  onAttachFile: (path: string) => void;
  onDeleteFile: (path: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="w-full flex items-center gap-1.5 pr-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 rounded-md transition-colors text-left"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          {open ? (
            <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onOpenFile={onOpenFile}
                onAttachFile={onAttachFile}
                onDeleteFile={onDeleteFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;

  return (
    <div
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      className={`group flex items-center justify-between gap-1 pr-1.5 py-1.5 text-xs rounded-md transition-colors ${
        isActive
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 font-medium'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenFile(node.path)}
        className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
      >
        <FileCode2
          className={`w-3.5 h-3.5 shrink-0 ${
            isActive ? 'text-white dark:text-slate-950' : 'text-slate-400'
          }`}
        />
        <span className="truncate font-mono text-[12px]">{node.name}</span>
      </button>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          title="引用到当前对话 (@)"
          onClick={(e) => {
            e.stopPropagation();
            onAttachFile(node.path);
          }}
          className={`p-1 rounded transition-colors ${
            isActive
              ? 'hover:bg-slate-700 dark:hover:bg-slate-300'
              : 'hover:bg-slate-300/70 dark:hover:bg-slate-700'
          }`}
        >
          <AtSign className="w-3 h-3" />
        </button>
        <button
          type="button"
          title="删除文件"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFile(node.path);
          }}
          className={`p-1 rounded transition-colors ${
            isActive
              ? 'hover:bg-red-600 text-white'
              : 'hover:bg-red-100 dark:hover:bg-red-950 text-slate-400 hover:text-red-600'
          }`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  fileTree,
  activeFilePath,
  onOpenFile,
  onAttachFile,
  onCreateFile,
  onDeleteFile,
  onRefreshTree,
  onResetWorkspace,
}: SidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | null>(null);
  const [newPath, setNewPath] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPath.trim();
    if (!trimmed) return;
    await onCreateFile(trimmed, 'file');
    setNewPath('');
    setCreatingType(null);
  };

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 flex flex-col h-full overflow-hidden">
      {/* Sessions Section */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            会话记录
          </span>
          <button
            type="button"
            onClick={onNewSession}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新会话</span>
          </button>
        </div>

        <div className="space-y-0.5 max-h-44 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
              当前为新会话
            </div>
          ) : (
            sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className="flex items-start gap-2 min-w-0 flex-1 text-left"
                  >
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title || '未命名会话'}</div>
                      <div className="text-[11px] opacity-70 tabular-nums">
                        {s.messageCount} 条消息 · {formatRelativeTime(s.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    title="删除会话"
                    onClick={() => onDeleteSession(s.id)}
                    className="hidden group-hover:block p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workspace Files Section */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            工作区文件
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="新建文件"
              onClick={() => setCreatingType((v) => (v ? null : 'file'))}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="刷新文件树"
              onClick={onRefreshTree}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="切换示例模板"
              onClick={() => setShowTemplates((v) => !v)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showTemplates && (
          <div className="mb-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              重置工作区模板：
            </div>
            <button
              type="button"
              onClick={async () => {
                await onResetWorkspace('node-ts');
                setShowTemplates(false);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Node.js 基础项目
            </button>
            <button
              type="button"
              onClick={async () => {
                await onResetWorkspace('python');
                setShowTemplates(false);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Python 算法实验
            </button>
            <button
              type="button"
              onClick={async () => {
                await onResetWorkspace('empty');
                setShowTemplates(false);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              空白工作区
            </button>
          </div>
        )}

        {creatingType && (
          <form onSubmit={handleCreateSubmit} className="mb-2">
            <input
              type="text"
              autoFocus
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="例如: src/utils.mjs"
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
          {fileTree.length === 0 ? (
            <div className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
              工作区暂无文件
            </div>
          ) : (
            fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                activeFilePath={activeFilePath}
                onOpenFile={onOpenFile}
                onAttachFile={onAttachFile}
                onDeleteFile={onDeleteFile}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
