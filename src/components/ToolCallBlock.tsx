import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileEdit,
  FilePlus2,
  FolderOpen,
  Loader2,
  Search,
  Terminal,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { ToolCallEvent } from '../types/pi';

interface ToolCallBlockProps {
  toolCall: ToolCallEvent;
  onOpenFile?: (path: string) => void;
}

function getToolMeta(name: ToolCallEvent['name']) {
  switch (name) {
    case 'read':
      return { Icon: FileCode2, label: 'read' };
    case 'write':
      return { Icon: FilePlus2, label: 'write' };
    case 'edit':
      return { Icon: FileEdit, label: 'edit' };
    case 'bash':
      return { Icon: Terminal, label: 'bash' };
    case 'grep':
      return { Icon: Search, label: 'grep' };
    case 'find':
      return { Icon: Search, label: 'find' };
    case 'ls':
      return { Icon: FolderOpen, label: 'ls' };
    default:
      return { Icon: Terminal, label: String(name) };
  }
}

function getTargetSummary(toolCall: ToolCallEvent): string {
  const args = toolCall.args || {};
  if (toolCall.name === 'bash') return String(args.command ?? '');
  if (toolCall.name === 'grep') {
    const target = args.path ? ` (${String(args.path)})` : '';
    return `"${String(args.pattern ?? '')}"${target}`;
  }
  if (toolCall.name === 'find') {
    return String(args.pattern || args.path || '.');
  }
  return String(args.path ?? '.');
}

export function ToolCallBlock({ toolCall, onOpenFile }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(
    toolCall.name === 'edit' || toolCall.name === 'bash' || toolCall.status === 'error'
  );

  const { Icon, label } = getToolMeta(toolCall.name);
  const summary = getTargetSummary(toolCall);
  const filePath =
    (toolCall.name === 'read' || toolCall.name === 'write' || toolCall.name === 'edit') &&
    typeof toolCall.args?.path === 'string'
      ? toolCall.args.path
      : null;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900/70 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:text-slate-950 dark:hover:text-white transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 shrink-0">
            {label}
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400 truncate">
            {summary}
          </span>
        </button>

        <div className="flex items-center gap-2.5 shrink-0 text-slate-500 dark:text-slate-400">
          {filePath && onOpenFile && (
            <button
              type="button"
              onClick={() => onOpenFile(filePath)}
              className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white underline underline-offset-2 whitespace-nowrap"
            >
              查看文件
            </button>
          )}
          {typeof toolCall.durationMs === 'number' && (
            <span className="font-mono tabular-nums text-[11px]">{toolCall.durationMs}ms</span>
          )}
          {toolCall.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>执行中</span>
            </span>
          )}
          {toolCall.status === 'done' && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>完成</span>
            </span>
          )}
          {toolCall.status === 'error' && (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>失败</span>
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          {toolCall.diff && toolCall.diff.length > 0 ? (
            <div className="overflow-x-auto max-h-72 text-xs font-mono leading-5 py-1.5">
              {toolCall.diff.map((line, idx) => {
                const rowClass =
                  line.type === 'add'
                    ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300'
                    : line.type === 'remove'
                    ? 'bg-red-500/12 text-red-800 dark:text-red-300'
                    : 'text-slate-600 dark:text-slate-400';
                const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                const ln = line.lineNumberNew ?? line.lineNumberOld ?? '';
                return (
                  <div key={idx} className={`flex px-3 ${rowClass}`}>
                    <span className="w-9 shrink-0 select-none text-right pr-3 opacity-50 tabular-nums">
                      {ln}
                    </span>
                    <span className="w-4 shrink-0 select-none font-semibold">{prefix}</span>
                    <span className="whitespace-pre">{line.content}</span>
                  </div>
                );
              })}
            </div>
          ) : toolCall.result ? (
            <pre className="p-3 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
              {toolCall.result}
            </pre>
          ) : (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              等待工具输出...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
