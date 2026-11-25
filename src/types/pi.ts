export type ToolName = 'read' | 'write' | 'edit' | 'bash' | 'grep' | 'find' | 'ls';

export type ThinkingOption = 'LOW' | 'MEDIUM' | 'HIGH';

export type EngineMode = 'gemini' | 'openai-compat' | 'pi-rpc';

export type ModelOption = string;

export interface ModelSettings {
  engine: EngineMode;
  model: string;
  thinkingLevel: ThinkingOption;
  maxSteps: number;
  baseUrl: string;
  piCommand: string;
  piProvider: string;
}

export interface EngineStatus {
  piCliAvailable: boolean;
  piVersion?: string;
  geminiConfigured: boolean;
  openaiKeyConfigured: boolean;
}

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
  model?: string;
  engine?: EngineMode;
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
  engine?: EngineMode;
  model: string;
  thinkingLevel: ThinkingOption;
  maxSteps?: number;
  baseUrl?: string;
  piCommand?: string;
  piProvider?: string;
  enabledTools: ToolName[];
  messages: ChatMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  model: string;
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
