import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AtSign,
  CornerDownLeft,
  Cpu,
  FileCode2,
  Shield,
  Slash,
  Square,
  X,
} from 'lucide-react';
import type { EngineMode, ThinkingOption, ToolName } from '../types/pi';

interface SlashCommandItem {
  command: string;
  label: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  { command: '/new', label: '/new', description: '开始一个全新的会话' },
  { command: '/clear', label: '/clear', description: '清空当前对话消息' },
  { command: '/model', label: '/model', description: '打开模型与引擎设置面板' },
  { command: '/readonly', label: '/readonly', description: '切换只读模式 (read, grep, find, ls)' },
  { command: '/full', label: '/full', description: '启用全部 7 个核心与辅助工具' },
  { command: '/test', label: '/test', description: '让 Pi 运行测试并分析结果' },
  { command: '/review', label: '/review', description: '让 Pi 全面审查当前工作区代码' },
];

interface PromptComposerProps {
  input: string;
  onChangeInput: (val: string) => void;
  attachedFiles: string[];
  onRemoveAttachedFile: (path: string) => void;
  onAttachFile: (path: string) => void;
  workspaceFiles: string[];
  isStreaming: boolean;
  onSend: (overrideText?: string) => void;
  onAbort: () => void;
  onSteer: () => void;
  onRunSlashCommand: (command: string) => void;
  engine: EngineMode;
  model: string;
  thinkingLevel: ThinkingOption;
  onChangeThinkingLevel: (level: ThinkingOption) => void;
  enabledTools: ToolName[];
  onOpenModelTab: () => void;
  onOpenToolsTab: () => void;
}

export function PromptComposer({
  input,
  onChangeInput,
  attachedFiles,
  onRemoveAttachedFile,
  onAttachFile,
  workspaceFiles,
  isStreaming,
  onSend,
  onAbort,
  onSteer,
  onRunSlashCommand,
  engine,
  model,
  thinkingLevel,
  onChangeThinkingLevel,
  enabledTools,
  onOpenModelTab,
  onOpenToolsTab,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedMenuIdx, setSelectedMenuIdx] = useState(0);

  const showSlashMenu = input.startsWith('/') && !input.includes(' ') && !input.includes('\n');
  const filteredCommands = showSlashMenu
    ? SLASH_COMMANDS.filter((c) => c.command.startsWith(input.toLowerCase()))
    : [];

  const atMatch = !showSlashMenu ? /(?:^|\s)@([^\s@]*)$/.exec(input) : null;
  const showAtMenu = Boolean(atMatch);
  const atQuery = atMatch ? atMatch[1].toLowerCase() : '';
  const filteredFiles = showAtMenu
    ? workspaceFiles.filter((f) => f.toLowerCase().includes(atQuery)).slice(0, 8)
    : [];

  useEffect(() => {
    setSelectedMenuIdx(0);
  }, [input]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const selectSlashItem = (cmd: SlashCommandItem) => {
    onRunSlashCommand(cmd.command);
  };

  const selectAtFile = (filePath: string) => {
    onAttachFile(filePath);
    const replaced = input.replace(/(?:^|\s)@([^\s@]*)$/, (m) => (m.startsWith(' ') ? ' ' : ''));
    onChangeInput(replaced);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const activeMenu = showSlashMenu ? filteredCommands : showAtMenu ? filteredFiles : [];

    if (activeMenu.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMenuIdx((i) => (i + 1) % activeMenu.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMenuIdx((i) => (i - 1 + activeMenu.length) % activeMenu.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (showSlashMenu) {
          selectSlashItem(filteredCommands[selectedMenuIdx]);
        } else if (showAtMenu) {
          selectAtFile(filteredFiles[selectedMenuIdx]);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() && attachedFiles.length === 0) return;
      if (isStreaming) {
        onSteer();
      } else {
        onSend();
      }
    }
  };

  const engineLabel =
    engine === 'pi-rpc' ? 'pi-rpc' : engine === 'openai-compat' ? 'openai' : 'gemini';

  return (
    <div className="relative">
      {showSlashMenu && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20">
          <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Slash className="w-3 h-3" />
            <span>快捷命令 (Enter 选择)</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.command}
                type="button"
                onClick={() => selectSlashItem(cmd)}
                className={`w-full flex items-center justify-between gap-4 px-3 py-2 text-xs text-left transition-colors ${
                  idx === selectedMenuIdx
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="font-mono font-semibold">{cmd.label}</span>
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAtMenu && filteredFiles.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20">
          <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AtSign className="w-3 h-3" />
            <span>引用工作区文件 (Enter 附加到上下文)</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredFiles.map((filePath, idx) => (
              <button
                key={filePath}
                type="button"
                onClick={() => selectAtFile(filePath)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-left transition-colors ${
                  idx === selectedMenuIdx
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{filePath}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs focus-within:border-slate-400 dark:focus-within:border-slate-600 transition-colors">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
            {attachedFiles.map((filePath) => (
              <span
                key={filePath}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-200"
              >
                <FileCode2 className="w-3 h-3 text-slate-400" />
                <span>{filePath}</span>
                <button
                  type="button"
                  aria-label={`移除 ${filePath}`}
                  onClick={() => onRemoveAttachedFile(filePath)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={2}
          value={input}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Agent 正在执行中... 输入新指令按 Enter 可立即插话引导 (Steer)'
              : '向 Pi 描述你的开发任务，输入 / 查看快捷命令，输入 @ 引用文件...'
          }
          className="w-full px-3.5 pt-3 pb-2 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenModelTab}
              className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 max-w-[220px]"
              title="点击修改引擎与模型配置"
            >
              <Cpu className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">
                {engineLabel} · {model}
              </span>
            </button>

            <select
              aria-label="思考深度"
              value={thinkingLevel}
              onChange={(e) => onChangeThinkingLevel(e.target.value as ThinkingOption)}
              className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 focus:outline-none"
            >
              <option value="LOW">思考: 低</option>
              <option value="MEDIUM">思考: 中</option>
              <option value="HIGH">思考: 高</option>
            </select>

            <button
              type="button"
              onClick={onOpenToolsTab}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="w-3 h-3 text-slate-500" />
              <span className="tabular-nums">
                {enabledTools.length === 7
                  ? '全部工具 (7/7)'
                  : enabledTools.length === 4 &&
                    ['read', 'grep', 'find', 'ls'].every((t) => enabledTools.includes(t as ToolName))
                  ? '只读审查 (4)'
                  : `工具 (${enabledTools.length}/7)`}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isStreaming && (
              <button
                type="button"
                onClick={onAbort}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>中断 (Esc)</span>
              </button>
            )}

            {isStreaming ? (
              <button
                type="button"
                disabled={!input.trim() && attachedFiles.length === 0}
                onClick={onSteer}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>插话引导</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!input.trim() && attachedFiles.length === 0}
                onClick={() => onSend()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-35 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
