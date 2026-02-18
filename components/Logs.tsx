
import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry } from '../services/logger';
import { db } from '../services/db';
import { Company } from '../types';
import {
  ScrollText, Trash2, AlertTriangle, Info, AlertCircle, ArrowLeft, Clock, Filter,
  Lock, CloudUpload, CloudDownload, CheckCircle, Database, RefreshCw
} from 'lucide-react';

const STORAGE_KEY_PASSWORD = 'stablemap_logs_password';
const LS_COMPANIES_KEY = 'stablemap_companies';

interface LogsProps {
  onBack: () => void;
  companies: Company[];
  onRefreshFromFirestore: (companies: Company[]) => void;
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

const Logs: React.FC<LogsProps> = ({ onBack, companies, onRefreshFromFirestore }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const [entries, setEntries] = useState<LogEntry[]>(logger.getEntries());
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Data sync state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [pullStatus, setPullStatus] = useState<'idle' | 'pulling' | 'done' | 'error'>('idle');
  const [pullMessage, setPullMessage] = useState('');
  const [firestoreCount, setFirestoreCount] = useState<number | null>(null);
  const [firestoreLoading, setFirestoreLoading] = useState(false);

  const fetchFirestoreCount = async () => {
    setFirestoreLoading(true);
    try {
      const result = await db.getFirestoreCompanyCount();
      setFirestoreCount(result ? result.count : null);
    } catch {
      setFirestoreCount(null);
    } finally {
      setFirestoreLoading(false);
    }
  };

  const handlePullFromFirestore = async () => {
    setPullStatus('pulling');
    setPullMessage('');
    try {
      const result = await db.getFirestoreCompanyCount();
      if (!result || result.count === 0) { setPullStatus('error'); setPullMessage('Firestore returned 0 companies.'); return; }
      localStorage.setItem(LS_COMPANIES_KEY, JSON.stringify(result.companies));
      onRefreshFromFirestore(result.companies);
      setFirestoreCount(result.count);
      setPullStatus('done');
      setPullMessage(`${result.count} companies pulled from Firestore → localStorage & app.`);
    } catch (e: any) {
      setPullStatus('error');
      setPullMessage(e?.message || 'Pull failed.');
    }
  };

  const lsCount = (() => {
    try {
      const raw = localStorage.getItem(LS_COMPANIES_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch { return 0; }
  })();

  const handleForceSync = async () => {
    setSyncStatus('syncing');
    setSyncMessage('');
    try {
      const raw = localStorage.getItem(LS_COMPANIES_KEY);
      if (!raw) { setSyncStatus('error'); setSyncMessage('No data found in localStorage.'); return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) { setSyncStatus('error'); setSyncMessage('localStorage is empty.'); return; }
      await db.saveCompanies(parsed);
      setSyncStatus('done');
      setSyncMessage(`${parsed.length} companies pushed to Firestore.`);
    } catch (e: any) {
      setSyncStatus('error');
      setSyncMessage(e?.message || 'Sync failed.');
    }
  };

  useEffect(() => {
    const storedPassword = localStorage.getItem(STORAGE_KEY_PASSWORD);
    if (!storedPassword) setIsFirstTime(true);
  }, []);

  useEffect(() => {
    const unsub = logger.subscribe(() => setEntries([...logger.getEntries()]));
    return unsub;
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = 0;
  }, [entries.length, autoScroll]);

  useEffect(() => { fetchFirestoreCount(); }, []);

  const handleSetPassword = () => {
    if (passwordInput.length < 4) { setPasswordError('Password must be at least 4 characters'); return; }
    if (passwordInput !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    localStorage.setItem(STORAGE_KEY_PASSWORD, passwordInput);
    setIsAuthenticated(true);
    setPasswordError('');
  };

  const handleLogin = () => {
    const storedPassword = localStorage.getItem(STORAGE_KEY_PASSWORD);
    if (passwordInput === storedPassword) { setIsAuthenticated(true); setPasswordError(''); }
    else setPasswordError('Incorrect password');
  };

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

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
              <Lock size={32} className="text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{isFirstTime ? 'Set Up Access' : 'System Logs'}</h1>
            <p className="text-slate-500 text-sm mt-1 text-center">
              {isFirstTime ? 'Create a password to protect the System Logs page' : 'Enter your password to access System Logs'}
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Password</label>
              <input type="password" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                onKeyDown={e => e.key === 'Enter' && (isFirstTime ? handleSetPassword() : handleLogin())}
                placeholder={isFirstTime ? 'Choose a password' : 'Enter password'}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" autoFocus />
            </div>
            {isFirstTime && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSetPassword()} placeholder="Confirm your password"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" />
              </div>
            )}
            {passwordError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={14} /> {passwordError}
              </div>
            )}
            <button onClick={isFirstTime ? handleSetPassword : handleLogin}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm">
              {isFirstTime ? 'Create Password & Enter' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3"><ScrollText size={24} className="text-indigo-600" /> System Logs</h1>
          <p className="text-slate-500 text-sm mt-1">API requests, errors, and diagnostics</p>
        </div>
        <button onClick={() => { logger.clear(); setEntries([]); }}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
          <Trash2 size={14} /> Clear Logs
        </button>
      </div>

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

      {/* Firestore Sync Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Database size={13} /> Firestore Data Sync
        </h2>

        {/* Counts row */}
        <div className="flex flex-wrap items-center gap-6 mb-4">
          <div>
            <p className="text-2xl font-black text-slate-900">{lsCount}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">localStorage</p>
          </div>
          <div>
            <p className="text-2xl font-black text-orange-600">
              {firestoreLoading ? <span className="animate-pulse">...</span> : firestoreCount ?? '—'}
            </p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              Firestore
              <button onClick={fetchFirestoreCount} disabled={firestoreLoading}
                className="text-slate-400 hover:text-indigo-600 transition-colors" title="Refresh Firestore count">
                <RefreshCw size={10} className={firestoreLoading ? 'animate-spin' : ''} />
              </button>
            </p>
          </div>
          <div>
            <p className="text-2xl font-black text-indigo-600">{companies.length}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Loaded in app</p>
          </div>

          {/* Status badges */}
          {firestoreCount !== null && lsCount !== firestoreCount && (
            <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] font-bold text-amber-700">Out of sync ({Math.abs(lsCount - firestoreCount)} difference)</p>
            </div>
          )}
          {firestoreCount !== null && lsCount === firestoreCount && lsCount > 0 && (
            <div className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-[10px] font-bold text-emerald-700">In sync</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {/* Push: localStorage → Firestore */}
          <button
            onClick={handleForceSync}
            disabled={syncStatus === 'syncing' || lsCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {syncStatus === 'syncing'
              ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Pushing...</>
              : syncStatus === 'done'
              ? <><CheckCircle size={13} /> Pushed</>
              : <><CloudUpload size={13} /> Push localStorage → Firestore</>}
          </button>

          {/* Pull: Firestore → localStorage */}
          <button
            onClick={handlePullFromFirestore}
            disabled={pullStatus === 'pulling'}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {pullStatus === 'pulling'
              ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Pulling...</>
              : pullStatus === 'done'
              ? <><CheckCircle size={13} /> Pulled</>
              : <><CloudDownload size={13} /> Pull Firestore → localStorage</>}
          </button>
        </div>

        {/* Status messages */}
        <div className="space-y-1">
          {syncMessage && (
            <p className={`text-xs font-medium ${syncStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
              {syncMessage}
            </p>
          )}
          {pullMessage && (
            <p className={`text-xs font-medium ${pullStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
              {pullMessage}
            </p>
          )}
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          <strong>Push</strong> sends localStorage data to Firestore.
          <strong> Pull</strong> fetches Firestore data into localStorage & reloads the app.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white rounded-xl border border-slate-200 p-3">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
          {(['all', 'info', 'warn', 'error'] as const).map(level => (
            <button key={level} onClick={() => setLevelFilter(level)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                levelFilter === level
                  ? level === 'error' ? 'bg-red-600 text-white' : level === 'warn' ? 'bg-amber-500 text-white' : level === 'info' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>{level}</button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex gap-1">
          {['all', 'api', 'news', 'claude', 'db'].map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                categoryFilter === cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>{cat}</button>
          ))}
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" /> Auto-scroll
        </label>
      </div>

      <div ref={listRef} className="space-y-2 max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ScrollText className="mx-auto mb-3 opacity-40" size={40} />
            <p className="font-bold">No log entries yet</p>
            <p className="text-sm mt-1">Logs will appear here as you use the app.</p>
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
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${catColor}`}>{entry.category}</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${config.text}`}>{entry.level}</span>
                      {entry.durationMs !== undefined && (
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1"><Clock size={9} /> {entry.durationMs}ms</span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 ml-auto">{formatTime(entry.timestamp)}</span>
                    </div>
                    <div className={`font-semibold ${config.text}`}>{entry.message}</div>
                    {entry.detail && (
                      <pre className="mt-1 text-xs text-slate-600 bg-white/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all border border-slate-100 max-h-32 overflow-y-auto">{entry.detail}</pre>
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
