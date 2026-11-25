import { spawn } from 'node:child_process';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import type {
  ChatMessage,
  DiffLine,
  EngineMode,
  EngineStatus,
  ThinkingOption,
  ToolName,
} from '../src/types/pi.ts';
import {
  WORKSPACE_ROOT,
  editWorkspaceFile,
  findWorkspaceFiles,
  grepWorkspace,
  listWorkspaceDir,
  readWorkspaceFile,
  runWorkspaceBash,
  writeWorkspaceFile,
} from './workspace.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const TOOL_DECLARATIONS: Record<ToolName, FunctionDeclaration> = {
  read: {
    name: 'read',
    description:
      'Read the contents of a file in the workspace. Returns line-numbered output. Use offset and limit for large files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Relative path to the file inside the workspace, e.g. "src/math.mjs".',
        },
        offset: {
          type: Type.INTEGER,
          description: '1-based starting line number (optional, defaults to 1).',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of lines to return (optional, defaults to 400).',
        },
      },
      required: ['path'],
    },
  },
  write: {
    name: 'write',
    description: 'Create a new file or completely overwrite an existing file in the workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Relative file path inside the workspace.',
        },
        content: {
          type: Type.STRING,
          description: 'The complete file content to write.',
        },
      },
      required: ['path', 'content'],
    },
  },
  edit: {
    name: 'edit',
    description:
      'Perform a targeted string replacement in an existing file. oldText must match the file content exactly and uniquely.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Relative file path inside the workspace.',
        },
        oldText: {
          type: Type.STRING,
          description: 'Exact existing text block to replace (include surrounding lines if needed for uniqueness).',
        },
        newText: {
          type: Type.STRING,
          description: 'Replacement text block.',
        },
      },
      required: ['path', 'oldText', 'newText'],
    },
  },
  bash: {
    name: 'bash',
    description:
      'Execute a shell command inside the workspace directory (e.g. run tests, node scripts, python, git, inspect files).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: 'The bash command to execute inside the workspace root.',
        },
      },
      required: ['command'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Search for a text or regex pattern across workspace files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: {
          type: Type.STRING,
          description: 'Regex or substring pattern to search for.',
        },
        path: {
          type: Type.STRING,
          description: 'Optional relative directory or file to scope the search (defaults to ".").',
        },
      },
      required: ['pattern'],
    },
  },
  find: {
    name: 'find',
    description: 'Find files in the workspace matching a filename substring.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: {
          type: Type.STRING,
          description: 'Optional substring to match against relative file paths.',
        },
        path: {
          type: Type.STRING,
          description: 'Optional starting directory (defaults to ".").',
        },
      },
    },
  },
  ls: {
    name: 'ls',
    description: 'List files and subdirectories in a workspace directory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Relative directory path (defaults to ".").',
        },
      },
    },
  },
};

function toOpenAITools(enabledTools: ToolName[]) {
  const schemaMap: Record<ToolName, { description: string; parameters: Record<string, unknown> }> = {
    read: {
      description: TOOL_DECLARATIONS.read.description || '',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file inside workspace.' },
          offset: { type: 'integer', description: '1-based start line.' },
          limit: { type: 'integer', description: 'Max lines.' },
        },
        required: ['path'],
      },
    },
    write: {
      description: TOOL_DECLARATIONS.write.description || '',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
    edit: {
      description: TOOL_DECLARATIONS.edit.description || '',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          oldText: { type: 'string' },
          newText: { type: 'string' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
    bash: {
      description: TOOL_DECLARATIONS.bash.description || '',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
    grep: {
      description: TOOL_DECLARATIONS.grep.description || '',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
    find: {
      description: TOOL_DECLARATIONS.find.description || '',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
      },
    },
    ls: {
      description: TOOL_DECLARATIONS.ls.description || '',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
      },
    },
  };

  return enabledTools.map((name) => ({
    type: 'function',
    function: {
      name,
      description: schemaMap[name].description,
      parameters: schemaMap[name].parameters,
    },
  }));
}

function mapThinkingLevel(level: ThinkingOption): ThinkingLevel {
  if (level === 'LOW') return ThinkingLevel.LOW;
  if (level === 'MEDIUM') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.HIGH;
}

function buildSystemInstruction(enabledTools: ToolName[], customInstruction?: string): string {
  const toolList = enabledTools.length > 0 ? enabledTools.join(', ') : 'none (chat only)';
  return [
    'You are Pi, a minimal, precise, Unix-minded coding agent running inside an interactive web workspace.',
    `Available tools in this session: ${toolList}.`,
    'Guidelines:',
    '- Always inspect existing files with `read`, `ls`, `find`, or `grep` before making assumptions or edits.',
    '- Prefer targeted `edit` calls over rewriting entire files with `write` when modifying existing files.',
    '- After editing code, verify your changes using `bash` (for example running tests or executing the script) if `bash` is enabled.',
    '- Keep explanations clear, concise, and direct. Respond in the same language as the user.',
    '- If a tool is disabled in this session, clearly explain that it is restricted by the active tool allowlist rather than pretending to execute it.',
    customInstruction ? `\nUser workspace instructions:\n${customInstruction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatUserPromptWithFiles(msg: ChatMessage): string {
  let text = msg.content;
  if (msg.attachedFiles && msg.attachedFiles.length > 0) {
    const snippets: string[] = [];
    for (const filePath of msg.attachedFiles) {
      try {
        const { numbered } = readWorkspaceFile(filePath, 1, 250);
        snippets.push(`<attached_file path="${filePath}">\n${numbered}\n</attached_file>`);
      } catch {
        snippets.push(`<attached_file path="${filePath}">[File unavailable]</attached_file>`);
      }
    }
    text = `${snippets.join('\n\n')}\n\n${text}`;
  }
  return text;
}

function buildInitialContents(messages: ChatMessage[]): Content[] {
  const contents: Content[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: formatUserPromptWithFiles(msg) }] });
    } else if (msg.role === 'assistant' && msg.content.trim()) {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
  return contents;
}

async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
  signal: AbortSignal
): Promise<{ output: string; status: 'done' | 'error'; diff?: DiffLine[]; mutated: boolean }> {
  try {
    switch (name) {
      case 'read': {
        const filePath = String(args.path ?? '');
        const offset = typeof args.offset === 'number' ? args.offset : 1;
        const limit = typeof args.limit === 'number' ? args.limit : 400;
        const res = readWorkspaceFile(filePath, offset, limit);
        return {
          output: `File: ${filePath} (${res.totalLines} lines, ${res.size} bytes)\n${res.numbered}`,
          status: 'done',
          mutated: false,
        };
      }
      case 'write': {
        const filePath = String(args.path ?? '');
        const content = String(args.content ?? '');
        const res = writeWorkspaceFile(filePath, content);
        return {
          output: `Wrote ${filePath} (${res.lines} lines, ${res.bytes} bytes).`,
          status: 'done',
          mutated: true,
        };
      }
      case 'edit': {
        const filePath = String(args.path ?? '');
        const oldText = String(args.oldText ?? '');
        const newText = String(args.newText ?? '');
        const res = editWorkspaceFile(filePath, oldText, newText);
        const diffSummary = res.diff
          .map((d) => {
            if (d.type === 'add') return `+ ${d.content}`;
            if (d.type === 'remove') return `- ${d.content}`;
            return `  ${d.content}`;
          })
          .join('\n');
        return {
          output: `Edited ${filePath} (${res.linesChanged} lines changed).\n${diffSummary}`,
          status: 'done',
          diff: res.diff,
          mutated: true,
        };
      }
      case 'bash': {
        const command = String(args.command ?? '');
        const res = await runWorkspaceBash(command, signal);
        const parts: string[] = [];
        if (res.stdout) parts.push(res.stdout);
        if (res.stderr) parts.push(`[stderr]\n${res.stderr}`);
        parts.push(`[exit code: ${res.exitCode ?? 'null'} · ${res.durationMs}ms]`);
        return {
          output: parts.join('\n\n'),
          status: res.exitCode === 0 ? 'done' : 'error',
          mutated: true,
        };
      }
      case 'grep': {
        const pattern = String(args.pattern ?? '');
        const target = typeof args.path === 'string' ? args.path : '.';
        const matches = grepWorkspace(pattern, target);
        return {
          output:
            matches.length > 0
              ? matches.join('\n')
              : `No matches found for "${pattern}" in ${target}.`,
          status: 'done',
          mutated: false,
        };
      }
      case 'find': {
        const pattern = typeof args.pattern === 'string' ? args.pattern : '';
        const target = typeof args.path === 'string' ? args.path : '.';
        const files = findWorkspaceFiles(pattern, target);
        return {
          output: files.length > 0 ? files.join('\n') : 'No matching files found.',
          status: 'done',
          mutated: false,
        };
      }
      case 'ls': {
        const target = typeof args.path === 'string' ? args.path : '.';
        const entries = listWorkspaceDir(target);
        return {
          output: entries.length > 0 ? entries.join('\n') : '(empty directory)',
          status: 'done',
          mutated: false,
        };
      }
      default:
        return {
          output: `Unknown tool: ${String(name)}`,
          status: 'error',
          mutated: false,
        };
    }
  } catch (err) {
    return {
      output: err instanceof Error ? err.message : String(err),
      status: 'error',
      mutated: false,
    };
  }
}

export async function detectEnginesStatus(piCommand = 'pi'): Promise<EngineStatus> {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openaiKeyConfigured = Boolean(process.env.OPENAI_API_KEY);

  const piCheck = await new Promise<{ available: boolean; version?: string }>((resolve) => {
    try {
      const child = spawn(piCommand, ['--version'], {
        cwd: WORKSPACE_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ available: false });
      }, 1500);

      child.stdout.on('data', (d: Buffer) => {
        out += d.toString('utf8');
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ available: false });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ available: true, version: out.trim() || 'installed' });
        } else {
          resolve({ available: false });
        }
      });
    } catch {
      resolve({ available: false });
    }
  });

  return {
    piCliAvailable: piCheck.available,
    piVersion: piCheck.version,
    geminiConfigured,
    openaiKeyConfigured,
  };
}

export interface AgentRunParams {
  engine?: EngineMode;
  messages: ChatMessage[];
  model: string;
  thinkingLevel: ThinkingOption;
  maxSteps?: number;
  baseUrl?: string;
  piCommand?: string;
  piProvider?: string;
  enabledTools: ToolName[];
  customInstruction?: string;
  signal: AbortSignal;
  emit: (event: string, data: unknown) => void;
}

async function runGeminiAgentStream(params: AgentRunParams): Promise<void> {
  const {
    messages,
    model,
    thinkingLevel,
    maxSteps = 12,
    enabledTools,
    customInstruction,
    signal,
    emit,
  } = params;
  const ai = getAiClient();

  const functionDeclarations = enabledTools.map((t) => TOOL_DECLARATIONS[t]).filter(Boolean);
  const contents = buildInitialContents(messages);
  const systemInstruction = buildSystemInstruction(enabledTools, customInstruction);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const clampedSteps = Math.min(Math.max(1, maxSteps), 30);

  for (let step = 0; step < clampedSteps; step++) {
    if (signal.aborted) {
      emit('done', { aborted: true });
      return;
    }

    const stream = await ai.models.generateContentStream({
      model: model || 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: mapThinkingLevel(thinkingLevel),
        },
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
      },
    });

    const assembledParts: Part[] = [];
    const pendingCalls: Array<{ id: string; name: ToolName; args: Record<string, unknown> }> = [];

    for await (const chunk of stream) {
      if (signal.aborted) {
        emit('done', { aborted: true });
        return;
      }

      if (chunk.usageMetadata) {
        totalInputTokens = chunk.usageMetadata.promptTokenCount ?? totalInputTokens;
        totalOutputTokens += chunk.usageMetadata.candidatesTokenCount ?? 0;
      }

      const candidateParts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of candidateParts) {
        if (part.thought && part.text) {
          emit('thought_delta', { text: part.text });
        } else if (part.text) {
          emit('text_delta', { text: part.text });
        }

        if (part.functionCall) {
          const callId =
            part.functionCall.id ||
            `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          pendingCalls.push({
            id: callId,
            name: part.functionCall.name as ToolName,
            args: (part.functionCall.args as Record<string, unknown>) ?? {},
          });
          assembledParts.push({
            ...part,
            functionCall: {
              ...part.functionCall,
              id: callId,
            },
          });
        } else if (part.thoughtSignature) {
          assembledParts.push(part);
        } else if (typeof part.text === 'string') {
          const last = assembledParts[assembledParts.length - 1];
          if (
            last &&
            typeof last.text === 'string' &&
            Boolean(last.thought) === Boolean(part.thought) &&
            !last.thoughtSignature &&
            !last.functionCall
          ) {
            last.text += part.text;
          } else {
            assembledParts.push({ ...part });
          }
        } else {
          assembledParts.push(part);
        }
      }
    }

    if (assembledParts.length > 0) {
      contents.push({ role: 'model', parts: assembledParts });
    }

    if (pendingCalls.length === 0) {
      emit('turn_done', {
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
      });
      emit('done', { aborted: false });
      return;
    }

    const functionResponseParts: Part[] = [];
    let anyWorkspaceMutated = false;

    for (const call of pendingCalls) {
      if (signal.aborted) {
        emit('done', { aborted: true });
        return;
      }

      const startTime = Date.now();
      emit('tool_start', {
        id: call.id,
        name: call.name,
        args: call.args,
      });

      let toolRes: { output: string; status: 'done' | 'error'; diff?: DiffLine[]; mutated: boolean };
      if (!enabledTools.includes(call.name)) {
        toolRes = {
          output: `Tool "${call.name}" is disabled by the active session allowlist (--tools).`,
          status: 'error',
          mutated: false,
        };
      } else {
        toolRes = await executeTool(call.name, call.args, signal);
      }

      if (toolRes.mutated) {
        anyWorkspaceMutated = true;
      }

      emit('tool_end', {
        id: call.id,
        name: call.name,
        status: toolRes.status,
        result: toolRes.output,
        diff: toolRes.diff,
        durationMs: Date.now() - startTime,
      });

      functionResponseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: {
            output: toolRes.output,
            status: toolRes.status,
          },
        },
      });
    }

    if (anyWorkspaceMutated) {
      emit('workspace_changed', {});
    }

    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });
  }

  emit('turn_done', {
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
  });
  emit('done', { aborted: false });
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

async function runOpenAICompatStream(params: AgentRunParams): Promise<void> {
  const {
    messages,
    model,
    baseUrl = 'http://localhost:11434/v1',
    maxSteps = 12,
    enabledTools,
    customInstruction,
    signal,
    emit,
  } = params;

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const chatMessages: OpenAIMessage[] = [
    { role: 'system', content: buildSystemInstruction(enabledTools, customInstruction) },
  ];

  for (const m of messages) {
    if (m.role === 'user') {
      chatMessages.push({ role: 'user', content: formatUserPromptWithFiles(m) });
    } else if (m.role === 'assistant' && m.content.trim()) {
      chatMessages.push({ role: 'assistant', content: m.content });
    }
  }

  const tools = enabledTools.length > 0 ? toOpenAITools(enabledTools) : undefined;
  const clampedSteps = Math.min(Math.max(1, maxSteps), 30);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let step = 0; step < clampedSteps; step++) {
    if (signal.aborted) {
      emit('done', { aborted: true });
      return;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages: chatMessages,
        stream: true,
        ...(tools ? { tools } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const errBody = await res.text();
      throw new Error(`OpenAI-compatible endpoint error (${res.status}): ${errBody}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    const toolCallMap = new Map<
      number,
      { id: string; name: string; argumentsText: string }
    >();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payloadStr = line.slice(5).trim();
        if (payloadStr === '[DONE]') continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(payloadStr);
        } catch {
          continue;
        }

        const usage = parsed.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (usage) {
          totalInputTokens = usage.prompt_tokens ?? totalInputTokens;
          totalOutputTokens += usage.completion_tokens ?? 0;
        }

        const choices = parsed.choices as Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }> | undefined;

        const delta = choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          emit('thought_delta', { text: delta.reasoning_content });
        }
        if (delta.content) {
          assistantText += delta.content;
          emit('text_delta', { text: delta.content });
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCallMap.get(idx) ?? {
              id: tc.id || `call_${Date.now()}_${idx}`,
              name: '',
              argumentsText: '',
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.argumentsText += tc.function.arguments;
            toolCallMap.set(idx, existing);
          }
        }
      }
    }

    const calls = Array.from(toolCallMap.values()).filter((c) => c.name);
    if (calls.length === 0) {
      emit('turn_done', {
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      });
      emit('done', { aborted: false });
      return;
    }

    chatMessages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.argumentsText || '{}' },
      })),
    });

    let anyMutated = false;
    for (const c of calls) {
      if (signal.aborted) {
        emit('done', { aborted: true });
        return;
      }
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(c.argumentsText || '{}');
      } catch {
        parsedArgs = {};
      }
      const toolName = c.name as ToolName;
      const startTime = Date.now();
      emit('tool_start', { id: c.id, name: toolName, args: parsedArgs });

      const toolRes = enabledTools.includes(toolName)
        ? await executeTool(toolName, parsedArgs, signal)
        : {
            output: `Tool "${toolName}" is disabled by the active session allowlist.`,
            status: 'error' as const,
            mutated: false,
          };

      if (toolRes.mutated) anyMutated = true;

      emit('tool_end', {
        id: c.id,
        name: toolName,
        status: toolRes.status,
        result: toolRes.output,
        diff: toolRes.diff,
        durationMs: Date.now() - startTime,
      });

      chatMessages.push({
        role: 'tool',
        tool_call_id: c.id,
        content: toolRes.output,
      });
    }

    if (anyMutated) {
      emit('workspace_changed', {});
    }
  }

  emit('turn_done', {
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  });
  emit('done', { aborted: false });
}

async function runPiRpcStream(params: AgentRunParams): Promise<void> {
  const {
    messages,
    model,
    thinkingLevel,
    piCommand = 'pi',
    piProvider,
    enabledTools,
    customInstruction,
    signal,
    emit,
  } = params;

  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!latestUser) {
    emit('done', { aborted: false });
    return;
  }

  const promptText = formatUserPromptWithFiles(latestUser);
  const cliArgs = ['--mode', 'rpc'];
  if (piProvider && model) {
    cliArgs.push('--model', `${piProvider}/${model}`);
  } else if (model) {
    cliArgs.push('--model', model);
  }
  cliArgs.push('--thinking', thinkingLevel.toLowerCase());
  if (enabledTools.length > 0) {
    cliArgs.push('--tools', enabledTools.join(','));
  } else {
    cliArgs.push('--no-tools');
  }
  if (customInstruction?.trim()) {
    cliArgs.push('--append-system-prompt', customInstruction.trim());
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(piCommand, cliArgs, {
      cwd: WORKSPACE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    let streamedTextForTurn = false;
    const toolTimers = new Map<string, number>();

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const onAbort = () => {
      try {
        child.stdin.write(JSON.stringify({ type: 'abort' }) + '\n');
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGTERM');
          emit('done', { aborted: true });
          finish();
        }
      }, 300);
    };

    if (signal.aborted) {
      child.kill('SIGTERM');
      emit('done', { aborted: true });
      finish();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err) => {
      finish(
        new Error(
          `无法启动本地 pi CLI (${piCommand})：${err.message}。请确认已安装 @mariozechner/pi-coding-agent（npm i -g @mariozechner/pi-coding-agent）或切换回内置引擎。`
        )
      );
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.replace(/\r$/, '').trim();
        if (!line) continue;

        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }

        const type = String(evt.type ?? '');
        if (type === 'response' && evt.success === false) {
          emit('error', { message: String(evt.error || 'pi RPC command failed') });
        } else if (type === 'message_start') {
          streamedTextForTurn = false;
        } else if (type === 'message_update') {
          const ae = (evt.assistantMessageEvent as Record<string, unknown>) || evt;
          const aeType = String(ae.type ?? '');
          if (aeType === 'text_delta' && typeof ae.delta === 'string') {
            streamedTextForTurn = true;
            emit('text_delta', { text: ae.delta });
          } else if (aeType === 'thinking_delta' && typeof ae.delta === 'string') {
            emit('thought_delta', { text: ae.delta });
          } else if (typeof evt.delta === 'string') {
            streamedTextForTurn = true;
            emit('text_delta', { text: evt.delta });
          }
        } else if (type === 'message_end' && !streamedTextForTurn) {
          const msg = evt.message as { role?: string; content?: Array<{ type?: string; text?: string }> } | undefined;
          if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
            const fullText = msg.content
              .filter((c) => c.type === 'text' && typeof c.text === 'string')
              .map((c) => c.text)
              .join('');
            if (fullText) {
              emit('text_delta', { text: fullText });
            }
          }
        } else if (type === 'tool_execution_start') {
          const id = String(evt.toolCallId || `pi_${Date.now()}`);
          const name = String(evt.toolName || evt.tool || 'bash') as ToolName;
          toolTimers.set(id, Date.now());
          emit('tool_start', {
            id,
            name,
            args: (evt.args as Record<string, unknown>) ?? {},
          });
        } else if (type === 'tool_execution_end') {
          const id = String(evt.toolCallId || '');
          const name = String(evt.toolName || evt.tool || 'bash') as ToolName;
          const start = toolTimers.get(id);
          const isErr = Boolean(evt.isError);
          let resultText = '';
          const resObj = evt.result as { content?: Array<{ text?: string }> } | string | undefined;
          if (typeof resObj === 'string') {
            resultText = resObj;
          } else if (resObj && Array.isArray(resObj.content)) {
            resultText = resObj.content.map((c) => c.text ?? '').join('\n');
          } else if (evt.result !== undefined) {
            resultText = JSON.stringify(evt.result, null, 2);
          }

          emit('tool_end', {
            id,
            name,
            status: isErr ? 'error' : 'done',
            result: resultText,
            durationMs: start ? Date.now() - start : undefined,
          });
          if (name === 'write' || name === 'edit' || name === 'bash') {
            emit('workspace_changed', {});
          }
        } else if (type === 'agent_end' || type === 'agent_settled') {
          if (type === 'agent_settled' || evt.willRetry !== true) {
            emit('done', { aborted: signal.aborted });
            try {
              child.stdin.end();
              child.kill('SIGTERM');
            } catch {
              // ignore
            }
            finish();
          }
        }
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        if (code && code !== 0 && stderrBuf.trim()) {
          emit('error', { message: stderrBuf.trim() });
        }
        emit('done', { aborted: signal.aborted });
        finish();
      }
    });

    // Send prompt command over stdin JSONL
    child.stdin.write(
      JSON.stringify({
        id: `prompt_${Date.now()}`,
        type: 'prompt',
        message: promptText,
      }) + '\n'
    );
  });
}

export async function runAgentStream(params: AgentRunParams): Promise<void> {
  const engine = params.engine || 'gemini';
  if (engine === 'openai-compat') {
    await runOpenAICompatStream(params);
    return;
  }
  if (engine === 'pi-rpc') {
    await runPiRpcStream(params);
    return;
  }
  await runGeminiAgentStream(params);
}

export interface EngineTestParams {
  engine: EngineMode;
  model: string;
  thinkingLevel?: ThinkingOption;
  baseUrl?: string;
  piCommand?: string;
  piProvider?: string;
}

export interface EngineTestResult {
  ok: boolean;
  engine: EngineMode;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

export async function testEngineConnection(params: EngineTestParams): Promise<EngineTestResult> {
  const start = Date.now();
  const {
    engine,
    model,
    thinkingLevel = 'LOW',
    baseUrl = 'http://localhost:11434/v1',
    piCommand = 'pi',
    piProvider,
  } = params;

  try {
    if (engine === 'gemini') {
      const ai = getAiClient();
      const targetModel = model || 'gemini-4-hydrogen';
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: 'Reply with OK only.',
        config: {
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(thinkingLevel),
          },
        },
      });
      return {
        ok: true,
        engine,
        model: targetModel,
        latencyMs: Date.now() - start,
        reply: (response.text ?? '').trim() || 'OK',
      };
    }

    if (engine === 'openai-compat') {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const endpoint = cleanBase.endsWith('/chat/completions')
        ? cleanBase
        : `${cleanBase}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.OPENAI_API_KEY) {
        headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Reply with OK only.' }],
            max_tokens: 24,
            stream: false,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const reply = data.choices?.[0]?.message?.content?.trim() || 'OK';
        return {
          ok: true,
          engine,
          model,
          latencyMs: Date.now() - start,
          reply,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    // pi-rpc test
    const reply = await new Promise<string>((resolve, reject) => {
      const cliArgs = ['--mode', 'rpc', '--no-tools', '--thinking', thinkingLevel.toLowerCase()];
      if (piProvider && model) {
        cliArgs.push('--model', `${piProvider}/${model}`);
      } else if (model) {
        cliArgs.push('--model', model);
      }

      const child = spawn(piCommand, cliArgs, {
        cwd: WORKSPACE_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdoutBuf = '';
      let stderrBuf = '';
      let collected = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error('Pi RPC 测试超时 (15s)'));
        }
      }, 15000);

      const doneOk = (text: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          child.stdin.end();
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
        resolve(text || 'OK');
      };

      const doneErr = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      child.on('error', (err) => {
        doneErr(new Error(`无法启动 "${piCommand}"：${err.message}`));
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.replace(/\r$/, '').trim();
          if (!line) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          const type = String(evt.type ?? '');
          if (type === 'response' && evt.success === false) {
            doneErr(new Error(String(evt.error || 'Pi RPC 返回失败')));
            return;
          }
          if (type === 'message_update') {
            const ae = (evt.assistantMessageEvent as Record<string, unknown>) || evt;
            if (ae.type === 'text_delta' && typeof ae.delta === 'string') {
              collected += ae.delta;
            }
          } else if (type === 'agent_settled' || (type === 'agent_end' && evt.willRetry === false)) {
            doneOk(collected.trim());
            return;
          }
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          if (code && code !== 0) {
            doneErr(new Error(stderrBuf.trim() || `Pi 进程退出码: ${code}`));
          } else {
            doneOk(collected.trim());
          }
        }
      });

      child.stdin.write(
        JSON.stringify({
          id: `test_${Date.now()}`,
          type: 'prompt',
          message: 'Reply with OK only.',
        }) + '\n'
      );
    });

    return {
      ok: true,
      engine,
      model,
      latencyMs: Date.now() - start,
      reply,
    };
  } catch (err) {
    return {
      ok: false,
      engine,
      model,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

