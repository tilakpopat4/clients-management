import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Users, ClipboardList, FileText, ExternalLink, Play, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { User } from 'firebase/auth';
import { useFirestore } from '../hooks/useFirestore';
import { Client, WorkItem, Invoice } from '../types';
import { Tab } from '../App';
import Logo from './Logo';

interface GlobalHeaderProps {
  user: User | null;
  activeTab: Tab;
  setActiveTab: (tab: Tab, query?: string) => void;
  onSearchSelect?: (type: 'client' | 'work' | 'invoice', id: string, query?: string) => void;
  globalQuery: string;
  setGlobalQuery: (query: string) => void;
}

export default function GlobalHeader({
  user,
  activeTab,
  setActiveTab,
  onSearchSelect,
  globalQuery,
  setGlobalQuery
}: GlobalHeaderProps) {
  const { data: clients } = useFirestore<Client>('clients', user?.uid);
  const { data: workItems } = useFirestore<WorkItem>('workItems', user?.uid);
  const { data: invoices } = useFirestore<Invoice>('invoices', user?.uid);

  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'clients' | 'work' | 'invoices'>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut (⌘K or /) to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === '/' && document.activeElement !== inputRef.current && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cleanQuery = globalQuery.trim().toLowerCase();

  // Filter clients
  const filteredClients = cleanQuery ? clients.filter(c => 
    c.name.toLowerCase().includes(cleanQuery) ||
    (c.email && c.email.toLowerCase().includes(cleanQuery)) ||
    (c.phone && c.phone.toLowerCase().includes(cleanQuery))
  ) : [];

  // Filter work items
  const filteredWork = cleanQuery ? workItems.filter(w => {
    const client = clients.find(c => c.id === w.clientId);
    const clientName = client ? client.name.toLowerCase() : '';
    return w.description.toLowerCase().includes(cleanQuery) ||
      clientName.includes(cleanQuery) ||
      (w.videoUrl && w.videoUrl.toLowerCase().includes(cleanQuery));
  }) : [];

  // Filter invoices
  const filteredInvoices = cleanQuery ? invoices.filter(inv => {
    const invoiceNo = inv.id.substring(0, 8).toLowerCase();
    const itemsText = inv.reels ? inv.reels.map(r => r.title).join(' ').toLowerCase() : '';
    return inv.clientName.toLowerCase().includes(cleanQuery) ||
      invoiceNo.includes(cleanQuery) ||
      itemsText.includes(cleanQuery);
  }) : [];

  const totalResults = filteredClients.length + filteredWork.length + filteredInvoices.length;

  const handleSelectClient = (client: Client) => {
    setIsOpen(false);
    if (onSearchSelect) {
      onSearchSelect('client', client.id, globalQuery);
    } else {
      setActiveTab('clients', globalQuery);
    }
  };

  const handleSelectWork = (work: WorkItem) => {
    setIsOpen(false);
    if (onSearchSelect) {
      onSearchSelect('work', work.id, globalQuery);
    } else {
      setActiveTab('work', globalQuery);
    }
  };

  const handleSelectInvoice = (inv: Invoice) => {
    setIsOpen(false);
    if (onSearchSelect) {
      onSearchSelect('invoice', inv.id, globalQuery);
    } else {
      setActiveTab('invoice', globalQuery);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 md:px-8 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Mobile Logo Branding */}
        <div className="flex items-center gap-2 md:hidden">
          <Logo className="w-7 h-7" />
          <span className="font-extrabold text-slate-900 tracking-tight text-base">CrestFlow</span>
        </div>

        {/* Real-time Global Search Input */}
        <div ref={searchRef} className="relative flex-1 max-w-2xl mx-auto md:mx-0">
          <div className="relative flex items-center">
            <Search size={18} className="absolute left-3.5 text-slate-400 pointer-events-none transition-colors group-focus-within:text-indigo-600" />
            <input
              ref={inputRef}
              type="text"
              value={globalQuery}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search clients, work items, video links, invoices..."
              className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-900 text-xs md:text-sm pl-10 pr-20 py-2 md:py-2.5 rounded-xl border border-slate-200/80 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-slate-400"
            />
            <div className="absolute right-3 flex items-center gap-1.5">
              {globalQuery ? (
                <button
                  onClick={() => {
                    setGlobalQuery('');
                    setIsOpen(false);
                  }}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs pointer-events-none">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>

          {/* Real-Time Filter Search Results Dropdown */}
          {isOpen && cleanQuery.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[80vh] flex flex-col">
              {/* Category Filter Chips */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs gap-2 shrink-0 overflow-x-auto">
                <div className="flex items-center gap-1.5 font-medium">
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      activeCategory === 'all'
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({totalResults})
                  </button>
                  <button
                    onClick={() => setActiveCategory('clients')}
                    className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                      activeCategory === 'clients'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Users size={12} /> Clients ({filteredClients.length})
                  </button>
                  <button
                    onClick={() => setActiveCategory('work')}
                    className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                      activeCategory === 'work'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <ClipboardList size={12} /> Work Logs ({filteredWork.length})
                  </button>
                  <button
                    onClick={() => setActiveCategory('invoices')}
                    className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                      activeCategory === 'invoices'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <FileText size={12} /> Invoices ({filteredInvoices.length})
                  </button>
                </div>

                <span className="text-[11px] text-slate-400 font-medium shrink-0">
                  Real-time results
                </span>
              </div>

              {/* Scrollable Results Body */}
              <div className="overflow-y-auto p-2 space-y-4 divide-y divide-slate-100">
                {totalResults === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <Search className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">No matching records found</p>
                    <p className="text-xs text-slate-400">Try searching for a client name, project description, reel title, or invoice ID.</p>
                  </div>
                ) : (
                  <>
                    {/* Clients Section */}
                    {(activeCategory === 'all' || activeCategory === 'clients') && filteredClients.length > 0 && (
                      <div className="pt-2 first:pt-0">
                        <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Users size={12} className="text-indigo-500" /> Clients ({filteredClients.length})
                        </div>
                        <div className="mt-1 space-y-1">
                          {filteredClients.map(client => (
                            <button
                              key={client.id}
                              onClick={() => handleSelectClient(client)}
                              className="w-full text-left p-3 hover:bg-indigo-50/70 rounded-xl transition-all flex items-center justify-between group cursor-pointer border border-transparent hover:border-indigo-100"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm shrink-0">
                                  {client.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-xs md:text-sm text-slate-900 group-hover:text-indigo-700 flex items-center gap-2">
                                    {client.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                                    {client.email && <span>{client.email}</span>}
                                    {client.phone && <span>{client.phone}</span>}
                                    <span>Rate: ₹{client.defaultRate}/reel</span>
                                  </div>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 shrink-0">
                                View Client <ArrowRight size={13} />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Work Logs Section */}
                    {(activeCategory === 'all' || activeCategory === 'work') && filteredWork.length > 0 && (
                      <div className="pt-2 first:pt-0">
                        <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <ClipboardList size={12} className="text-indigo-500" /> Work Logs ({filteredWork.length})
                        </div>
                        <div className="mt-1 space-y-1">
                          {filteredWork.map(work => {
                            const client = clients.find(c => c.id === work.clientId);
                            return (
                              <button
                                key={work.id}
                                onClick={() => handleSelectWork(work)}
                                className="w-full text-left p-3 hover:bg-indigo-50/70 rounded-xl transition-all flex items-center justify-between group cursor-pointer border border-transparent hover:border-indigo-100"
                              >
                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                                    <ClipboardList size={16} className="text-slate-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-xs md:text-sm text-slate-900 group-hover:text-indigo-700 truncate">
                                      {work.description}
                                    </div>
                                    <div className="text-[11px] text-slate-400 flex items-center gap-2.5 mt-0.5 flex-wrap">
                                      <span className="font-medium text-slate-600">{client ? client.name : 'Unknown Client'}</span>
                                      <span>•</span>
                                      <span>{new Date(work.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                      <span>•</span>
                                      <span className="font-semibold text-slate-700">₹{(work.quantity * work.rate).toLocaleString('en-IN')}</span>
                                      {work.status === 'Invoiced' ? (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          <CheckCircle2 size={10} /> Invoiced
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                          <Clock size={10} /> Uninvoiced
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 shrink-0">
                                  View Log <ArrowRight size={13} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Invoices Section */}
                    {(activeCategory === 'all' || activeCategory === 'invoices') && filteredInvoices.length > 0 && (
                      <div className="pt-2 first:pt-0">
                        <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText size={12} className="text-indigo-500" /> Invoices ({filteredInvoices.length})
                        </div>
                        <div className="mt-1 space-y-1">
                          {filteredInvoices.map(inv => (
                            <button
                              key={inv.id}
                              onClick={() => handleSelectInvoice(inv)}
                              className="w-full text-left p-3 hover:bg-indigo-50/70 rounded-xl transition-all flex items-center justify-between group cursor-pointer border border-transparent hover:border-indigo-100"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                                  #{inv.id.substring(0, 4).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-xs md:text-sm text-slate-900 group-hover:text-indigo-700 flex items-center gap-2">
                                    <span>#{inv.id.substring(0, 8).toUpperCase()}</span>
                                    <span className="text-slate-400 font-normal">•</span>
                                    <span>{inv.clientName}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span>{new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    <span>•</span>
                                    <span className="font-bold text-slate-900">₹{inv.totalAmount.toLocaleString('en-IN')}</span>
                                    <span>•</span>
                                    <span className={`font-semibold px-1.5 py-0.2 rounded text-[10px] ${
                                      inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                    }`}>
                                      {inv.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 shrink-0">
                                View Invoice <ArrowRight size={13} />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
