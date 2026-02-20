export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: 'api' | 'news' | 'claude' | 'ai' | 'db' | 'general';
  message: string;
  detail?: string;
  durationMs?: number;
}

const MAX_ENTRIES = 500;

class Logger {
  private entries: LogEntry[] = [];
  private listeners: Set<() => void> = new Set();

  private add(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
    const logEntry: LogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.entries.unshift(logEntry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    this.listeners.forEach(fn => fn());
    // Also mirror to browser console
    const prefix = `[${entry.category.toUpperCase()}]`;
    if (entry.level === 'error') console.error(prefix, entry.message, entry.detail || '');
    else if (entry.level === 'warn') console.warn(prefix, entry.message, entry.detail || '');
    else console.log(prefix, entry.message, entry.detail || '');
  }

  info(category: LogEntry['category'], message: string, detail?: string) {
    this.add({ level: 'info', category, message, detail });
  }

  warn(category: LogEntry['category'], message: string, detail?: string) {
    this.add({ level: 'warn', category, message, detail });
  }

  error(category: LogEntry['category'], message: string, detail?: string) {
    this.add({ level: 'error', category, message, detail });
  }

  api(method: string, url: string, status: number, durationMs: number, detail?: string) {
    const level: LogEntry['level'] = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    this.add({ level, category: 'api', message: `${method} ${url} → ${status}`, detail, durationMs });
  }

  getEntries(): LogEntry[] {
    return this.entries;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear() {
    this.entries = [];
    this.listeners.forEach(fn => fn());
  }
}

export const logger = new Logger();
