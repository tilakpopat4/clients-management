import React, { useState, useRef } from 'react';
import { Client, Reel, Invoice } from '../types';
import { Plus, Trash2, Download, Receipt } from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';

interface InvoiceTabProps {
  user: User | null;
}

export default function InvoiceTab({ user }: InvoiceTabProps) {
  const { data: clients, loading: clientsLoading } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices, addOrUpdateItem } = useFirestore<Invoice>('invoices', user?.uid);
  
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [reels, setReels] = useState<Reel[]>([
    { id: crypto.randomUUID(), title: '', quantity: 1, rate: 0 }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    
    // Automatically apply default rate to all existing reels that don't have a specific rate set
    if (client) {
      setReels(reels.map(r => ({
        ...r,
        rate: r.rate === 0 ? client.defaultRate : r.rate
      })));
    }
  };

  const addItem = (defaultTitle: string, defaultRate: number) => {
    setReels([
      ...reels,
      { id: crypto.randomUUID(), title: defaultTitle, quantity: 1, rate: defaultRate }
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
    
    // Configure PDF options
    const opt = {
      margin:       0,
      filename:     `Invoice_${selectedClient.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(element).save().then(async () => {
      // Save invoice to cloud storage
      const newInvoice: Invoice = {
        id: crypto.randomUUID(),
        date: Date.now(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        reels: [...reels],
        totalAmount: total,
        status: 'Pending'
      };
      
      try {
        await addOrUpdateItem(newInvoice);
      } catch (err) {
        console.error("Error saving to cloud:", err);
      }
      setIsGenerating(false);
      
    }).catch((err: any) => {
      console.error(err);
      setIsGenerating(false);
      alert("An error occurred while generating the PDF.");
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
