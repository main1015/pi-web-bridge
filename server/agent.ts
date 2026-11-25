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
  ModelOption,
  ThinkingOption,
  ToolName,
} from '../src/types/pi.ts';
import {
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

function buildInitialContents(messages: ChatMessage[]): Content[] {
  const contents: Content[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
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
      contents.push({ role: 'user', parts: [{ text }] });
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

export interface AgentRunParams {
  messages: ChatMessage[];
  model: ModelOption;
  thinkingLevel: ThinkingOption;
  enabledTools: ToolName[];
  customInstruction?: string;
  signal: AbortSignal;
  emit: (event: string, data: unknown) => void;
}

export async function runAgentStream(params: AgentRunParams): Promise<void> {
  const { messages, model, thinkingLevel, enabledTools, customInstruction, signal, emit } = params;
  const ai = getAiClient();

  const functionDeclarations = enabledTools
    .map((t) => TOOL_DECLARATIONS[t])
    .filter(Boolean);

  const contents = buildInitialContents(messages);
  const systemInstruction = buildSystemInstruction(enabledTools, customInstruction);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const MAX_STEPS = 12;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) {
      emit('done', { aborted: true });
      return;
    }

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: mapThinkingLevel(thinkingLevel),
        },
        ...(functionDeclarations.length > 0
          ? { tools: [{ functionDeclarations }] }
          : {}),
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
        // Stream thought vs text deltas to client
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
          // Ensure id is preserved on the part
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

    // Execute requested tools sequentially and stream progress live
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
