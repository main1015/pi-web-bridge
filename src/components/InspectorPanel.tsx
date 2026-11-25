import { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Check,
  FileCode2,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { ShellHistoryEntry, ToolName } from '../types/pi';

export type InspectorTab = 'file' | 'shell' | 'tools';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  onClose?: () => void;
  // File viewer/editor state
  filePath: string | null;
  fileContent: string;
  fileMeta: { totalLines: number; size: number } | null;
  fileLoading: boolean;
  onSaveFile: (path: string, content: string) => Promise<void>;
  onAttachFile: (path: string) => void;
  // Web shell state
  shellHistory: ShellHistoryEntry[];
  shellRunning: boolean;
  onRunShell: (command: string) => Promise<void>;
  onClearShell: () => void;
  // Tools & instructions state
  enabledTools: ToolName[];
  onToggleTool: (tool: ToolName) => void;
  onApplyToolPreset: (preset: 'full' | 'readonly' | 'chat') => void;
  customInstruction: string;
  onChangeCustomInstruction: (val: string) => void;
}

const ALL_TOOL_INFO: Array<{ name: ToolName; title: string; desc: string; category: string }> = [
  { name: 'read', title: 'read', desc: '读取工作区文件内容与指定行范围', category: '核心工具' },
  { name: 'write', title: 'write', desc: '创建新文件或覆写完整文件内容', category: '核心工具' },
  { name: 'edit', title: 'edit', desc: '精确局部替换文件代码片段', category: '核心工具' },
  { name: 'bash', title: 'bash', desc: '在沙箱工作区执行终端脚本与测试', category: '核心工具' },
  { name: 'grep', title: 'grep', desc: '跨文件检索关键词或正则表达式', category: '辅助检索' },
  { name: 'find', title: 'find', desc: '按路径或文件名快速定位工作区文件', category: '辅助检索' },
  { name: 'ls', title: 'ls', desc: '列出目录结构与文件大小', category: '辅助检索' },
];

export function InspectorPanel({
  activeTab,
  onChangeTab,
  onClose,
  filePath,
  fileContent,
  fileMeta,
  fileLoading,
  onSaveFile,
  onAttachFile,
  shellHistory,
  shellRunning,
  onRunShell,
  onClearShell,
  enabledTools,
  onToggleTool,
  onApplyToolPreset,
  customInstruction,
  onChangeCustomInstruction,
}: InspectorPanelProps) {
  const [draft, setDraft] = useState(fileContent);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [shellInput, setShellInput] = useState('');
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const shellEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(fileContent);
    setIsEditing(false);
  }, [filePath, fileContent]);

  useEffect(() => {
    shellEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [shellHistory]);

  const isDirty = draft !== fileContent;

  const handleSave = async () => {
    if (!filePath || !isDirty) return;
    setSaving(true);
    try {
      await onSaveFile(filePath, draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const handleShellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = shellInput.trim();
    if (!cmd || shellRunning) return;
    setShellInput('');
    setCmdHistoryIdx(-1);
    await onRunShell(cmd);
  };

  const handleShellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const cmds = shellHistory.map((h) => h.command);
    if (e.key === 'ArrowUp' && cmds.length > 0) {
      e.preventDefault();
      const nextIdx = cmdHistoryIdx < cmds.length - 1 ? cmdHistoryIdx + 1 : cmds.length - 1;
      setCmdHistoryIdx(nextIdx);
      setShellInput(cmds[cmds.length - 1 - nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdHistoryIdx <= 0) {
        setCmdHistoryIdx(-1);
        setShellInput('');
      } else {
        const nextIdx = cmdHistoryIdx - 1;
        setCmdHistoryIdx(nextIdx);
        setShellInput(cmds[cmds.length - 1 - nextIdx]);
      }
    }
  };

  const lines = draft.split('\n');

  return (
    <aside className="w-full lg:w-[440px] xl:w-[480px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
      {/* Inspector Tab Strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeTab('file')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'file'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>文件检查</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('shell')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'shell'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Web 终端</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('tools')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tools'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>工具权限</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭检查面板"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab 1: File Viewer / Editor */}
      {activeTab === 'file' && (
        <div className="flex-1 flex flex-col min-h-0">
          {!filePath ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400">
              <FileCode2 className="w-8 h-8 mb-3 opacity-40" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                未选择工作区文件
              </p>
              <p className="text-xs mt-1 max-w-xs leading-relaxed">
                在左侧工作区点击任意文件即可实时预览、在线编辑，或查看 Pi 工具修改后的代码。
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-xs">
                <div className="min-w-0">
                  <div className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                    {filePath}
                  </div>
                  {fileMeta && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {fileMeta.totalLines} 行 · {fileMeta.size} B
                      {isDirty ? ' · 未保存修改' : ''}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAttachFile(filePath)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    <AtSign className="w-3 h-3" />
                    <span>引用</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing((v) => !v)}
                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${
                      isEditing
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isEditing ? '预览' : '编辑'}
                  </button>
                  {isDirty && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSave}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : savedNotice ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      <span>{savedNotice ? '已保存' : '保存'}</span>
                    </button>
                  )}
                </div>
              </div>

              {fileLoading ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>加载文件中...</span>
                </div>
              ) : isEditing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 w-full p-3.5 font-mono text-xs leading-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 resize-none focus:outline-none"
                />
              ) : (
                <div className="flex-1 overflow-auto py-3 text-xs font-mono leading-6">
                  {lines.map((line, i) => (
                    <div
                      key={i}
                      className="flex px-3 hover:bg-slate-100/70 dark:hover:bg-slate-900/60"
                    >
                      <span className="w-9 shrink-0 select-none text-right pr-3 text-slate-400 dark:text-slate-600 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="whitespace-pre text-slate-800 dark:text-slate-200">
                        {line || ' '}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: Interactive Web Shell */}
      {activeTab === 'shell' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-mono">
              cwd: ./pi-workspace
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onRunShell('npm test')}
                disabled={shellRunning}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                <span>运行测试</span>
              </button>
              {shellHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearShell}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title="清空终端记录"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-950 text-slate-200 font-mono text-xs">
            {shellHistory.length === 0 ? (
              <div className="text-slate-500 py-4 leading-relaxed">
                可直接在此运行任意工作区 Shell 命令（如 <code className="text-slate-300">ls -la</code>、<code className="text-slate-300">node src/index.mjs</code>、<code className="text-slate-300">npm test</code>），无需切换到本地命令行。
              </div>
            ) : (
              shellHistory.map((entry) => (
                <div key={entry.id} className="space-y-1.5 pb-3 border-b border-slate-800/80 last:border-b-0">
                  <div className="flex items-center justify-between gap-2 text-slate-400">
                    <div className="text-slate-100 font-semibold break-all">
                      <span className="text-emerald-400 mr-1.5">$</span>
                      {entry.command}
                    </div>
                    <span className="text-[11px] tabular-nums shrink-0">
                      exit {entry.exitCode ?? '?'} · {entry.durationMs}ms
                    </span>
                  </div>
                  {entry.stdout && (
                    <pre className="whitespace-pre-wrap break-words text-slate-300 leading-relaxed">
                      {entry.stdout}
                    </pre>
                  )}
                  {entry.stderr && (
                    <pre className="whitespace-pre-wrap break-words text-red-400 leading-relaxed">
                      {entry.stderr}
                    </pre>
                  )}
                </div>
              ))
            )}
            <div ref={shellEndRef} />
          </div>

          <form
            onSubmit={handleShellSubmit}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-800 bg-slate-900"
          >
            <span className="font-mono text-xs text-emerald-400 font-semibold select-none">$</span>
            <input
              type="text"
              value={shellInput}
              onChange={(e) => setShellInput(e.target.value)}
              onKeyDown={handleShellKeyDown}
              placeholder="输入 bash 命令并按 Enter 执行..."
              className="flex-1 bg-transparent font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            {shellRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </form>
        </div>
      )}

      {/* Tab 3: Tool Allowlist (--tools) & System Prompt */}
      {activeTab === 'tools' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                工具权限控制 (--tools)
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                已启用 {enabledTools.length}/7
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              遵循 Pi 的最小内核设计：你可以一键切换只读审查模式，或精细控制 Agent 允许调用的工具。
            </p>

            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <button
                type="button"
                onClick={() => onApplyToolPreset('full')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                完整代理
              </button>
              <button
                type="button"
                onClick={() => onApplyToolPreset('readonly')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                只读审查
              </button>
              <button
                type="button"
                onClick={() => onApplyToolPreset('chat')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                纯对话
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {ALL_TOOL_INFO.map((tool) => {
                const checked = enabledTools.includes(tool.name);
                return (
                  <label
                    key={tool.name}
                    className="flex items-start justify-between gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {tool.title}
                        </span>
                        <span className="text-[11px] text-slate-400">{tool.category}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {tool.desc}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleTool(tool.name)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 accent-slate-900 dark:accent-slate-100"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              工作区附加指令 (AGENTS.md)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              追加到 Pi 系统提示词末尾的自定义规范或编码风格要求。
            </p>
            <textarea
              rows={4}
              value={customInstruction}
              onChange={(e) => onChangeCustomInstruction(e.target.value)}
              placeholder="例如：修改代码后务必运行 npm test 验证，并保持零额外依赖。"
              className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>
      )}
    </aside>
  );
}
