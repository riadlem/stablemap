
import React, { useEffect, useState } from 'react';
import { Job, Company } from '../types';
import { X, MapPin, DollarSign, Calendar, ExternalLink, Briefcase, CheckCircle, Zap, Building2, RefreshCw } from 'lucide-react';
import { analyzeJobLink } from "../services/claudeService";

interface JobDetailModalProps {
  job: Job;
  companyName: string;
  companyLogo?: string;
  isOpen: boolean;
  onClose: () => void;
}

const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, companyName, companyLogo, isOpen, onClose }) => {
  const [details, setDetails] = useState<Job>(job);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset when job changes or modal opens
  useEffect(() => {
    if (isOpen) {
        setDetails(job);
        // If we don't have a description yet, fetch it
        if (!job.description && job.url) {
            fetchDetails();
        }
    }
  }, [job, isOpen]);

  const fetchDetails = async () => {
      setLoading(true);
      setError('');
      try {
          if (!job.url) throw new Error("No URL available");
          const result = await analyzeJobLink(job.url);
          
          setDetails(prev => ({
              ...prev,
              description: result.description,
              requirements: result.requirements,
              salary: result.salary || prev.salary,
              benefits: result.benefits,
              type: (result.type as any) || prev.type,
              locations: result.locations.length > 0 ? result.locations : prev.locations
          }));
      } catch (e) {
          console.error(e);
          setError("Could not load full details. Please check the official link.");
      }
      setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
            <div className="flex items-start gap-4">
                {companyLogo && (
                    <img src={companyLogo} alt={companyName} className="w-16 h-16 rounded-xl border border-slate-200 bg-white p-1 object-contain" />
                )}
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">{details.title}</h2>
                    <div className="flex items-center gap-2 text-slate-600 mt-1 font-medium">
                        <span>{companyName}</span>
                        <span>•</span>
                        <span className="text-slate-500">{details.department}</span>
                    </div>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="grid md:grid-cols-3 gap-8">
                
                {/* Main Description Column */}
                <div className="md:col-span-2 space-y-8">
                    {loading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                            <div className="h-4 bg-slate-200 rounded w-full"></div>
                            <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                            <div className="h-32 bg-slate-100 rounded-xl w-full mt-4"></div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-slate-500">
                            <Briefcase size={48} className="mx-auto text-slate-300 mb-2" />
                            <p>{error}</p>
                            <a href={job.url} target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline mt-2 inline-block">
                                View on Company Site
                            </a>
                        </div>
                    ) : (
                        <>
                            <section>
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Briefcase size={16} className="text-indigo-600" /> About the Role
                                </h3>
                                <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                                    {details.description || "No description available."}
                                </div>
                            </section>

                            {details.requirements && details.requirements.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <CheckCircle size={16} className="text-emerald-600" /> Requirements
                                    </h3>
                                    <ul className="space-y-2">
                                        {details.requirements.map((req, idx) => (
                                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                                                <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0"></span>
                                                {req}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </>
                    )}
                </div>

                {/* Sidebar Info Column */}
                <div className="space-y-6">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Compensation</label>
                            <div className="flex items-center gap-2 text-slate-900 font-semibold">
                                <DollarSign size={18} className="text-emerald-600" />
                                {details.salary || "Competitive"}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Location</label>
                            <div className="flex items-start gap-2 text-slate-900 font-medium text-sm">
                                <MapPin size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                                <div>
                                    {details.locations.map((loc, i) => (
                                        <div key={i}>{loc}</div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Job Type</label>
                            <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                                <Building2 size={18} className="text-blue-500" />
                                {details.type || "Full-time"}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Posted</label>
                            <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                                <Calendar size={18} className="text-slate-400" />
                                {details.postedDate}
                            </div>
                        </div>
                    </div>

                    {details.benefits && details.benefits.length > 0 && (
                        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                             <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Zap size={14} className="text-yellow-500 fill-yellow-500" /> Perks & Benefits
                             </h4>
                             <ul className="space-y-1.5">
                                {details.benefits.map((benefit, i) => (
                                    <li key={i} className="text-xs text-indigo-800 font-medium flex items-center gap-1.5">
                                        • {benefit}
                                    </li>
                                ))}
                             </ul>
                        </div>
                    )}

                    <a 
                        href={details.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                    >
                        Apply Now <ExternalLink size={16} />
                    </a>
                    
                    {!loading && !details.description && (
                        <button 
                            onClick={fetchDetails}
                            className="w-full bg-white border border-slate-200 text-slate-600 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                        >
                            <RefreshCw size={12} /> Analyze Details with AI
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default JobDetailModal;
