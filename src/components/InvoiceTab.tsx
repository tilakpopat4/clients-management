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
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
          <div className="transform scale-[0.6] sm:scale-[0.7] md:scale-[0.8] xl:scale-[0.9] origin-top transition-transform duration-300">
            
            {/* The actual A4 element captured by html2pdf */}
            <div 
              id="invoice-preview-capture" 
              className="bg-white shadow-2xl relative"
              style={{ 
                width: '210mm', 
                minHeight: '297mm', 
                padding: '20mm',
                fontFamily: '"Times New Roman", Times, serif',
                color: '#000000',
                boxSizing: 'border-box'
              }}
            >
              {/* Invoice Header */}
              <div className="border-b-2 border-black pb-8 mb-8 flex justify-between items-end">
                <div>
                  <h1 className="text-5xl font-bold uppercase tracking-wider mb-2 text-black" style={{ letterSpacing: '2px' }}>
                    Invoice Of Editing
                  </h1>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold mb-1">Tilak Popat</p>
                  <p className="text-lg">+91 78749 03810</p>
                </div>
              </div>
              
              {/* Invoice Meta & Bill To */}
              <div className="flex justify-between mb-12">
                <div>
                  <h2 className="text-xl font-bold mb-2 uppercase border-b border-gray-300 pb-1 inline-block">Bill To:</h2>
                  {selectedClient ? (
                    <div className="mt-2 text-lg leading-relaxed">
                      <p className="font-bold text-xl">{selectedClient.name}</p>
                      {selectedClient.phone && <p>{selectedClient.phone}</p>}
                      {selectedClient.email && <p>{selectedClient.email}</p>}
                    </div>
                  ) : (
                    <div className="mt-2 text-lg text-gray-400 italic">
                      Client details will appear here
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <span className="font-bold">Date: </span> 
                    <span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>
                  <div>
                    <span className="font-bold">Invoice No: </span> 
                    <span>#INV-{String(invoices.length + 1).padStart(4, '0')}</span>
                  </div>
                </div>
              </div>
              
              {/* Line Items Table */}
              <div className="mb-12">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black">
                      <th className="py-3 px-2 font-bold text-lg w-1/2">Description</th>
                      <th className="py-3 px-2 font-bold text-lg text-center">Qty</th>
                      <th className="py-3 px-2 font-bold text-lg text-right">Rate</th>
                      <th className="py-3 px-2 font-bold text-lg text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reels.map((reel, idx) => (
                      <tr key={reel.id} className="border-b border-gray-300">
                        <td className="py-4 px-2 text-lg break-words pr-4">
                          {reel.title || <span className="text-gray-400 italic">Item description...</span>}
                        </td>
                        <td className="py-4 px-2 text-lg text-center">{reel.quantity}</td>
                        <td className="py-4 px-2 text-lg text-right">₹{reel.rate.toLocaleString('en-IN')}</td>
                        <td className="py-4 px-2 text-lg text-right font-medium">
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
                  <div className="flex justify-between border-b border-gray-300 py-2 text-lg">
                    <span>Subtotal:</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between border-b-2 border-black py-4 text-2xl font-bold mt-2">
                    <span>Total Due:</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              
              {/* Payment Info Section (Bottom of page usually, but here fixed visually) */}
              <div className="mt-8 border-2 border-black p-6 flex items-center justify-between bg-gray-50/50">
                <div className="max-w-[60%]">
                  <h3 className="text-2xl font-bold mb-4 uppercase">Payment Details</h3>
                  <div className="space-y-2 text-lg">
                    <p><span className="font-bold">Scan to Pay via UPI</span></p>
                    <p><span className="font-bold">UPI ID:</span> tilakpopat2007-1@okaxis</p>
                    <p><span className="font-bold">Name:</span> Tilak Popat</p>
                  </div>
                  <div className="mt-6 text-sm italic text-gray-600">
                    Thank you for your business! Please process payment within 7 days.
                  </div>
                </div>
                <div className="bg-white p-2 border border-gray-200 shadow-sm">
                  <img 
                    src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=upi://pay?pa=tilakpopat2007-1@okaxis&pn=Tilak%20Popat" 
                    alt="UPI QR Code" 
                    className="w-[180px] h-[180px]"
                    crossOrigin="anonymous"
                  />
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
