import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { detectEnginesStatus, runAgentStream } from './server/agent.ts';
import { deleteSession, getSession, listSessions, saveSession } from './server/sessions.ts';
import {
  WORKSPACE_ROOT,
  buildWorkspaceTree,
  ensureWorkspaceSeeded,
  flattenWorkspaceFiles,
  readWorkspaceFile,
  resolveSafePath,
  runWorkspaceBash,
  setWorkspaceRoot,
  writeWorkspaceFile,
} from './server/workspace.ts';
import type {
  ChatMessage,
  EngineMode,
  ModelOption,
  SessionRecord,
  ThinkingOption,
  ToolName,
  WorkspaceTemplate,
} from './src/types/pi.ts';

dotenv.config();

interface CliArgs {
  port: number;
  host: string;
  workspace?: string;
  prod: boolean;
}

function printServerHelp(): void {
  console.log(`Pi Web Server

用法:
  tsx server.ts [选项]
  node server.ts [选项]

选项:
  -p, --port <port>        监听端口 (默认: 3000，也可设置 PORT 环境变量)
  -H, --host <host>        监听地址 (默认: 0.0.0.0，也可设置 HOST 环境变量)
  -w, --workspace <dir>    指定工作区目录 (默认: ./pi-workspace，也可设置 PI_WORKSPACE)
      --prod               使用生产模式启动 (提供 dist/ 静态构建产物)
  -h, --help               显示此帮助信息并退出

示例:
  tsx server.ts --port 8080 --workspace ~/projects/my-app
`);
}

function parseCliArgs(argv: string[]): CliArgs {
  let port = Number(process.env.PORT) || 3000;
  let host = process.env.HOST || '0.0.0.0';
  let workspace = process.env.PI_WORKSPACE || undefined;
  let prod = process.env.NODE_ENV === 'production';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printServerHelp();
      process.exit(0);
    } else if (arg === '-p' || arg === '--port') {
      const val = Number(argv[++i]);
      if (!Number.isInteger(val) || val < 1 || val > 65535) {
        console.error(`错误: 无效的端口号 "${argv[i] ?? ''}"，请输入 1-65535 之间的整数。`);
        process.exit(1);
      }
      port = val;
    } else if (arg.startsWith('--port=')) {
      const val = Number(arg.slice(7));
      if (!Number.isInteger(val) || val < 1 || val > 65535) {
        console.error(`错误: 无效的端口号 "${arg.slice(7)}"，请输入 1-65535 之间的整数。`);
        process.exit(1);
      }
      port = val;
    } else if (arg === '-H' || arg === '--host') {
      host = argv[++i] || host;
    } else if (arg.startsWith('--host=')) {
      host = arg.slice(7) || host;
    } else if (arg === '-w' || arg === '--workspace') {
      workspace = argv[++i];
    } else if (arg.startsWith('--workspace=')) {
      workspace = arg.slice(12);
    } else if (arg === '--prod') {
      prod = true;
    }
  }

  return { port, host, workspace, prod };
}

const cliArgs = parseCliArgs(process.argv.slice(2));

if (cliArgs.workspace) {
  setWorkspaceRoot(cliArgs.workspace);
}

const app = express();
app.use(express.json({ limit: '4mb' }));

// Ensure workspace directory exists; only auto-seed demo files on default sandbox
ensureWorkspaceSeeded('node-ts', false, Boolean(cliArgs.workspace));

// Track active agent runs so clients can abort/steer in real time
const activeRuns = new Map<string, AbortController>();

// --- Workspace APIs ---
app.get('/api/workspace/tree', (_req, res) => {
  try {
    const tree = buildWorkspaceTree();
    const files = flattenWorkspaceFiles(tree);
    res.json({ tree, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read workspace tree' });
  }
});

app.get('/api/workspace/file', (req, res) => {
  try {
    const filePath = String(req.query.path ?? '');
    if (!filePath) {
      res.status(400).json({ error: 'Missing path query parameter' });
      return;
    }
    const data = readWorkspaceFile(filePath, 1, 5000);
    res.json({ path: filePath, ...data });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'File not found' });
  }
});

app.put('/api/workspace/file', (req, res) => {
  try {
    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || typeof content !== 'string') {
      res.status(400).json({ error: 'path and content are required' });
      return;
    }
    const info = writeWorkspaceFile(filePath, content);
    res.json({ ok: true, path: filePath, ...info });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to write file' });
  }
});

app.post('/api/workspace/file', (req, res) => {
  try {
    const { path: filePath, type, content } = req.body as {
      path?: string;
      type?: 'file' | 'directory';
      content?: string;
    };
    if (!filePath) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    const fullPath = resolveSafePath(filePath);
    if (type === 'directory') {
      fs.mkdirSync(fullPath, { recursive: true });
      res.json({ ok: true, path: filePath });
    } else {
      const info = writeWorkspaceFile(filePath, content ?? '');
      res.json({ ok: true, path: filePath, ...info });
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create entry' });
  }
});

app.delete('/api/workspace/file', (req, res) => {
  try {
    const filePath = String(req.query.path ?? '');
    if (!filePath || filePath === '.') {
      res.status(400).json({ error: 'Valid path is required' });
      return;
    }
    const fullPath = resolveSafePath(filePath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Path does not exist' });
      return;
    }
    fs.rmSync(fullPath, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete entry' });
  }
});

app.post('/api/workspace/reset', (req, res) => {
  try {
    const { template } = req.body as { template?: WorkspaceTemplate };
    ensureWorkspaceSeeded(template ?? 'node-ts', true);
    const tree = buildWorkspaceTree();
    const files = flattenWorkspaceFiles(tree);
    res.json({ ok: true, tree, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset workspace' });
  }
});

// --- Direct Web Shell API ---
app.post('/api/shell', async (req, res) => {
  try {
    const { command } = req.body as { command?: string };
    if (!command || !command.trim()) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }
    const result = await runWorkspaceBash(command);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Shell execution failed' });
  }
});

// --- Session Persistence APIs ---
app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ session });
});

app.post('/api/sessions', (req, res) => {
  const session = req.body as SessionRecord;
  if (!session || !session.id) {
    res.status(400).json({ error: 'Invalid session payload' });
    return;
  }
  const saved = saveSession(session);
  res.json({ session: saved });
});

app.delete('/api/sessions/:id', (req, res) => {
  const ok = deleteSession(req.params.id);
  res.json({ ok });
});

// --- Engine Detection & Agent Streaming APIs ---
app.get('/api/engines/status', async (req, res) => {
  const piCommand = typeof req.query.piCommand === 'string' && req.query.piCommand.trim()
    ? req.query.piCommand.trim()
    : 'pi';
  const status = await detectEnginesStatus(piCommand);
  res.json(status);
});

app.post('/api/agent/abort', (req, res) => {
  const { runId } = req.body as { runId?: string };
  if (runId && activeRuns.has(runId)) {
    activeRuns.get(runId)?.abort();
    activeRuns.delete(runId);
    res.json({ ok: true, aborted: true });
    return;
  }
  res.json({ ok: true, aborted: false });
});

app.post('/api/agent/stream', async (req, res) => {
  const {
    runId,
    engine = 'gemini',
    messages,
    model = 'gemini-4-hydrogen',
    thinkingLevel = 'HIGH',
    maxSteps = 12,
    baseUrl,
    piCommand,
    piProvider,
    enabledTools = ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'],
    customInstruction,
  } = req.body as {
    runId?: string;
    engine?: EngineMode;
    messages?: ChatMessage[];
    model?: ModelOption;
    thinkingLevel?: ThinkingOption;
    maxSteps?: number;
    baseUrl?: string;
    piCommand?: string;
    piProvider?: string;
    enabledTools?: ToolName[];
    customInstruction?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const controller = new AbortController();
  if (runId) {
    activeRuns.set(runId, controller);
  }

  req.on('close', () => {
    controller.abort();
    if (runId) activeRuns.delete(runId);
  });

  const emit = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runAgentStream({
      engine,
      messages,
      model,
      thinkingLevel,
      maxSteps,
      baseUrl,
      piCommand,
      piProvider,
      enabledTools,
      customInstruction,
      signal: controller.signal,
      emit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit('error', { message });
    emit('done', { aborted: controller.signal.aborted });
  } finally {
    if (runId) activeRuns.delete(runId);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

async function startServer() {
  const { port, host, prod } = cliArgs;

  if (!prod) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      console.error('错误: 未找到 dist/ 目录，请先运行 npm run build。');
      process.exit(1);
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`Pi Web 已启动: http://${displayHost}:${port} (绑定 ${host}:${port})`);
    console.log(`当前工作区: ${WORKSPACE_ROOT}`);
  });
}

startServer();
