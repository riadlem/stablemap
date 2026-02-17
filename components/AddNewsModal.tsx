
import React, { useState } from 'react';
import { X, Check, Link, Calendar, FileText, Type } from 'lucide-react';

interface AddNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (news: { title: string; url: string; date: string; summary: string }) => void;
  companyName: string;
}

const AddNewsModal: React.FC<AddNewsModalProps> = ({ isOpen, onClose, onSave, companyName }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, url, date, summary });
    onClose();
    // Reset
    setTitle('');
    setUrl('');
    setDate(new Date().toISOString().split('T')[0]);
    setSummary('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">Add News for {companyName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Type size={12} /> Title
             </label>
             <input 
               type="text" 
               required
               className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
               placeholder="e.g. Announces partnership with..."
               value={title}
               onChange={e => setTitle(e.target.value)}
             />
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Link size={12} /> Source URL
             </label>
             <input 
               type="url" 
               required
               className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
               placeholder="https://..."
               value={url}
               onChange={e => setUrl(e.target.value)}
             />
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} /> Date
             </label>
             <input 
               type="date" 
               required
               className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
               value={date}
               onChange={e => setDate(e.target.value)}
             />
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <FileText size={12} /> Summary (Optional)
             </label>
             <textarea 
               className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-20 focus:ring-2 focus:ring-indigo-500 outline-none"
               placeholder="Brief description of the event..."
               value={summary}
               onChange={e => setSummary(e.target.value)}
             />
          </div>

          <div className="pt-4 flex justify-end gap-3">
             <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
             <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 font-medium">
               <Check size={16} /> Save News
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddNewsModal;
