
import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry } from '../services/logger';
import { ScrollText, Trash2, AlertTriangle, Info, AlertCircle, ArrowLeft, Clock, Filter } from 'lucide-react';

interface LogsProps {
  onBack: () => void;
}

const LEVEL_CONFIG = {
  info:  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   icon: Info },
  warn:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  icon: AlertTriangle },
  error: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    icon: AlertCircle },
};

const CATEGORY_COLORS: Record<string, string> = {
  api:     'bg-violet-100 text-violet-700 border-violet-200',
  news:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  claude:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  db:      'bg-orange-100 text-orange-700 border-orange-200',
  general: 'bg-slate-100 text-slate-600 border-slate-200',
};

const Logs: React.FC<LogsProps> = ({ onBack }) => {
  const [entries, setEntries] = useState<LogEntry[]>(logger.getEntries());
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = logger.subscribe(() => {
      setEntries([...logger.getEntries()]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [entries.length, autoScroll]);

  const filtered = entries.filter(e => {
    if (levelFilter !== 'all' && e.level !== levelFilter) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    return true;
  });

  const errorCount = entries.filter(e => e.level === 'error').length;
  const warnCount = entries.filter(e => e.level === 'warn').length;
  const apiCount = entries.filter(e => e.category === 'api').length;

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ScrollText size={24} className="text-indigo-600" />
            System Logs
          </h1>
          <p className="text-slate-500 text-sm mt-1">API requests, errors, and diagnostics</p>
        </div>
        <button
          onClick={() => { logger.clear(); setEntries([]); }}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Trash2 size={14} /> Clear Logs
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-black text-slate-900">{entries.length}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Entries</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-black text-violet-600">{apiCount}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">API Calls</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-black text-amber-600">{warnCount}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warnings</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-black text-red-600">{errorCount}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Errors</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white rounded-xl border border-slate-200 p-3">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
          {(['all', 'info', 'warn', 'error'] as const).map(level => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                levelFilter === level
                  ? level === 'error' ? 'bg-red-600 text-white' : level === 'warn' ? 'bg-amber-500 text-white' : level === 'info' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex gap-1">
          {['all', 'api', 'news', 'claude', 'db'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
          Auto-scroll
        </label>
      </div>

      {/* Log entries */}
      <div ref={listRef} className="space-y-2 max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ScrollText className="mx-auto mb-3 opacity-40" size={40} />
            <p className="font-bold">No log entries yet</p>
            <p className="text-sm mt-1">Logs will appear here as you use the app. Try clicking "Check All Activity" on the Intelligence page.</p>
          </div>
        ) : (
          filtered.map(entry => {
            const config = LEVEL_CONFIG[entry.level];
            const Icon = config.icon;
            const catColor = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.general;
            return (
              <div key={entry.id} className={`${config.bg} border ${config.border} rounded-lg p-3 text-sm`}>
                <div className="flex items-start gap-2">
                  <Icon size={14} className={`${config.text} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${catColor}`}>
                        {entry.category}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${config.text}`}>
                        {entry.level}
                      </span>
                      {entry.durationMs !== undefined && (
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock size={9} /> {entry.durationMs}ms
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 ml-auto">{formatTime(entry.timestamp)}</span>
                    </div>
                    <div className={`font-semibold ${config.text}`}>{entry.message}</div>
                    {entry.detail && (
                      <pre className="mt-1 text-xs text-slate-600 bg-white/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all border border-slate-100 max-h-32 overflow-y-auto">
                        {entry.detail}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Logs;
