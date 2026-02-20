
import React, { useState, useMemo } from 'react';
import { Company, Job, Category } from '../types';
import { Briefcase, MapPin, Calendar, Search, Building2, ExternalLink, RefreshCw, Filter, Globe, Plus, X, Sparkles, ArrowRight, Flag, Ban, DollarSign } from 'lucide-react';
import { findJobOpenings, analyzeJobLink } from "../services/claudeService";
import { isJobRecent } from '../constants';
import JobDetailModal from './JobDetailModal';

interface JobBoardProps {
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => Promise<void>;
}

// Helper to detect regions from location string
const detectRegions = (locations: string[], companyDefault: string): string[] => {
  const detectedSet = new Set<string>();

  if (!locations || locations.length === 0) return [companyDefault];

  locations.forEach(location => {
      const loc = location.toLowerCase();
      let region = '';

      // 1. Check for Global/Remote indicators
      if (loc.includes('remote') || loc.includes('global') || loc.includes('anywhere') || loc.includes('world') || loc.includes('distributed')) {
         if (loc.includes('us') || loc.includes('usa') || loc.includes('united states') || loc.includes('america')) region = 'North America';
         else if (loc.includes('uk') || loc.includes('london') || loc.includes('europe') || loc.includes('eu') || loc.includes('germany') || loc.includes('france')) region = 'Europe';
         else if (loc.includes('asia') || loc.includes('apac')) region = 'APAC';
         else if (loc.includes('latam') || loc.includes('latin america')) region = 'LATAM';
         else region = 'Global';
      }
      // 2. Keyword matching for specific regions
      else if (/argentina|brazil|chile|colombia|mexico|peru|uruguay|buenos aires|sao paulo|bogota|lima|mexico city|santiago|rio de janeiro|caracas|venezuela|costa rica|panama/.test(loc)) {
        region = 'LATAM';
      }
      else if (/singapore|hong kong|japan|tokyo|korea|seoul|china|shanghai|beijing|australia|sydney|melbourne|india|bangalore|mumbai|delhi|asia|pacific|vietnam|thailand|indonesia|jakarta|manila|kuala lumpur|malaysia|taiwan/.test(loc)) {
        region = 'APAC';
      }
      else if (/uk|united kingdom|london|germany|berlin|munich|hamburg|frankfurt|france|paris|switzerland|zurich|geneva|ireland|dublin|netherlands|amsterdam|spain|madrid|barcelona|italy|rome|milan|sweden|stockholm|estonia|tallinn|lisbon|portugal|poland|warsaw|europe|eu|brussels|belgium|austria|vienna|prague|czech/.test(loc)) {
        region = 'Europe';
      }
      else if (/usa|united states|canada|toronto|vancouver|montreal|new york|san francisco|los angeles|chicago|boston|austin|miami|seattle|denver|atlanta|washington|dc|california|texas|florida|ontario|quebec|san jose|palo alto|mountain view|cambridge/.test(loc)) {
        region = 'North America';
      }
      else if (/dubai|uae|abudhabi|kenya|nairobi|nigeria|lagos|south africa|capetown|johannesburg|israel|tel aviv|riyadh|saudi|qatar|doha|egypt|cairo|middle east|africa/.test(loc)) {
        region = 'EMEA';
      }
      
      if (region) {
          detectedSet.add(region);
      }
  });

  // If we couldn't map any location to a region, fallback to company default
  if (detectedSet.size === 0) {
      return [companyDefault];
  }

  return Array.from(detectedSet);
};

const JobBoard: React.FC<JobBoardProps> = ({ companies, onUpdateCompanies }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [isAddingJob, setIsAddingJob] = useState(false);

  // Manual Job Form State
  const [newJobUrl, setNewJobUrl] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobLocations, setNewJobLocations] = useState(''); // Comma separated string
  const [newJobCompanyId, setNewJobCompanyId] = useState(companies[0]?.id || '');
  const [newJobDepartment, setNewJobDepartment] = useState('Business Dev');
  
  // Auto-fill State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [flaggingJobId, setFlaggingJobId] = useState<string | null>(null);
  
  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<Job & { companyName: string, companyLogo: string } | null>(null);

  // Flatten jobs from all companies into a single list with company metadata
  // Also filter out old jobs and HIDDEN jobs
  const allJobs = useMemo(() => {
    return companies.flatMap(company => 
      (company.jobs || [])
        .filter(job => isJobRecent(job.postedDate) && !job.hidden) // Filter out jobs > 6 months and hidden ones
        .map(job => {
          const jobRegions = detectRegions(job.locations || [], company.region || 'Global');
          return {
            ...job,
            locations: job.locations || [],
            companyName: company.name,
            companyId: company.id,
            companyLogo: company.logoPlaceholder,
            companyCategory: company.categories?.[0] || 'Infrastructure',
            jobRegions: jobRegions,
            companyWebsite: company.website
          };
        })
    );
  }, [companies]);

  // Unique departments for filter - Added 'Other'
  const departments = ['All', 'Strategy', 'Business Dev', 'Partnerships', 'Customer Success', 'Other'];
  
  // Unique regions/locations derived from available jobs
  const regions = useMemo(() => {
      const uniqueRegions = new Set(allJobs.flatMap(j => j.jobRegions));
      // Always include standard regions if they are available in data, plus 'Global'
      const standardOrder = ['All', 'North America', 'Europe', 'APAC', 'LATAM', 'EMEA', 'Global'];
      const availableRegions = standardOrder.filter(r => r === 'All' || uniqueRegions.has(r));
      return availableRegions; 
  }, [allJobs]);

  // Filter & Sort Logic
  const filteredJobs = useMemo(() => {
    return allJobs.filter(job => {
      const matchesSearch = 
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        job.companyName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = departmentFilter === 'All' || job.department === departmentFilter;
      
      // Filter by Job Region
      // Global jobs are shown in ALL region filters
      const matchesRegion = locationFilter === 'All' || 
                            job.jobRegions.includes(locationFilter) || 
                            job.jobRegions.includes('Global');
      
      return matchesSearch && matchesDept && matchesRegion;
    }).sort((a, b) => {
       // Priority Check: If filtering by region, show exact matches before Global or other regions
       if (locationFilter !== 'All') {
          const aIsExact = a.jobRegions.includes(locationFilter);
          const bIsExact = b.jobRegions.includes(locationFilter);
          
          if (aIsExact && !bIsExact) return -1;
          if (!aIsExact && bIsExact) return 1;
       }

       // Secondary Check: Date (Newest first)
       const dateA = new Date(a.postedDate).getTime();
       const dateB = new Date(b.postedDate).getTime();
       // Use safe sort even if dates are invalid (though filtered already)
       return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    });
  }, [allJobs, searchTerm, departmentFilter, locationFilter]);

  // Helper to merge jobs (deduplicate and keep recent)
  const mergeJobs = (existing: Job[], newJobs: Job[]): Job[] => {
     const combined = [...existing];
     
     newJobs.forEach(job => {
        const exists = combined.some(e => 
            (e.url && job.url && e.url === job.url) || 
            (e.title.toLowerCase() === job.title.toLowerCase() && e.postedDate === job.postedDate)
        );
        if (!exists) {
            combined.push(job);
        }
     });

     // Enforce 6 month retention policy directly on the data
     return combined.filter(j => isJobRecent(j.postedDate));
  };

  const handleDismissJob = async (jobId: string, companyId: string, reason: string) => {
      const updatedCompanies = companies.map(c => {
          if (c.id === companyId && c.jobs) {
              const updatedJobs = c.jobs.map(j => {
                  if (j.id === jobId) {
                      return { ...j, hidden: true, dismissReason: reason };
                  }
                  return j;
              });
              return { ...c, jobs: updatedJobs };
          }
          return c;
      });

      await onUpdateCompanies(updatedCompanies);
      setFlaggingJobId(null);
  };

  // AI Scan Logic
  const handleSmartScan = async () => {
    setIsScanning(true);
    // Find companies that have no jobs listed yet or haven't been updated recently
    // For simplicity, we scan everything that has 0 jobs first
    const companiesToScan = companies.filter(c => !c.jobs || c.jobs.length === 0);
    
    // Limit to 5 at a time to be friendly to APIs/Time
    const batch = companiesToScan.slice(0, 5);
    setScanProgress({ current: 0, total: batch.length });

    if (batch.length === 0) {
      // If all empty ones are filled, maybe user wants to force refresh?
      const confirmForce = window.confirm("All companies have data. Force re-scan random 5 companies?");
      if (!confirmForce) {
        setIsScanning(false);
        return;
      }
      // Pick 5 random
      const randomBatch = [...companies].sort(() => 0.5 - Math.random()).slice(0, 5);
      batch.push(...randomBatch);
      setScanProgress({ current: 0, total: batch.length });
    }

    const updatedCompanies = [...companies];

    for (let i = 0; i < batch.length; i++) {
      const company = batch[i];
      try {
        const foundJobs = await findJobOpenings(company.name);
        
        // Update local copy of companies array using MERGE logic
        const idx = updatedCompanies.findIndex(c => c.id === company.id);
        if (idx !== -1) {
          const existingJobs = updatedCompanies[idx].jobs || [];
          const merged = mergeJobs(existingJobs, foundJobs);
          updatedCompanies[idx] = { ...updatedCompanies[idx], jobs: merged };
        }
      } catch (e) {
        console.error(`Failed to scan jobs for ${company.name}`, e);
      }
      setScanProgress({ current: i + 1, total: batch.length });
    }

    // Persist all changes
    await onUpdateCompanies(updatedCompanies);
    setIsScanning(false);
  };

  const handleAutoFill = async () => {
    if (!newJobUrl) return;
    setIsAnalyzing(true);
    try {
      const details = await analyzeJobLink(newJobUrl);
      if (details) {
        setNewJobTitle(details.jobTitle);
        setNewJobDepartment(details.department);
        setNewJobLocations(details.locations.join(', '));
        
        // Try to find matching company
        if (details.companyName) {
           const match = companies.find(c => c.name.toLowerCase().includes(details.companyName.toLowerCase()) || details.companyName.toLowerCase().includes(c.name.toLowerCase()));
           if (match) {
             setNewJobCompanyId(match.id);
           }
        }
      }
    } catch (e) {
      console.error("Auto-fill failed", e);
      alert("Could not extract details. Please fill manually.");
    }
    setIsAnalyzing(false);
  };

  const handleManualJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobCompanyId || !newJobTitle || !newJobUrl) return;

    const companyIndex = companies.findIndex(c => c.id === newJobCompanyId);
    if (companyIndex === -1) return;

    const locs = newJobLocations.split(',').map(s => s.trim()).filter(Boolean);

    const newJob: Job = {
        id: `manual-job-${Date.now()}`,
        title: newJobTitle,
        department: newJobDepartment as any,
        locations: locs.length > 0 ? locs : ['Remote'],
        postedDate: new Date().toISOString().split('T')[0],
        url: newJobUrl
    };

    const updatedCompanies = [...companies];
    const existingJobs = updatedCompanies[companyIndex].jobs || [];
    // Manual add also triggers a cleanup of old jobs to keep data clean
    const merged = mergeJobs(existingJobs, [newJob]);
    
    updatedCompanies[companyIndex] = {
        ...updatedCompanies[companyIndex],
        jobs: merged
    };

    await onUpdateCompanies(updatedCompanies);
    setIsAddingJob(false);
    // Reset Form
    setNewJobTitle('');
    setNewJobUrl('');
    setNewJobLocations('');
  };

  return (
    <div className="space-y-6 relative">
      
      {selectedJob && (
          <JobDetailModal 
            job={selectedJob} 
            companyName={selectedJob.companyName} 
            companyLogo={selectedJob.companyLogo}
            isOpen={!!selectedJob}
            onClose={() => setSelectedJob(null)}
          />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Talent & Opportunities</h2>
          <p className="text-slate-500 text-sm">Open positions (last 6 months) across the digital asset ecosystem.</p>
        </div>
        
        <div className="flex items-center gap-2">
            <button
                onClick={() => setIsAddingJob(true)}
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
            >
                <Plus size={16} /> Post Job
            </button>
            <button 
            onClick={handleSmartScan}
            disabled={isScanning}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm text-sm font-medium"
            >
            <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? `Scanning (${scanProgress.current}/${scanProgress.total})...` : 'Scan for New Jobs'}
            </button>
        </div>
      </div>

      {/* Manual Job Entry Modal */}
      {isAddingJob && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in p-6 relative max-h-[90vh] overflow-y-auto">
                  <button onClick={() => setIsAddingJob(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                      <X size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Post a Job Link</h3>
                  
                  {/* Auto-fill Section */}
                  <div className="bg-indigo-50 p-4 rounded-lg mb-6 border border-indigo-100">
                    <label className="block text-xs font-semibold text-indigo-700 uppercase mb-2 flex items-center gap-1">
                      <Sparkles size={12} /> Auto-fill from URL
                    </label>
                    <div className="flex gap-2">
                       <input 
                            type="url" 
                            className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                            placeholder="Paste LinkedIn/Lever/Greenhouse link..."
                            value={newJobUrl}
                            onChange={(e) => setNewJobUrl(e.target.value)}
                        />
                        <button 
                          onClick={handleAutoFill}
                          disabled={!newJobUrl || isAnalyzing}
                          className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shrink-0 flex items-center gap-1"
                        >
                           {isAnalyzing ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                           {isAnalyzing ? 'Analyzing' : 'Auto-fill'}
                        </button>
                    </div>
                  </div>

                  <form onSubmit={handleManualJobSubmit} className="space-y-4">
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Company</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={newJobCompanyId}
                            onChange={(e) => setNewJobCompanyId(e.target.value)}
                          >
                              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Job Title</label>
                          <input 
                            type="text" 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. Head of Partnerships"
                            value={newJobTitle}
                            onChange={(e) => setNewJobTitle(e.target.value)}
                            required
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Job URL</label>
                          <input 
                            type="url" 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 text-slate-600"
                            value={newJobUrl}
                            onChange={(e) => setNewJobUrl(e.target.value)}
                            required
                          />
                      </div>
                       <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Locations</label>
                          <input 
                            type="text" 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. London, New York (comma separated)"
                            value={newJobLocations}
                            onChange={(e) => setNewJobLocations(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Department</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={newJobDepartment}
                            onChange={(e) => setNewJobDepartment(e.target.value)}
                          >
                              <option value="Strategy">Strategy</option>
                              <option value="Business Dev">Business Dev</option>
                              <option value="Partnerships">Partnerships</option>
                              <option value="Customer Success">Customer Success</option>
                              <option value="Other">Other</option>
                          </select>
                      </div>
                      <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors mt-2">
                          Add Job to Board
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search roles or companies..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
             {/* Department Filter */}
            <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400 shrink-0" />
                <select 
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>

            {/* Region Filter */}
            <div className="flex items-center gap-2">
                <Globe size={16} className="text-slate-400 shrink-0" />
                <select 
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-slate-500 font-medium">
        <span>{allJobs.length} Recent Positions</span>
        <span>•</span>
        <span>{filteredJobs.length} Shown</span>
      </div>

      {/* Job List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <Briefcase size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-900 font-medium">No recent jobs found</h3>
            <p className="text-slate-500 text-sm mt-1">Try adjusting filters, or scan for new opportunities.</p>
          </div>
        ) : (
          filteredJobs.map((job, idx) => (
            <div key={`${job.id}-${idx}`} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group">
              <div className="flex justify-between items-start gap-4">
                <div className="flex gap-4">
                  <img 
                    src={job.companyLogo} 
                    alt={job.companyName} 
                    loading="lazy"
                    className="w-12 h-12 rounded-lg bg-slate-50 object-contain p-1 border border-slate-100"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src.includes('clearbit.com') && (job as any).companyWebsite) {
                        const domain = (job as any).companyWebsite.replace(/^https?:\/\//, '').split('/')[0];
                        target.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                        return;
                      }
                      if (!target.src.includes('ui-avatars.com')) {
                        target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(job.companyName)}&background=f8fafc&color=64748b&size=128`;
                      }
                    }}
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => setSelectedJob(job)}>
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 mt-1">
                      <span className="font-medium text-slate-800">{job.companyName}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className="text-slate-500">{job.companyCategory}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      {/* Display Job Regions */}
                      <span className="text-slate-500">{job.jobRegions.join(', ')}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                        <Briefcase size={12} /> {job.department}
                      </span>
                      {job.locations?.map((loc, i) => (
                        <span key={i} className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                            <MapPin size={12} /> {loc}
                        </span>
                      ))}
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                        <Calendar size={12} /> Posted {job.postedDate}
                      </span>
                      {job.salary && (
                          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded font-medium">
                              <DollarSign size={12} /> {job.salary}
                          </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Details Button */}
                    <button 
                        onClick={() => setSelectedJob(job)} 
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        View Details
                    </button>

                  <div className="relative">
                      <button 
                        onClick={() => setFlaggingJobId(flaggingJobId === job.id ? null : job.id)}
                        className="text-slate-300 hover:text-red-500 p-1 rounded-full transition-colors"
                        title="Report issue with this job"
                      >
                          <Flag size={14} />
                      </button>
                      
                      {flaggingJobId === job.id && (
                          <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 bg-slate-50 border-b border-slate-100">
                                  Dismiss Job
                              </div>
                              <button 
                                onClick={() => handleDismissJob(job.id, job.companyId as string, 'Incorrect Company')}
                                className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                              >
                                  <Ban size={12} className="text-red-500" /> Wrong Company
                              </button>
                              <button 
                                onClick={() => handleDismissJob(job.id, job.companyId as string, 'Not Crypto')}
                                className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                              >
                                  <X size={12} /> Not Relevant
                              </button>
                          </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default JobBoard;
