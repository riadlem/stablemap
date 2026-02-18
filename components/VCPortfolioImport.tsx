import React, { useState, useRef, useMemo } from 'react';
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, Check, Plus, X, Link, Building2 } from 'lucide-react';
import { Company } from '../types';

interface VCPortfolioImportProps {
  companies: Company[];
  onAddCompanyWithInvestor: (companyName: string, investorName: string) => Promise<void>;
  onBack: () => void;
}

interface ParsedCompany {
  name: string;
  url: string;
}

const VCPortfolioImport: React.FC<VCPortfolioImportProps> = ({ companies, onAddCompanyWithInvestor, onBack }) => {
  const [vcName, setVcName] = useState('');
  const [vcUrl, setVcUrl] = useState('');
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompany[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingCompanies, setAddingCompanies] = useState<Set<string>>(new Set());
  const [addedCompanies, setAddedCompanies] = useState<Set<string>>(new Set());
  const [isAddingAll, setIsAddingAll] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const existingCompanyNames = useMemo(() => companies.map(c => c.name), [companies]);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return;

    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const nameCol = header.findIndex(h => /^(name|company|startup|portfolio.?company)$/i.test(h));
    const urlCol = header.findIndex(h => /^(url|website|domain|link)$/i.test(h));

    if (nameCol === -1 && urlCol === -1) {
      alert('CSV must have a "name" or "url" column header.');
      return;
    }

    const rows: ParsedCompany[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || lines[i].split(',').map(c => c.trim());
      const name = nameCol >= 0 ? (cols[nameCol] || '') : '';
      let url = urlCol >= 0 ? (cols[urlCol] || '') : '';
      if (url && !url.startsWith('http')) url = `https://${url}`;
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        rows.push({ name, url });
      }
    }

    if (rows.length === 0) return;

    setParsedCompanies(rows);
    setSelected(new Set(rows.map(r => r.name)));
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (!parsedCompanies) return;
    const eligible = parsedCompanies.map(c => c.name).filter(n => !existingCompanyNames.some(e => e.toLowerCase() === n.toLowerCase()));
    const allSelected = eligible.every(n => selected.has(n));
    setSelected(allSelected ? new Set() : new Set(eligible));
  };

  const selectedCount = useMemo(() => {
    if (!parsedCompanies) return 0;
    return Array.from(selected).filter((name: string) =>
      !existingCompanyNames.some(e => e.toLowerCase() === name.toLowerCase())
    ).length;
  }, [selected, existingCompanyNames, parsedCompanies]);

  const handleAddSelected = async () => {
    if (!vcName.trim()) return;
    setIsAddingAll(true);
    const toAdd = Array.from(selected).filter((name: string) =>
      !existingCompanyNames.some(e => e.toLowerCase() === name.toLowerCase()) && !addedCompanies.has(name)
    );

    for (const companyName of toAdd) {
      setAddingCompanies(prev => new Set(prev).add(companyName));
      try {
        await onAddCompanyWithInvestor(companyName, vcName.trim());
        setAddedCompanies(prev => new Set(prev).add(companyName));
      } finally {
        setAddingCompanies(prev => {
          const next = new Set(prev);
          next.delete(companyName);
          return next;
        });
      }
    }
    setIsAddingAll(false);
  };

  const dismissResults = () => {
    setParsedCompanies(null);
    setSelected(new Set());
    setAddedCompanies(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Investors
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet size={24} className="text-indigo-600" />
          Import VC Portfolio from CSV
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Enter the VC/investor details, then upload a CSV of their portfolio companies
        </p>
      </div>

      {/* VC Details */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
          <Building2 size={16} className="text-indigo-600" /> VC / Investor Details
        </h3>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">
              Investor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Paradigm, 50 Partners, Arche Capital..."
              value={vcName}
              onChange={e => setVcName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1">
              <Link size={12} /> Website URL <span className="text-indigo-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. https://paradigm.xyz"
              value={vcUrl}
              onChange={e => setVcUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white/70 placeholder-indigo-300"
            />
          </div>
        </div>
      </div>

      {/* CSV Upload */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Upload size={16} className="text-indigo-600" /> Upload Portfolio Companies CSV
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              CSV with column: <code className="bg-slate-100 px-1 rounded">name</code> (company name). Optional: <code className="bg-slate-100 px-1 rounded">url</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={!vcName.trim()}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              title={!vcName.trim() ? 'Enter the VC name first' : ''}
            >
              <Upload size={14} />
              Upload CSV
            </button>
          </div>
        </div>
        {!vcName.trim() && (
          <p className="mt-2 text-xs text-amber-600 font-medium">
            Please enter the investor name above before uploading
          </p>
        )}

        {/* Parsed results with checkboxes */}
        {parsedCompanies !== null && parsedCompanies.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">
                {parsedCompanies.length} portfolio {parsedCompanies.length === 1 ? 'company' : 'companies'} found for {vcName}
              </p>
              <button onClick={dismissResults} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parsedCompanies
                      .map(c => c.name)
                      .filter(n => !existingCompanyNames.some(e => e.toLowerCase() === n.toLowerCase()))
                      .every(n => selected.has(n))}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select All
                  </span>
                </label>
                <span className="text-[10px] text-slate-400">
                  {selectedCount} selected
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsedCompanies.map(company => {
                  const isInDir = existingCompanyNames.some(n => n.toLowerCase() === company.name.toLowerCase()) || addedCompanies.has(company.name);
                  const isChecked = selected.has(company.name);
                  const isAdding = addingCompanies.has(company.name);
                  return (
                    <div
                      key={company.name}
                      className={`flex items-center gap-2 p-3 bg-white rounded-lg border ${isChecked && !isInDir ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'} transition-all`}
                    >
                      {!isInDir && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(company.name)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900 text-sm truncate">{company.name}</p>
                          {isInDir && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg shrink-0 ml-2">
                              <Check size={10} /> In Directory
                            </span>
                          )}
                          {isAdding && (
                            <Loader2 size={12} className="animate-spin text-indigo-500 shrink-0 ml-2" />
                          )}
                        </div>
                        {company.url && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{company.url}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Selected button */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                {selectedCount} {selectedCount === 1 ? 'company' : 'companies'} selected
                {selectedCount > 0 && ` — each will be linked to ${vcName}`}
              </p>
              <button
                onClick={handleAddSelected}
                disabled={selectedCount === 0 || isAddingAll}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isAddingAll ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {isAddingAll ? 'Adding...' : `Add ${selectedCount} to Directory`}
              </button>
            </div>
          </div>
        )}

        {parsedCompanies !== null && parsedCompanies.length === 0 && (
          <p className="mt-3 text-xs text-slate-400 italic">No company names found in the CSV.</p>
        )}
      </div>
    </div>
  );
};

export default VCPortfolioImport;
