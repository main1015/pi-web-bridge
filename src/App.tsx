import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Loader2,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  Sun,
} from 'lucide-react';
import { InspectorPanel, type InspectorTab } from './components/InspectorPanel';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { PromptComposer } from './components/PromptComposer';
import { Sidebar } from './components/Sidebar';
import { ToolCallBlock } from './components/ToolCallBlock';
import type {
  ChatMessage,
  EngineStatus,
  ModelSettings,
  SessionRecord,
  SessionSummary,
  ShellHistoryEntry,
  ToolCallEvent,
  ToolName,
  WorkspaceFileNode,
  WorkspaceTemplate,
} from './types/pi';

const ALL_TOOLS: ToolName[] = ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'];
const READONLY_TOOLS: ToolName[] = ['read', 'grep', 'find', 'ls'];

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  engine: 'gemini',
  model: 'gemini-4-hydrogen',
  thinkingLevel: 'HIGH',
  maxSteps: 12,
  baseUrl: 'http://localhost:11434/v1',
  piCommand: 'pi',
  piProvider: '',
};

function loadSavedModelSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem('pi_model_settings');
    if (raw) {
      return { ...DEFAULT_MODEL_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_MODEL_SETTINGS;
}

const STARTER_PROMPTS = [
  {
    title: '探索项目并运行测试',
    prompt: '先查看当前工作区的所有文件，读一下核心代码并运行现有单元测试。',
  },
  {
    title: '新增统计函数并测试',
    prompt: '在 src/math.mjs 中新增 median（中位数）函数，并在 tests/math.test.mjs 中补充测试，最后运行测试验证。',
  },
  {
    title: '创建并运行脚本',
    prompt: '在 src/ 目录下创建一个 CLI 工具脚本，统计工作区所有文件的行数并输出结果。',
  },
  {
    title: '代码质量审查',
    prompt: '检查当前工作区全部代码，指出潜在边界条件问题和改进建议。',
  },
];

function createEmptySession(settings: ModelSettings): SessionRecord {
  const now = Date.now();
  return {
    id: `sess_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: '新会话',
    createdAt: now,
    updatedAt: now,
    engine: settings.engine,
    model: settings.model,
    thinkingLevel: settings.thinkingLevel,
    maxSteps: settings.maxSteps,
    baseUrl: settings.baseUrl,
    piCommand: settings.piCommand,
    piProvider: settings.piProvider,
    enabledTools: [...ALL_TOOLS],
    messages: [],
  };
}

function ThoughtSection({ thinking, streaming }: { thinking: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/80 dark:bg-slate-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{streaming ? '正在推理思考...' : '查看推理过程'}</span>
        </span>
        <span className="font-mono text-[11px] tabular-nums opacity-70">
          {thinking.length} 字符
        </span>
      </button>
      {open && (
        <div className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed font-mono max-h-64 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pi_theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('pi_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const [showSidebar, setShowSidebar] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('file');

  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadSavedModelSettings());
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRecord>(() =>
    createEmptySession(loadSavedModelSettings())
  );

  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState('');
  const [activeFileMeta, setActiveFileMeta] = useState<{ totalLines: number; size: number } | null>(
    null
  );
  const [fileLoading, setFileLoading] = useState(false);

  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [shellHistory, setShellHistory] = useState<ShellHistoryEntry[]>([]);
  const [shellRunning, setShellRunning] = useState(false);

  const activeRunIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleChangeModelSettings = useCallback((patch: Partial<ModelSettings>) => {
    setModelSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('pi_model_settings', JSON.stringify(next));
      setActiveSession((s) => ({
        ...s,
        engine: next.engine,
        model: next.model,
        thinkingLevel: next.thinkingLevel,
        maxSteps: next.maxSteps,
        baseUrl: next.baseUrl,
        piCommand: next.piCommand,
        piProvider: next.piProvider,
      }));
      return next;
    });
  }, []);

  const refreshEngineStatus = useCallback(async (piCmd?: string) => {
    try {
      const q = piCmd ? `?piCommand=${encodeURIComponent(piCmd)}` : '';
      const res = await fetch(`/api/engines/status${q}`);
      if (res.ok) {
        const data = (await res.json()) as EngineStatus;
        setEngineStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionSummary[] };
        setSessions(data.sessions || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const openFile = useCallback(async (relPath: string, openPanel = true) => {
    setActiveFilePath(relPath);
    if (openPanel) {
      setShowInspector(true);
      setInspectorTab('file');
    }
    setFileLoading(true);
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(relPath)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          content: string;
          totalLines: number;
          size: number;
        };
        setActiveFileContent(data.content);
        setActiveFileMeta({ totalLines: data.totalLines, size: data.size });
      }
    } finally {
      setFileLoading(false);
    }
  }, []);

  const refreshWorkspaceTree = useCallback(
    async (keepOpenPath?: string | null) => {
      try {
        const res = await fetch('/api/workspace/tree');
        if (res.ok) {
          const data = (await res.json()) as {
            tree: WorkspaceFileNode[];
            files: string[];
          };
          setFileTree(data.tree || []);
          setWorkspaceFiles(data.files || []);
          const target = keepOpenPath ?? activeFilePath;
          if (target && data.files.includes(target)) {
            await openFile(target, false);
          } else if (!target && data.files.length > 0) {
            const preferred =
              data.files.find((f) => f === 'src/math.mjs') ||
              data.files.find((f) => f === 'README.md') ||
              data.files[0];
            if (preferred) {
              await openFile(preferred, false);
            }
          }
        }
      } catch {
        // ignore
      }
    },
    [activeFilePath, openFile]
  );

  useEffect(() => {
    refreshSessions();
    refreshWorkspaceTree();
    refreshEngineStatus(modelSettings.piCommand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession.messages]);

  const persistSession = useCallback(
    async (session: SessionRecord) => {
      if (session.messages.length === 0) return;
      try {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        });
        refreshSessions();
      } catch {
        // ignore
      }
    },
    [refreshSessions]
  );

  const handleAbort = useCallback(async () => {
    const runId = activeRunIdRef.current;
    abortControllerRef.current?.abort();
    if (runId) {
      try {
        await fetch('/api/agent/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleAbort();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStreaming, handleAbort]);

  const runAgentTurn = useCallback(
    async (sessionSnapshot: SessionRecord) => {
      setIsStreaming(true);
      setErrorBanner(null);

      const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      activeRunIdRef.current = runId;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const assistantId = `msg_${Date.now()}_assistant`;
      const initialAssistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        thinking: '',
        toolCalls: [],
        timestamp: Date.now(),
        model: modelSettings.model,
        engine: modelSettings.engine,
      };

      const messagesWithPlaceholder = [...sessionSnapshot.messages, initialAssistant];
      let latestSession: SessionRecord = {
        ...sessionSnapshot,
        updatedAt: Date.now(),
        messages: messagesWithPlaceholder,
      };
      setActiveSession(latestSession);

      const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
        setActiveSession((prev) => {
          const nextMsgs = prev.messages.map((m) => (m.id === assistantId ? updater(m) : m));
          const updated: SessionRecord = {
            ...prev,
            updatedAt: Date.now(),
            messages: nextMsgs,
          };
          latestSession = updated;
          return updated;
        });
      };

      try {
        const response = await fetch('/api/agent/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            runId,
            engine: modelSettings.engine,
            messages: sessionSnapshot.messages,
            model: modelSettings.model,
            thinkingLevel: modelSettings.thinkingLevel,
            maxSteps: modelSettings.maxSteps,
            baseUrl: modelSettings.baseUrl,
            piCommand: modelSettings.piCommand,
            piProvider: modelSettings.piProvider,
            enabledTools: sessionSnapshot.enabledTools,
            customInstruction: customInstruction.trim() || undefined,
          }),
        });

        if (!response.ok || !response.body) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            if (!frame.trim()) continue;
            let eventName = 'message';
            const dataLines: string[] = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length === 0) continue;

            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(dataLines.join('\n'));
            } catch {
              continue;
            }

            if (eventName === 'thought_delta') {
              const delta = String(payload.text ?? '');
              updateAssistant((m) => ({
                ...m,
                thinking: (m.thinking ?? '') + delta,
              }));
            } else if (eventName === 'text_delta') {
              const delta = String(payload.text ?? '');
              updateAssistant((m) => ({
                ...m,
                content: m.content + delta,
              }));
            } else if (eventName === 'tool_start') {
              const tc: ToolCallEvent = {
                id: String(payload.id),
                name: payload.name as ToolName,
                args: (payload.args as Record<string, unknown>) ?? {},
                status: 'running',
              };
              updateAssistant((m) => ({
                ...m,
                toolCalls: [...(m.toolCalls ?? []), tc],
              }));
            } else if (eventName === 'tool_end') {
              const callId = String(payload.id);
              updateAssistant((m) => ({
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === callId
                    ? {
                        ...tc,
                        status: payload.status as 'done' | 'error',
                        result: String(payload.result ?? ''),
                        diff: payload.diff as ToolCallEvent['diff'],
                        durationMs:
                          typeof payload.durationMs === 'number' ? payload.durationMs : undefined,
                      }
                    : tc
                ),
              }));
            } else if (eventName === 'workspace_changed') {
              refreshWorkspaceTree();
            } else if (eventName === 'turn_done') {
              const usage = payload.usage as ChatMessage['usage'];
              updateAssistant((m) => ({ ...m, usage }));
            } else if (eventName === 'error') {
              setErrorBanner(String(payload.message ?? '请求处理失败'));
            } else if (eventName === 'done') {
              if (payload.aborted) {
                updateAssistant((m) => ({ ...m, aborted: true }));
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          updateAssistant((m) => ({ ...m, aborted: true }));
        } else {
          setErrorBanner(err instanceof Error ? err.message : String(err));
        }
      } finally {
        activeRunIdRef.current = null;
        abortControllerRef.current = null;
        setIsStreaming(false);
        await persistSession(latestSession);
      }
    },
    [customInstruction, modelSettings, persistSession, refreshWorkspaceTree]
  );

  const handleSend = useCallback(
    async (overrideText?: string) => {
      if (isStreaming) return;
      const text = (overrideText ?? input).trim();
      if (!text && attachedFiles.length === 0) return;

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: text || '请查看我引用的文件。',
        attachedFiles: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
        timestamp: Date.now(),
      };

      const isFirst = activeSession.messages.length === 0;
      const nextTitle = isFirst
        ? text.slice(0, 32) || attachedFiles[0] || '新会话'
        : activeSession.title;

      const nextSession: SessionRecord = {
        ...activeSession,
        title: nextTitle,
        updatedAt: Date.now(),
        messages: [...activeSession.messages, userMsg],
      };

      setInput('');
      setAttachedFiles([]);
      setActiveSession(nextSession);
      await runAgentTurn(nextSession);
    },
    [activeSession, attachedFiles, input, isStreaming, runAgentTurn]
  );

  const handleSteer = useCallback(async () => {
    const steerText = input.trim();
    if (!steerText && attachedFiles.length === 0) return;
    await handleAbort();
    setTimeout(() => {
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_steer`,
        role: 'user',
        content: steerText,
        attachedFiles: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
        timestamp: Date.now(),
      };
      setInput('');
      setAttachedFiles([]);
      setActiveSession((prev) => {
        const next: SessionRecord = {
          ...prev,
          updatedAt: Date.now(),
          messages: [...prev.messages, userMsg],
        };
        void runAgentTurn(next);
        return next;
      });
    }, 120);
  }, [attachedFiles, handleAbort, input, runAgentTurn]);

  const handleNewSession = useCallback(() => {
    if (isStreaming) {
      void handleAbort();
    }
    setActiveSession(createEmptySession(modelSettings));
    setAttachedFiles([]);
    setErrorBanner(null);
  }, [handleAbort, isStreaming, modelSettings]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      if (isStreaming) {
        await handleAbort();
      }
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = (await res.json()) as { session: SessionRecord };
        setActiveSession(data.session);
        setErrorBanner(null);
      }
    },
    [handleAbort, isStreaming]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (activeSession.id === id) {
        setActiveSession(createEmptySession(modelSettings));
      }
      refreshSessions();
    },
    [activeSession.id, modelSettings, refreshSessions]
  );

  const handleRunSlashCommand = useCallback(
    (command: string) => {
      setInput('');
      switch (command) {
        case '/new':
          handleNewSession();
          break;
        case '/clear':
          setActiveSession((prev) => ({ ...prev, messages: [], updatedAt: Date.now() }));
          break;
        case '/model':
          setShowInspector(true);
          setInspectorTab('model');
          break;
        case '/readonly':
          setActiveSession((prev) => ({ ...prev, enabledTools: [...READONLY_TOOLS] }));
          break;
        case '/full':
          setActiveSession((prev) => ({ ...prev, enabledTools: [...ALL_TOOLS] }));
          break;
        case '/test':
          void handleSend('请使用 bash 运行工作区中的测试并告诉我结果；如有失败请修复。');
          break;
        case '/review':
          void handleSend('请使用只读检索工具全面审查当前工作区代码，指出潜在问题与优化点。');
          break;
      }
    },
    [handleNewSession, handleSend]
  );

  const handleAttachFile = useCallback((path: string) => {
    setAttachedFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const handleCreateFile = useCallback(
    async (path: string, type: 'file' | 'directory') => {
      await fetch('/api/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, type, content: '' }),
      });
      await refreshWorkspaceTree(path);
      if (type === 'file') {
        await openFile(path, true);
      }
    },
    [openFile, refreshWorkspaceTree]
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
      if (activeFilePath === path) {
        setActiveFilePath(null);
        setActiveFileContent('');
        setActiveFileMeta(null);
      }
      await refreshWorkspaceTree();
    },
    [activeFilePath, refreshWorkspaceTree]
  );

  const handleSaveFile = useCallback(
    async (path: string, content: string) => {
      await fetch('/api/workspace/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      await openFile(path, false);
      await refreshWorkspaceTree(path);
    },
    [openFile, refreshWorkspaceTree]
  );

  const handleResetWorkspace = useCallback(
    async (template: WorkspaceTemplate) => {
      await fetch('/api/workspace/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      setActiveFilePath(null);
      setActiveFileContent('');
      setActiveFileMeta(null);
      await refreshWorkspaceTree();
    },
    [refreshWorkspaceTree]
  );

  const handleRunShell = useCallback(
    async (command: string) => {
      setShellRunning(true);
      try {
        const res = await fetch('/api/shell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const data = (await res.json()) as {
          stdout?: string;
          stderr?: string;
          exitCode?: number | null;
          durationMs?: number;
          error?: string;
        };
        setShellHistory((prev) => [
          ...prev,
          {
            id: `sh_${Date.now()}`,
            command,
            stdout: data.stdout ?? '',
            stderr: data.stderr ?? data.error ?? '',
            exitCode: data.exitCode ?? null,
            durationMs: data.durationMs ?? 0,
            timestamp: Date.now(),
          },
        ]);
        await refreshWorkspaceTree();
      } finally {
        setShellRunning(false);
      }
    },
    [refreshWorkspaceTree]
  );

  const handleToggleTool = useCallback((tool: ToolName) => {
    setActiveSession((prev) => {
      const exists = prev.enabledTools.includes(tool);
      const nextTools = exists
        ? prev.enabledTools.filter((t) => t !== tool)
        : [...prev.enabledTools, tool];
      return { ...prev, enabledTools: nextTools };
    });
  }, []);

  const handleApplyToolPreset = useCallback((preset: 'full' | 'readonly' | 'chat') => {
    setActiveSession((prev) => ({
      ...prev,
      enabledTools:
        preset === 'full' ? [...ALL_TOOLS] : preset === 'readonly' ? [...READONLY_TOOLS] : [],
    }));
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="h-13 shrink-0 flex items-center justify-between gap-8 px-4 lg:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleNewSession();
          }}
          className="font-display text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
        >
          pi.web
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => {
              setShowInspector(true);
              setInspectorTab('file');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              showInspector && inspectorTab === 'file'
                ? 'text-slate-950 dark:text-white border-slate-900 dark:border-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            文件检查
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInspector(true);
              setInspectorTab('shell');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              showInspector && inspectorTab === 'shell'
                ? 'text-slate-950 dark:text-white border-slate-900 dark:border-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Web 终端
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInspector(true);
              setInspectorTab('model');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              showInspector && inspectorTab === 'model'
                ? 'text-slate-950 dark:text-white border-slate-900 dark:border-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            模型设置
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInspector(true);
              setInspectorTab('tools');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              showInspector && inspectorTab === 'tools'
                ? 'text-slate-950 dark:text-white border-slate-900 dark:border-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            工具权限
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建会话</span>
          </button>
        </div>
      </header>

      {/* Main 3-Pane Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showSidebar && (
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSession.id}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            fileTree={fileTree}
            activeFilePath={activeFilePath}
            onOpenFile={(p) => openFile(p, true)}
            onAttachFile={handleAttachFile}
            onCreateFile={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onRefreshTree={() => refreshWorkspaceTree()}
            onResetWorkspace={handleResetWorkspace}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
          <div className="h-10 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setShowSidebar((v) => !v)}
                aria-label="切换侧边栏"
                className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </button>
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                {activeSession.title || '新会话'}
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  setShowInspector(true);
                  setInspectorTab('model');
                }}
                className="font-mono text-[11px] truncate hover:text-slate-900 dark:hover:text-white underline-offset-2 hover:underline"
              >
                {modelSettings.engine} / {modelSettings.model}
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isStreaming && (
                <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>实时执行中</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowInspector((v) => !v)}
                aria-label="切换右侧检查面板"
                className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {activeSession.messages.length === 0 ? (
                <div className="py-10 sm:py-16">
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950 dark:text-white text-balance">
                    Pi 编码工作台
                  </h1>
                  <p className="mt-2.5 text-sm sm:text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                    支持内置 Gemini、OpenAI 兼容 / 本地 Ollama，以及直接桥接本机{' '}
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      pi --mode rpc
                    </span>
                    。可在右侧「模型设置」自由修改引擎与模型参数。
                  </p>

                  <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {STARTER_PROMPTS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => void handleSend(item.prompt)}
                        className="p-4 text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                          {item.prompt}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeSession.messages.map((msg) => (
                  <div key={msg.id} className="space-y-2.5">
                    {msg.role === 'user' ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 shadow-2xs">
                          {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                              {msg.attachedFiles.map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  onClick={() => openFile(f, true)}
                                  className="inline-flex items-center gap-1 text-xs font-mono text-slate-600 dark:text-slate-300 hover:underline"
                                >
                                  <FileCode2 className="w-3 h-3" />
                                  <span>{f}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {msg.thinking && (
                          <ThoughtSection
                            thinking={msg.thinking}
                            streaming={isStreaming && !msg.content}
                          />
                        )}

                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-2">
                            {msg.toolCalls.map((tc) => (
                              <ToolCallBlock
                                key={tc.id}
                                toolCall={tc}
                                onOpenFile={(p) => openFile(p, true)}
                              />
                            ))}
                          </div>
                        )}

                        {msg.content && <MarkdownRenderer content={msg.content} />}

                        {msg.aborted && (
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            已由用户中断当前执行
                          </div>
                        )}

                        {msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens) ? (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums pt-1">
                            输入 {msg.usage.inputTokens ?? 0} tokens · 输出{' '}
                            {msg.usage.outputTokens ?? 0} tokens
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))
              )}

              {errorBanner && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 whitespace-pre-wrap break-words leading-relaxed">
                    {errorBanner}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="shrink-0 px-4 sm:px-8 pb-4 pt-2 bg-gradient-to-t from-slate-50 via-slate-50 dark:from-slate-950 dark:via-slate-950 to-transparent">
            <div className="max-w-3xl mx-auto">
              <PromptComposer
                input={input}
                onChangeInput={setInput}
                attachedFiles={attachedFiles}
                onRemoveAttachedFile={(p) =>
                  setAttachedFiles((prev) => prev.filter((item) => item !== p))
                }
                onAttachFile={handleAttachFile}
                workspaceFiles={workspaceFiles}
                isStreaming={isStreaming}
                onSend={handleSend}
                onAbort={handleAbort}
                onSteer={handleSteer}
                onRunSlashCommand={handleRunSlashCommand}
                engine={modelSettings.engine}
                model={modelSettings.model}
                thinkingLevel={modelSettings.thinkingLevel}
                onChangeThinkingLevel={(thinkingLevel) =>
                  handleChangeModelSettings({ thinkingLevel })
                }
                enabledTools={activeSession.enabledTools}
                onOpenModelTab={() => {
                  setShowInspector(true);
                  setInspectorTab('model');
                }}
                onOpenToolsTab={() => {
                  setShowInspector(true);
                  setInspectorTab('tools');
                }}
              />
            </div>
          </div>
        </main>

        {showInspector && (
          <InspectorPanel
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            onClose={() => setShowInspector(false)}
            filePath={activeFilePath}
            fileContent={activeFileContent}
            fileMeta={activeFileMeta}
            fileLoading={fileLoading}
            onSaveFile={handleSaveFile}
            onAttachFile={handleAttachFile}
            shellHistory={shellHistory}
            shellRunning={shellRunning}
            onRunShell={handleRunShell}
            onClearShell={() => setShellHistory([])}
            modelSettings={modelSettings}
            onChangeModelSettings={handleChangeModelSettings}
            engineStatus={engineStatus}
            onRefreshEngineStatus={refreshEngineStatus}
            enabledTools={activeSession.enabledTools}
            onToggleTool={handleToggleTool}
            onApplyToolPreset={handleApplyToolPreset}
            customInstruction={customInstruction}
            onChangeCustomInstruction={setCustomInstruction}
          />
        )}
      </div>
    </div>
  );
}
