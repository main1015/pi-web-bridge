export type ToolName = 'read' | 'write' | 'edit' | 'bash' | 'grep' | 'find' | 'ls';

export type ThinkingOption = 'LOW' | 'MEDIUM' | 'HIGH';

export type ModelOption = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  lineNumberOld?: number;
  lineNumberNew?: number;
  content: string;
}

export interface ToolCallEvent {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  result?: string;
  diff?: DiffLine[];
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
  attachedFiles?: string[];
  timestamp: number;
  model?: ModelOption;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  aborted?: boolean;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: ModelOption;
  thinkingLevel: ThinkingOption;
  enabledTools: ToolName[];
  messages: ChatMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  model: ModelOption;
}

export interface WorkspaceFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: WorkspaceFileNode[];
}

export interface ShellHistoryEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timestamp: number;
}

export type WorkspaceTemplate = 'node-ts' | 'python' | 'empty';
