import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DiffLine, WorkspaceFileNode, WorkspaceTemplate } from '../src/types/pi.ts';

export let WORKSPACE_ROOT = path.resolve(
  process.cwd(),
  process.env.PI_WORKSPACE || 'pi-workspace'
);

export function setWorkspaceRoot(dir: string): void {
  WORKSPACE_ROOT = path.resolve(dir);
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.pi', 'dist', '.next', '__pycache__', '.venv']);

export function resolveSafePath(relPath: string): string {
  const cleaned = (relPath || '.').replace(/^\/+/, '');
  const resolved = path.resolve(WORKSPACE_ROOT, cleaned || '.');
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Access denied: path "${relPath}" escapes workspace root.`);
  }
  return resolved;
}

export function ensureWorkspaceSeeded(
  template: WorkspaceTemplate = 'node-ts',
  forceReset = false,
  skipDefaultSeed = false
): void {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }

  const entries = fs.readdirSync(WORKSPACE_ROOT);
  if ((entries.length > 0 && !forceReset) || (skipDefaultSeed && !forceReset)) {
    return;
  }

  if (forceReset) {
    for (const entry of entries) {
      fs.rmSync(path.join(WORKSPACE_ROOT, entry), { recursive: true, force: true });
    }
  }

  if (template === 'empty') {
    fs.writeFileSync(
      path.join(WORKSPACE_ROOT, 'README.md'),
      '# Workspace\n\nEmpty workspace ready for Pi.\n',
      'utf8'
    );
    return;
  }

  if (template === 'python') {
    fs.mkdirSync(path.join(WORKSPACE_ROOT, 'src'), { recursive: true });
    fs.mkdirSync(path.join(WORKSPACE_ROOT, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(WORKSPACE_ROOT, 'README.md'),
      `# Python Task Lab\n\nRun tests with:\n\`\`\`bash\npython3 -m unittest discover -s tests\n\`\`\`\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(WORKSPACE_ROOT, 'src/calculator.py'),
      `def add(a: float, b: float) -> float:\n    return a + b\n\ndef divide(a: float, b: float) -> float:\n    if b == 0:\n        raise ValueError("Cannot divide by zero")\n    return a / b\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(WORKSPACE_ROOT, 'tests/test_calculator.py'),
      `import unittest\nfrom src.calculator import add, divide\n\nclass TestCalculator(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n    def test_divide(self):\n        self.assertEqual(divide(10, 2), 5)\n\nif __name__ == "__main__":\n    unittest.main()\n`,
      'utf8'
    );
    return;
  }

  // Default: node-ts starter project
  fs.mkdirSync(path.join(WORKSPACE_ROOT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_ROOT, 'tests'), { recursive: true });

  fs.writeFileSync(
    path.join(WORKSPACE_ROOT, 'README.md'),
    `# Pi Starter Workspace

A minimal TypeScript / Node.js project inside your interactive Pi Web sandbox.

## Quick Commands
- \`node --test tests/math.test.mjs\` — Run unit tests
- \`node src/index.mjs\` — Run the CLI entrypoint
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(WORKSPACE_ROOT, 'package.json'),
    JSON.stringify(
      {
        name: 'pi-sandbox-project',
        version: '1.0.0',
        type: 'module',
        scripts: {
          start: 'node src/index.mjs',
          test: 'node --test tests/math.test.mjs',
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(WORKSPACE_ROOT, 'src/math.mjs'),
    `/**
 * Basic arithmetic utilities for the Pi sandbox.
 */
export function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

export function average(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  return sum(numbers) / numbers.length;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(WORKSPACE_ROOT, 'src/index.mjs'),
    `import { sum, average, clamp } from './math.mjs';

const sample = [12, 18, 25, 31, 14];
console.log('Sample:', sample);
console.log('Sum:', sum(sample));
console.log('Average:', average(sample));
console.log('Clamped(120, 0, 100):', clamp(120, 0, 100));
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(WORKSPACE_ROOT, 'tests/math.test.mjs'),
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { sum, average, clamp } from '../src/math.mjs';

test('sum calculates total', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
});

test('average handles empty and populated arrays', () => {
  assert.equal(average([]), 0);
  assert.equal(average([10, 20]), 15);
});

test('clamp restricts bounds', () => {
  assert.equal(clamp(50, 0, 100), 50);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(150, 0, 100), 100);
});
`,
    'utf8'
  );
}

export function buildWorkspaceTree(dir = WORKSPACE_ROOT, baseRel = ''): WorkspaceFileNode[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: WorkspaceFileNode[] = [];
  for (const entry of sorted) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: buildWorkspaceTree(fullPath, relPath),
      });
    } else {
      const stat = fs.statSync(fullPath);
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        size: stat.size,
      });
    }
  }
  return nodes;
}

export function flattenWorkspaceFiles(nodes: WorkspaceFileNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push(node.path);
    } else if (node.children) {
      result.push(...flattenWorkspaceFiles(node.children));
    }
  }
  return result;
}

export function readWorkspaceFile(relPath: string, offset = 1, limit = 400): {
  content: string;
  numbered: string;
  totalLines: number;
  size: number;
} {
  const fullPath = resolveSafePath(relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${relPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  const lines = raw.split('\n');
  const startIdx = Math.max(0, offset - 1);
  const endIdx = Math.min(lines.length, startIdx + Math.max(1, limit));
  const slice = lines.slice(startIdx, endIdx);
  const numbered = slice
    .map((line, i) => `${String(startIdx + i + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');

  return {
    content: raw,
    numbered,
    totalLines: lines.length,
    size: stat.size,
  };
}

export function writeWorkspaceFile(relPath: string, content: string): { bytes: number; lines: number } {
  const fullPath = resolveSafePath(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return {
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.split('\n').length,
  };
}

export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: DiffLine[] = [];

  // Find first & last differing lines for clean compact hunk output
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const contextStart = Math.max(0, prefix - 3);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const contextAfterEnd = Math.min(newLines.length, newEnd + 3);

  for (let i = contextStart; i < prefix; i++) {
    diff.push({
      type: 'context',
      lineNumberOld: i + 1,
      lineNumberNew: i + 1,
      content: oldLines[i],
    });
  }
  for (let i = prefix; i < oldEnd; i++) {
    diff.push({
      type: 'remove',
      lineNumberOld: i + 1,
      content: oldLines[i],
    });
  }
  for (let i = prefix; i < newEnd; i++) {
    diff.push({
      type: 'add',
      lineNumberNew: i + 1,
      content: newLines[i],
    });
  }
  for (let i = newEnd; i < contextAfterEnd; i++) {
    const oldIdx = oldEnd + (i - newEnd);
    diff.push({
      type: 'context',
      lineNumberOld: oldIdx + 1,
      lineNumberNew: i + 1,
      content: newLines[i],
    });
  }

  return diff;
}

export function editWorkspaceFile(
  relPath: string,
  oldText: string,
  newText: string
): { diff: DiffLine[]; linesChanged: number } {
  const fullPath = resolveSafePath(relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  const current = fs.readFileSync(fullPath, 'utf8');
  if (!oldText) {
    throw new Error('oldText must not be empty.');
  }

  const firstIdx = current.indexOf(oldText);
  if (firstIdx === -1) {
    throw new Error(
      `Could not find exact oldText in ${relPath}. Make sure whitespace and indentation match.`
    );
  }
  const secondIdx = current.indexOf(oldText, firstIdx + 1);
  if (secondIdx !== -1) {
    throw new Error(
      `oldText matched multiple locations in ${relPath}. Include more surrounding lines so the match is unique.`
    );
  }

  const updated = current.slice(0, firstIdx) + newText + current.slice(firstIdx + oldText.length);
  fs.writeFileSync(fullPath, updated, 'utf8');
  const diff = computeDiff(current, updated);
  return {
    diff,
    linesChanged: diff.filter((d) => d.type !== 'context').length,
  };
}

export function grepWorkspace(pattern: string, targetPath = '.'): string[] {
  const fullTarget = resolveSafePath(targetPath);
  if (!fs.existsSync(fullTarget)) {
    throw new Error(`Path not found: ${targetPath}`);
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const matches: string[] = [];
  const walk = (currentPath: string) => {
    if (matches.length >= 120) return;
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      const name = path.basename(currentPath);
      if (IGNORED_DIRS.has(name)) return;
      for (const entry of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, entry));
      }
      return;
    }
    if (stat.size > 512_000) return;
    const rel = path.relative(WORKSPACE_ROOT, currentPath);
    const content = fs.readFileSync(currentPath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(`${rel}:${i + 1}: ${lines[i].trimEnd()}`);
        if (matches.length >= 120) break;
      }
    }
  };

  walk(fullTarget);
  return matches;
}

export function findWorkspaceFiles(pattern = '', targetPath = '.'): string[] {
  const fullTarget = resolveSafePath(targetPath);
  if (!fs.existsSync(fullTarget)) {
    throw new Error(`Path not found: ${targetPath}`);
  }
  const needle = pattern.trim().toLowerCase();
  const found: string[] = [];

  const walk = (currentPath: string) => {
    if (found.length >= 200) return;
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      const name = path.basename(currentPath);
      if (IGNORED_DIRS.has(name)) return;
      for (const entry of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, entry));
      }
      return;
    }
    const rel = path.relative(WORKSPACE_ROOT, currentPath);
    if (!needle || rel.toLowerCase().includes(needle)) {
      found.push(rel);
    }
  };

  walk(fullTarget);
  return found.sort();
}

export function listWorkspaceDir(targetPath = '.'): string[] {
  const fullTarget = resolveSafePath(targetPath);
  if (!fs.existsSync(fullTarget)) {
    throw new Error(`Directory not found: ${targetPath}`);
  }
  const stat = fs.statSync(fullTarget);
  if (!stat.isDirectory()) {
    return [`${targetPath} (${stat.size} bytes)`];
  }
  const entries = fs.readdirSync(fullTarget, { withFileTypes: true });
  return entries
    .filter((e) => !IGNORED_DIRS.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((entry) => {
      if (entry.isDirectory()) return `${entry.name}/`;
      const s = fs.statSync(path.join(fullTarget, entry.name));
      return `${entry.name} (${s.size} B)`;
    });
}

export function runWorkspaceBash(
  command: string,
  signal?: AbortSignal,
  timeoutMs = 15000
): Promise<{ stdout: string; stderr: string; exitCode: number | null; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('bash', ['-lc', command], {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const MAX_BYTES = 48_000;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode,
        durationMs: Date.now() - start,
      });
    };

    const onAbort = () => {
      child.kill('SIGTERM');
      stderr += '\n[Process aborted by user]';
      finish(130);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += `\n[Command timed out after ${timeoutMs}ms]`;
      finish(124);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_BYTES) {
        stdout += chunk.toString('utf8').slice(0, MAX_BYTES - stdout.length);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_BYTES) {
        stderr += chunk.toString('utf8').slice(0, MAX_BYTES - stderr.length);
      }
    });

    child.on('error', (err) => {
      stderr += `\n${err.message}`;
      finish(1);
    });

    child.on('close', (code) => {
      finish(code);
    });
  });
}
