import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  Cpu,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  EngineMode,
  EngineStatus,
  ModelSettings,
  ShellHistoryEntry,
  ThinkingOption,
  ToolName,
} from '../types/pi';

export type InspectorTab = 'file' | 'shell' | 'model' | 'tools';

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
  // Model settings state
  modelSettings: ModelSettings;
  onChangeModelSettings: (next: Partial<ModelSettings>) => void;
  engineStatus: EngineStatus | null;
  onRefreshEngineStatus: (piCommand?: string) => Promise<void>;
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
  { name: 'bash', title: 'bash', desc: '在工作区执行终端脚本与测试', category: '核心工具' },
  { name: 'grep', title: 'grep', desc: '跨文件检索关键词或正则表达式', category: '辅助检索' },
  { name: 'find', title: 'find', desc: '按路径或文件名快速定位工作区文件', category: '辅助检索' },
  { name: 'ls', title: 'ls', desc: '列出目录结构与文件大小', category: '辅助检索' },
];

const ENGINE_OPTIONS: Array<{ id: EngineMode; title: string; desc: string }> = [
  {
    id: 'gemini',
    title: '内置 Gemini',
    desc: '直接调用服务端 GEMINI_API_KEY',
  },
  {
    id: 'openai-compat',
    title: 'OpenAI 兼容 / Ollama',
    desc: '支持本地 Ollama、LM Studio 或自定义接口',
  },
  {
    id: 'pi-rpc',
    title: '本地 Pi CLI (RPC)',
    desc: '桥接本机安装的 pi --mode rpc 进程',
  },
];

const GEMINI_PRESETS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const OPENAI_PRESETS = ['qwen2.5-coder:14b', 'deepseek-coder-v2', 'gpt-4o'];
const PI_PRESETS = ['claude-sonnet-4-5', 'gpt-4o', 'gemini-2.5-pro'];

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
  modelSettings,
  onChangeModelSettings,
  engineStatus,
  onRefreshEngineStatus,
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
  const [checkingEngine, setCheckingEngine] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    reply?: string;
    error?: string;
  } | null>(null);

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

  useEffect(() => {
    setTestResult(null);
  }, [
    modelSettings.engine,
    modelSettings.model,
    modelSettings.baseUrl,
    modelSettings.piCommand,
    modelSettings.piProvider,
  ]);

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

  const handleSwitchEngine = (engine: EngineMode) => {
    if (engine === modelSettings.engine) return;
    const defaultModel =
      engine === 'gemini'
        ? 'gemini-4-hydrogen'
        : engine === 'openai-compat'
        ? 'qwen2.5-coder:14b'
        : 'claude-sonnet-4-5';
    onChangeModelSettings({ engine, model: defaultModel });
  };

  const handleTestConnection = async () => {
    setTestingModel(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/engines/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: modelSettings.engine,
          model: modelSettings.model,
          thinkingLevel: modelSettings.thinkingLevel,
          baseUrl: modelSettings.baseUrl,
          piCommand: modelSettings.piCommand,
          piProvider: modelSettings.piProvider,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        latencyMs: number;
        reply?: string;
        error?: string;
      };
      setTestResult(data);
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : '网络请求失败',
      });
    } finally {
      setTestingModel(false);
    }
  };

  const lines = draft.split('\n');
  const modelPresets =
    modelSettings.engine === 'gemini'
      ? GEMINI_PRESETS
      : modelSettings.engine === 'openai-compat'
      ? OPENAI_PRESETS
      : PI_PRESETS;

  return (
    <aside className="w-full lg:w-[440px] xl:w-[480px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
      {/* Inspector Tab Strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
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
            <span>文件</span>
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
            <span>终端</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('model')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'model'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>模型设置</span>
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
            <span>工具</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭检查面板"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
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
                在左侧工作区点击任意文件即可实时预览、在线编辑，或查看工具修改后的代码。
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
              cwd: workspace
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
                <div
                  key={entry.id}
                  className="space-y-1.5 pb-3 border-b border-slate-800/80 last:border-b-0"
                >
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

      {/* Tab 3: Model & Engine Settings */}
      {activeTab === 'model' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Engine Mode Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                执行引擎
              </h3>
              <button
                type="button"
                disabled={checkingEngine}
                onClick={async () => {
                  setCheckingEngine(true);
                  try {
                    await onRefreshEngineStatus(modelSettings.piCommand);
                  } finally {
                    setCheckingEngine(false);
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${checkingEngine ? 'animate-spin' : ''}`} />
                <span>检测环境</span>
              </button>
            </div>

            <div className="space-y-2">
              {ENGINE_OPTIONS.map((opt) => {
                const active = modelSettings.engine === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSwitchEngine(opt.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.title}
                      </span>
                      {opt.id === 'pi-rpc' && engineStatus && (
                        <span
                          className={`text-[11px] font-medium ${
                            engineStatus.piCliAvailable
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {engineStatus.piCliAvailable
                            ? `已检测到 (${engineStatus.piVersion})`
                            : '未检测到 pi 命令'}
                        </span>
                      )}
                      {opt.id === 'gemini' && engineStatus && (
                        <span
                          className={`text-[11px] font-medium ${
                            engineStatus.geminiConfigured
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {engineStatus.geminiConfigured ? 'GEMINI_API_KEY 已就绪' : '未配置密钥'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Name Input + Quick Presets */}
          <div>
            <label
              htmlFor="model-id-input"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              模型名称 (Model ID)
            </label>
            <input
              id="model-id-input"
              type="text"
              value={modelSettings.model}
              onChange={(e) => onChangeModelSettings({ model: e.target.value })}
              placeholder="输入任意模型 ID..."
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {modelPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeModelSettings({ model: preset })}
                  className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                    modelSettings.model === preset
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* OpenAI-Compatible Base URL */}
          {modelSettings.engine === 'openai-compat' && (
            <div>
              <label
                htmlFor="base-url-input"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                接口 Base URL
              </label>
              <input
                id="base-url-input"
                type="text"
                value={modelSettings.baseUrl}
                onChange={(e) => onChangeModelSettings({ baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() =>
                    onChangeModelSettings({ baseUrl: 'http://localhost:11434/v1' })
                  }
                  className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Ollama (:11434)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeModelSettings({ baseUrl: 'http://localhost:1234/v1' })
                  }
                  className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  LM Studio (:1234)
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                本地 Ollama 无需密钥；若连接远端兼容接口，可在服务端 <code className="font-mono">.env</code> 中设置 <code className="font-mono">OPENAI_API_KEY</code>。
              </p>
            </div>
          )}

          {/* Pi CLI RPC Bridge Options */}
          {modelSettings.engine === 'pi-rpc' && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="pi-cmd-input"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Pi 可执行命令
                </label>
                <input
                  id="pi-cmd-input"
                  type="text"
                  value={modelSettings.piCommand}
                  onChange={(e) => onChangeModelSettings({ piCommand: e.target.value })}
                  placeholder="pi"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label
                  htmlFor="pi-provider-input"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Provider（可选，如 anthropic / openai / google / ollama）
                </label>
                <input
                  id="pi-provider-input"
                  type="text"
                  value={modelSettings.piProvider}
                  onChange={(e) => onChangeModelSettings({ piProvider: e.target.value })}
                  placeholder="留空则使用 Pi 默认配置"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                该模式通过 <code className="font-mono">pi --mode rpc</code> 直接驱动你本机安装的官方 <code className="font-mono">@mariozechner/pi-coding-agent</code>，复用你本地的 Pi 配置、扩展与凭证。
              </p>
            </div>
          )}

          {/* Thinking Level */}
          <div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              思考深度 (Thinking Level)
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['LOW', 'MEDIUM', 'HIGH'] as ThinkingOption[]).map((lvl) => {
                const active = modelSettings.thinkingLevel === lvl;
                const label = lvl === 'LOW' ? '低 (LOW)' : lvl === 'MEDIUM' ? '中 (MEDIUM)' : '高 (HIGH)';
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onChangeModelSettings({ thinkingLevel: lvl })}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Steps */}
          {modelSettings.engine !== 'pi-rpc' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="max-steps-range"
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  单轮最大工具调用步数
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {modelSettings.maxSteps} 步
                </span>
              </div>
              <input
                id="max-steps-range"
                type="range"
                min={1}
                max={30}
                value={modelSettings.maxSteps}
                onChange={(e) => onChangeModelSettings({ maxSteps: Number(e.target.value) })}
                className="w-full accent-slate-900 dark:accent-slate-100"
              />
            </div>
          )}

          {/* Connection Test Action & Output */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <button
              type="button"
              disabled={testingModel || !modelSettings.model.trim()}
              onClick={handleTestConnection}
              className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 transition-colors"
            >
              {testingModel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在发送测试请求...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>测试模型连通性</span>
                </>
              )}
            </button>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                  testResult.ok
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {testResult.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{testResult.ok ? '连接成功' : '连接失败'}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] opacity-80">
                    {testResult.latencyMs}ms
                  </span>
                </div>
                {testResult.reply && (
                  <div className="font-mono text-[11px] opacity-90 break-words">
                    返回：{testResult.reply}
                  </div>
                )}
                {testResult.error && (
                  <div className="font-mono text-[11px] whitespace-pre-wrap break-words opacity-95">
                    {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Tool Allowlist (--tools) & System Prompt */}
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
              追加到系统提示词末尾的自定义规范或编码风格要求。
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
