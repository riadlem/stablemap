import React from 'react';
import { Company } from '../types';
import { X, Check } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  company?: Company;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, company }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Share Intelligence</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Share <strong>{company?.name}</strong> profile and partnership data with your team.
          </p>
          
          <div className="space-y-3">
             <label className="block text-xs font-semibold text-slate-500 uppercase">Recipients</label>
             <input type="text" placeholder="Enter email addresses..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
             
             <label className="block text-xs font-semibold text-slate-500 uppercase mt-4">Message (Optional)</label>
             <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-24 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Check out this partnership map..."></textarea>
          </div>

          <div className="mt-6 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
             <button onClick={() => { alert('Shared successfully!'); onClose(); }} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
               Send <Check size={14} />
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;