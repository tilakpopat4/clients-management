import React, { useState, useEffect, useRef } from 'react';
import { Client, Reel, Invoice, WorkItem } from '../types';
import { Plus, Trash2, Download, Receipt, FileCheck } from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';

// Helper functions to parse and convert oklch colors to standard rgb/rgba,
// which prevents crashes in html2canvas (used by html2pdf.js) under Tailwind CSS v4.
function oklchToRgb(l_val: number, c_val: number, h_val: number): { r: number, g: number, b: number } {
  // h_val is in degrees, convert to radians
  const h_rad = (h_val * Math.PI) / 180;
  const a = c_val * Math.cos(h_rad);
  const b = c_val * Math.sin(h_rad);

  const l = l_val + 0.3963377774 * a + 0.2158037573 * b;
  const m = l_val - 0.1055613458 * a - 0.0638541728 * b;
  const s = l_val - 0.0894841775 * a - 1.2914855480 * b;

  const l_3 = l * l * l;
  const m_3 = m * m * m;
  const s_3 = s * s * s;

  let r_lin = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  let g_lin = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  let b_lin = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  const gamma = (c: number) => {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  const r_val = Math.round(Math.max(0, Math.min(1, gamma(r_lin))) * 255);
  const g_val = Math.round(Math.max(0, Math.min(1, gamma(g_lin))) * 255);
  const b_val = Math.round(Math.max(0, Math.min(1, gamma(b_lin))) * 255);

  return { r: r_val, g: g_val, b: b_val };
}

function convertOklchStringToRgb(oklchStr: string): string {
  const match = oklchStr.match(/oklch\(([^)]+)\)/);
  if (!match) return oklchStr;

  const partsStr = match[1].trim();
  const parts = partsStr.split(/[\s,/]+/);
  if (parts.length < 3) return oklchStr;

  const parseVal = (str: string, base: number = 1) => {
    if (str.endsWith('%')) {
      return (parseFloat(str) / 100) * base;
    }
    return parseFloat(str);
  };

  let l_val = parseVal(parts[0], 1);
  if (l_val > 1 && !parts[0].endsWith('%')) {
    l_val = l_val / 100;
  }

  const c_val = parseVal(parts[1], 1);
  const h_val = parseVal(parts[2], 1);

  const alphaStr = parts[3];
  const alpha = alphaStr !== undefined ? parseVal(alphaStr, 1) : 1;

  const { r, g, b } = oklchToRgb(l_val, c_val, h_val);

  if (alpha === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

function replaceOklchWithRgb(str: string): string {
  if (typeof str !== 'string') return str;
  if (!str.includes('oklch')) return str;

  return str.replace(/oklch\(([^)]+)\)/g, (match) => {
    try {
      return convertOklchStringToRgb(match);
    } catch (e) {
      console.warn("Failed to parse/convert oklch color:", match, e);
      return 'rgb(0, 0, 0)';
    }
  });
}

interface InvoiceTabProps {
  user: User | null;
}

export default function InvoiceTab({ user }: InvoiceTabProps) {
  const { data: clients, loading: clientsLoading } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices, addOrUpdateItem: addInvoice } = useFirestore<Invoice>('invoices', user?.uid);
  const { data: workItems, addOrUpdateItem: updateWorkItem } = useFirestore<WorkItem>('workItems', user?.uid);
  
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [reels, setReels] = useState<Reel[]>([]);
  const [linkedWorkItemIds, setLinkedWorkItemIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (selectedClientId && selectedMonth) {
      // Find uninvoiced work items for this client in the selected month
      const uninvoicedWork = workItems.filter(w => {
        if (w.clientId !== selectedClientId) return false;
        if (w.status !== 'Uninvoiced') return false;
        
        const workMonth = new Date(w.date).toISOString().slice(0, 7);
        return workMonth === selectedMonth;
      });
      
      if (uninvoicedWork.length > 0) {
        setReels(uninvoicedWork.map(w => ({
          id: generateUUID(),
          title: w.description,
          quantity: w.quantity,
          rate: w.rate
        })));
        setLinkedWorkItemIds(uninvoicedWork.map(w => w.id));
      } else {
        setReels([{ id: generateUUID(), title: '', quantity: 1, rate: selectedClient ? selectedClient.defaultRate : 0 }]);
        setLinkedWorkItemIds([]);
      }
    }
  }, [selectedClientId, selectedMonth, workItems]);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClientId(e.target.value);
  };

  const addItem = (defaultTitle: string, defaultRate: number) => {
    setReels([
      ...reels,
      { id: generateUUID(), title: defaultTitle, quantity: 1, rate: defaultRate }
    ]);
  };

  const updateReel = (id: string, field: keyof Reel, value: string | number) => {
    setReels(reels.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeReel = (id: string) => {
    if (reels.length > 1) {
      setReels(reels.filter(r => r.id !== id));
    }
  };

  const calculateTotal = () => {
    return reels.reduce((sum, reel) => sum + (reel.quantity * reel.rate), 0);
  };

  const total = calculateTotal();

  const handleDownload = () => {
    if (!selectedClient) {
      alert("Please select a client first.");
      return;
    }
    
    if (reels.some(r => !r.title.trim())) {
      alert("Please provide a title for all reels.");
      return;
    }

    setIsGenerating(true);
    const element = document.getElementById('invoice-preview-capture');
    if (!element) {
      alert("Error: Invoice preview element not found.");
      setIsGenerating(false);
      return;
    }

    // Resolve html2pdf function robustly in Vite/ESM environment
    let html2pdfFunc = html2pdf;
    if (html2pdfFunc && (html2pdfFunc as any).default) {
      html2pdfFunc = (html2pdfFunc as any).default;
    }
    if (typeof html2pdfFunc !== 'function' && typeof window !== 'undefined' && (window as any).html2pdf) {
      html2pdfFunc = (window as any).html2pdf;
    }

    if (typeof html2pdfFunc !== 'function') {
      alert("Error: html2pdf library failed to load as a function. Please refresh and try again.");
      setIsGenerating(false);
      return;
    }
    
    // Configure PDF options
    const opt = {
      margin:       0,
      filename:     `Invoice_${selectedClient.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    // Backup original window.getComputedStyle
    const originalGetComputedStyle = window.getComputedStyle;

    // Install the computedStyle Proxy to convert oklch colors on the fly for html2canvas
    window.getComputedStyle = function(el, pseudoElt) {
      const style = originalGetComputedStyle.call(window, el, pseudoElt);
      return new Proxy(style, {
        get(target, prop, receiver) {
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === 'string' && val.includes('oklch')) {
            return replaceOklchWithRgb(val);
          }
          if (typeof val === 'function') {
            return function(...args: any[]) {
              const res = val.apply(target, args);
              if (typeof res === 'string' && res.includes('oklch')) {
                return replaceOklchWithRgb(res);
              }
              return res;
            };
          }
          return val;
        }
      });
    };

    html2pdfFunc().set(opt).from(element).save().then(async () => {
      // Restore original computed style function immediately
      window.getComputedStyle = originalGetComputedStyle;

      // Save invoice to cloud storage
      const newInvoice: Invoice = {
        id: generateUUID(),
        date: Date.now(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        reels: [...reels],
        totalAmount: total,
        status: 'Pending'
      };
      
      try {
        await addInvoice(newInvoice);
        
        // Mark linked work items as invoiced
        for (const workId of linkedWorkItemIds) {
          const workItem = workItems.find(w => w.id === workId);
          if (workItem) {
            await updateWorkItem({ ...workItem, status: 'Invoiced', invoiceId: newInvoice.id });
          }
        }
        
        // Clear selection after successful generation
        setReels([{ id: generateUUID(), title: '', quantity: 1, rate: selectedClient.defaultRate }]);
        setLinkedWorkItemIds([]);
      } catch (err: any) {
        console.error("Error saving to cloud:", err);
        alert("Error saving invoice/work items to cloud: " + (err?.message || String(err)));
      }
      setIsGenerating(false);
      
    }).catch((err: any) => {
      // Restore original computed style function immediately
      window.getComputedStyle = originalGetComputedStyle;

      console.error(err);
      setIsGenerating(false);
      alert("An error occurred while generating the PDF: " + (err?.message || String(err)));
    });
  };

  if (clientsLoading) {
    return <div className="p-8 max-w-[1600px] mx-auto text-center py-20"><div className="animate-pulse flex items-center justify-center space-x-2"><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div></div></div>;
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Invoice Generator</h2>
        <p className="text-slate-500 mt-1">Create and export PDF invoices for your clients.</p>
      </div>

      <div className="grid xl:grid-cols-12 gap-8 items-start">
        {/* Left Column - Form */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Receipt size={18} className="text-indigo-500" />
              Invoice Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Select Client *</label>
                <select 
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                  value={selectedClientId}
                  onChange={handleClientChange}
                >
                  <option value="" disabled>-- Choose a saved client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Please add a client in the Clients tab first.</p>
                )}
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Select Month *</label>
                <input 
                  type="month"
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">Automatically loads uninvoiced work for this month.</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Line Items</h3>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => addItem('', selectedClient ? selectedClient.defaultRate : 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Reel
                </button>
                <button 
                  onClick={() => addItem('On Site Shoot', selectedClient?.onSiteShootRate || 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add On Site Shoot
                </button>
                <button 
                  onClick={() => addItem('Website Making', selectedClient?.websiteMakingRate || 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Website
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {reels.map((reel, index) => (
                <div key={reel.id} className="p-4 bg-slate-50 rounded border border-slate-100 relative group">
                  {reels.length > 1 && (
                    <button 
                      onClick={() => removeReel(reel.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                      <input 
                        type="text" 
                        value={reel.title}
                        onChange={(e) => updateReel(reel.id, 'title', e.target.value)}
                        placeholder="e.g. Wedding Highlight Reel"
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
                      <input 
                        type="number" 
                        min="1"
                        value={reel.quantity}
                        onChange={(e) => updateReel(reel.id, 'quantity', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Rate (₹)</label>
                      <input 
                        type="number" 
                        min="0"
                        value={reel.rate}
                        onChange={(e) => updateReel(reel.id, 'rate', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4 flex flex-col justify-end">
                      <div className="px-3 py-2 bg-white border border-slate-200 rounded text-sm font-medium text-right text-slate-900 bg-slate-100/50">
                        ₹{(reel.quantity * reel.rate).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Amount</span>
              <span className="text-2xl font-bold text-slate-900">₹{total.toLocaleString('en-IN')}</span>
            </div>

            <button 
              onClick={handleDownload}
              disabled={isGenerating || !selectedClient}
              className="w-full mt-6 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm"
            >
              {isGenerating ? (
                <>Generating PDF...</>
              ) : (
                <>
                  <Download size={18} />
                  Download PDF Invoice
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column - A4 Preview Wrapper */}
        <div className="xl:col-span-7 overflow-x-auto bg-slate-200 p-8 rounded-xl flex justify-center shadow-inner min-h-[600px] border border-slate-300 relative">
          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded text-xs font-bold text-slate-500 uppercase tracking-wider shadow-sm z-10">
            Live Preview
          </div>
          
          {/* This wrapper scales the visual preview so it fits on screen without changing actual dimensions for PDF export */}
          <div className="transform scale-[0.4] min-[400px]:scale-[0.45] sm:scale-[0.6] md:scale-[0.8] xl:scale-[0.9] origin-top transition-transform duration-300">
            
            {/* The actual A4 element captured by html2pdf */}
            <div 
              id="invoice-preview-capture" 
              className="bg-white shadow-2xl relative flex flex-col"
              style={{ 
                width: '210mm', 
                minHeight: '297mm', 
                padding: '20mm',
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#000000',
                boxSizing: 'border-box'
              }}
            >
              {/* Invoice Header */}
              <div className="border-b-2 border-slate-800 pb-8 mb-10 flex justify-between items-end">
                <div className="w-2/3">
                  <h1 className="text-5xl font-extrabold uppercase tracking-widest mb-3 text-slate-900">
                    INVOICE
                  </h1>
                  <p className="text-lg font-medium text-slate-500 tracking-widest uppercase">Video Editing Services</p>
                </div>
                <div className="w-1/3 text-right">
                  <p className="text-2xl font-bold mb-1 text-slate-900">Tilak Popat</p>
                  <p className="text-lg text-slate-700 whitespace-nowrap">+91 78749 03810</p>
                </div>
              </div>
              
              {/* Invoice Meta & Bill To */}
              <div className="flex justify-between mb-12">
                <div className="w-1/2">
                  <h2 className="text-sm font-bold mb-4 uppercase text-slate-400 tracking-widest">Bill To</h2>
                  {selectedClient ? (
                    <div className="text-lg leading-relaxed text-slate-900">
                      <p className="font-bold text-2xl mb-1">{selectedClient.name}</p>
                      {selectedClient.phone && <p className="text-slate-600">{selectedClient.phone}</p>}
                      {selectedClient.email && <p className="text-slate-600">{selectedClient.email}</p>}
                    </div>
                  ) : (
                    <div className="text-lg text-slate-400 italic mt-2">
                      Client details will appear here
                    </div>
                  )}
                </div>
                <div className="w-1/2 text-right">
                  <div className="mb-3 text-lg flex justify-end items-center gap-4">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Date</span> 
                    <span className="font-semibold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>
                  <div className="text-lg flex justify-end items-center gap-4">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Invoice No</span> 
                    <span className="font-semibold text-slate-900">#INV-{String(invoices.length + 1).padStart(4, '0')}</span>
                  </div>
                </div>
              </div>
              
              {/* Line Items Table */}
              <div className="mb-12 flex-grow">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-800">
                      <th className="py-4 px-2 font-bold text-sm uppercase tracking-widest text-slate-900 w-1/2">Description</th>
                      <th className="py-4 px-2 font-bold text-sm uppercase tracking-widest text-slate-900 text-center">Qty</th>
                      <th className="py-4 px-2 font-bold text-sm uppercase tracking-widest text-slate-900 text-right">Rate</th>
                      <th className="py-4 px-2 font-bold text-sm uppercase tracking-widest text-slate-900 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reels.map((reel, idx) => (
                      <tr key={reel.id} className="border-b border-slate-200">
                        <td className="py-5 px-2 text-lg break-words pr-4 text-slate-800">
                          {reel.title || <span className="text-slate-400 italic">Item description...</span>}
                        </td>
                        <td className="py-5 px-2 text-lg text-center text-slate-700">{reel.quantity}</td>
                        <td className="py-5 px-2 text-lg text-right text-slate-700">₹{reel.rate.toLocaleString('en-IN')}</td>
                        <td className="py-5 px-2 text-lg text-right font-bold text-slate-900">
                          ₹{(reel.quantity * reel.rate).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Total Section */}
              <div className="flex justify-end mb-16">
                <div className="w-1/2">
                  <div className="flex justify-between border-b border-slate-200 py-3 text-lg">
                    <span className="uppercase tracking-widest text-sm font-bold text-slate-500">Subtotal</span>
                    <span className="font-semibold text-slate-800">₹{total.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between border-b-2 border-slate-800 py-4 text-2xl font-bold mt-1 text-slate-900">
                    <span className="uppercase tracking-widest text-lg">Total Due</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              
              {/* Payment Info Section */}
              <div className="mt-auto border-t-2 border-slate-800 pt-8 flex items-start justify-between">
                <div className="max-w-[60%]">
                  <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-slate-500">Payment Details</h3>
                  <div className="space-y-3 text-lg text-slate-900">
                    <p className="flex items-center gap-3"><span className="font-bold w-24 text-slate-600">Method</span> UPI Transfer</p>
                    <p className="flex items-center gap-3"><span className="font-bold w-24 text-slate-600">UPI ID</span> <span className="font-mono bg-slate-100 px-2 py-1 rounded text-base">tilakpopat2007-1@okaxis</span></p>
                    <p className="flex items-center gap-3"><span className="font-bold w-24 text-slate-600">Name</span> Tilak Popat</p>
                  </div>
                  <div className="mt-8 text-sm italic text-slate-500 leading-relaxed max-w-md">
                    Thank you for your business! Please process the payment within 7 days of receiving this invoice.
                  </div>
                </div>
                <div className="bg-white p-3 border border-slate-200 shadow-sm rounded-xl flex flex-col items-center">
                  <img 
                    src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=upi://pay?pa=tilakpopat2007-1@okaxis&pn=Tilak%20Popat" 
                    alt="UPI QR Code" 
                    className="w-[140px] h-[140px]"
                    crossOrigin="anonymous"
                  />
                  <p className="text-center text-[10px] font-bold mt-3 text-slate-400 uppercase tracking-widest">Scan to Pay</p>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
