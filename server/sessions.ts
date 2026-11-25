import fs from 'node:fs';
import path from 'node:path';
import type { SessionRecord, SessionSummary } from '../src/types/pi.ts';

const SESSIONS_FILE = path.resolve(process.cwd(), 'pi-sessions.json');

function readAllSessions(): SessionRecord[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllSessions(sessions: SessionRecord[]): void {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

export function listSessions(): SessionSummary[] {
  return readAllSessions()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      model: s.model,
    }));
}

export function getSession(id: string): SessionRecord | undefined {
  return readAllSessions().find((s) => s.id === id);
}

export function saveSession(session: SessionRecord): SessionRecord {
  const sessions = readAllSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  writeAllSessions(sessions.slice(0, 50));
  return session;
}

export function deleteSession(id: string): boolean {
  const sessions = readAllSessions();
  const next = sessions.filter((s) => s.id !== id);
  if (next.length === sessions.length) return false;
  writeAllSessions(next);
  return true;
}
