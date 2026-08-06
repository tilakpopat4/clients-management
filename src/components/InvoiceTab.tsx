import React, { useState, useEffect, useRef } from 'react';
import { Client, Reel, Invoice, WorkItem, UserProfile } from '../types';
import { Plus, Trash2, Download, Receipt, FileCheck, Mail, Send, Copy, X, Check, MailCheck, CheckCircle2, AlertCircle, Loader2, FileText, Search, Calculator, Divide } from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';
import { generateInvoiceEmailDetails } from '../lib/paymentUtils';
import Logo from './Logo';
import QRCode from 'qrcode';
import { sendEmailWithPdfAttachment, acquireGmailAccessToken } from '../lib/gmailService';

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
  profile: UserProfile | null;
  initialSearchQuery?: string;
}

export default function InvoiceTab({ user, profile, initialSearchQuery = '' }: InvoiceTabProps) {
  const { data: clients, loading: clientsLoading, addOrUpdateItem: updateClient } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices, addOrUpdateItem: addInvoice } = useFirestore<Invoice>('invoices', user?.uid);
  const { data: workItems, addOrUpdateItem: updateWorkItem } = useFirestore<WorkItem>('workItems', user?.uid);
  
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>(initialSearchQuery);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setInvoiceSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}-01`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
  const [reels, setReels] = useState<Reel[]>([]);
  const [linkedWorkItemIds, setLinkedWorkItemIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountDescription, setDiscountDescription] = useState<string>('');
  const [directGrandTotalInput, setDirectGrandTotalInput] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [emailModalData, setEmailModalData] = useState<{
    isOpen: boolean;
    clientName: string;
    clientEmail: string;
    subject: string;
    body: string;
    mailtoLink: string;
    monthCycleStr: string;
    invoiceNo: string;
    totalAmount: number;
    pdfBlob?: Blob;
    pdfFilename?: string;
    gmailStatus?: { sending: boolean; success?: boolean; error?: string; messageId?: string };
  } | null>(null);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (selectedClientId && dateFrom && dateTo) {
      // Find uninvoiced work items for this client in the selected date span
      const uninvoicedWork = workItems.filter(w => {
        if (w.clientId !== selectedClientId) return false;
        if (w.status !== 'Uninvoiced') return false;
        
        const workDate = new Date(w.date);
        const yyyy = workDate.getFullYear();
        const mm = String(workDate.getMonth() + 1).padStart(2, '0');
        const dd = String(workDate.getDate()).padStart(2, '0');
        const workDateStr = `${yyyy}-${mm}-${dd}`;
        
        return workDateStr >= dateFrom && workDateStr <= dateTo;
      });
      
      // Sort work log in ascending chronological order (earliest date first)
      uninvoicedWork.sort((a, b) => (a.date - b.date) || (a.createdAt - b.createdAt));
      
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
  }, [selectedClientId, dateFrom, dateTo, workItems]);

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

  const handleApplyDirectGrandTotal = () => {
    const targetVal = Number(directGrandTotalInput);
    if (isNaN(targetVal) || directGrandTotalInput.trim() === '') {
      alert("Please enter a valid amount for the Grand Total.");
      return;
    }
    if (targetVal < 0) {
      alert("Grand total cannot be negative.");
      return;
    }

    const discount = Number(discountAmount) || 0;
    const targetSubtotal = targetVal + discount;

    if (reels.length === 0) {
      setReels([{ id: generateUUID(), title: 'Video Editing Services', quantity: 1, rate: targetSubtotal }]);
      return;
    }

    const n = reels.length;
    const isTargetInteger = Number.isInteger(targetSubtotal);
    const factor = isTargetInteger ? 1 : 100;

    const totalUnits = Math.round(targetSubtotal * factor);
    const baseUnitsPerReel = Math.floor(totalUnits / n);
    let remainingUnits = totalUnits - (baseUnitsPerReel * n);

    const newReels = reels.map((reel, idx) => {
      const reelUnits = baseUnitsPerReel + (idx < remainingUnits ? 1 : 0);
      const reelTargetAmount = reelUnits / factor;
      const qty = reel.quantity > 0 ? reel.quantity : 1;
      const computedRate = Number((reelTargetAmount / qty).toFixed(2));
      return {
        ...reel,
        rate: computedRate
      };
    });

    setReels(newReels);
  };

  const calculateTotal = () => {
    return reels.reduce((sum, reel) => sum + (reel.quantity * reel.rate), 0);
  };

  const total = calculateTotal();
  const discount = Number(discountAmount) || 0;
  const grandTotal = Math.max(0, total - discount);

  useEffect(() => {
    const payeeName = encodeURIComponent(profile?.name || user?.displayName || 'Video Editor');
    const upiId = profile?.upiId || '';
    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&am=${grandTotal}`;
    QRCode.toDataURL(upiUrl, { width: 260, margin: 1 })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error("Failed to generate QR Code:", err));
  }, [grandTotal, user, profile]);

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
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak:    { mode: ['css', 'legacy'], avoid: ['.avoid-break'] }
    };

    // Temporarily replace oklch colors with rgb colors inline on the original element's children.
    // This maintains visual styling and layout, and prevents blank/empty PDFs because the original element is fully visible in the DOM viewport.
    const originalStyles = new Map<HTMLElement, string>();
    const colorProperties = [
      'color',
      'backgroundColor',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'textDecorationColor',
      'boxShadow',
      'fill',
      'stroke'
    ];

    try {
      const elements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
      for (const el of elements) {
        if (!el.style) continue;
        originalStyles.set(el, el.getAttribute('style') || '');
        const computed = window.getComputedStyle(el);
        for (const prop of colorProperties) {
          try {
            const val = computed[prop as any];
            if (typeof val === 'string' && val.includes('oklch')) {
              const converted = replaceOklchWithRgb(val);
              el.style[prop as any] = converted;
            }
          } catch (e) {
            // ignore individual property errors
          }
        }
      }
    } catch (err) {
      console.warn("Failed to preprocess oklch styles on elements:", err);
    }

    const restoreStyles = () => {
      for (const [el, style] of originalStyles.entries()) {
        try {
          if (style) {
            el.setAttribute('style', style);
          } else {
            el.removeAttribute('style');
          }
        } catch (e) {
          // ignore restore errors
        }
      }
    };

    const worker = html2pdfFunc().set(opt).from(element);

    worker.output('blob').then(async (pdfBlob: Blob) => {
      // Trigger browser download of PDF
      try {
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = opt.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.warn("Blob download fallback:", e);
        await worker.save();
      }

      restoreStyles();

      // Save invoice to cloud storage
      const newInvoice: Invoice = {
        id: generateUUID(),
        date: Date.now(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        reels: [...reels],
        totalAmount: grandTotal,
        status: 'Pending',
        ...(selectedClient.lastPaymentDate ? { lastPaymentDate: selectedClient.lastPaymentDate } : {}),
        ...(discount > 0 ? {
          discountAmount: discount,
          discountDescription: discountDescription.trim() || 'Discount/Deduction'
        } : {})
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
        setDiscountAmount('');
        setDiscountDescription('');

        // Generate email details for this specific month cycle's invoice
        const emailDetails = generateInvoiceEmailDetails(selectedClient, newInvoice, profile, dateFrom, dateTo);

        const targetClientEmail = selectedClient.email ? selectedClient.email.trim() : '';
        let initialGmailStatus: { sending: boolean; success?: boolean; error?: string; messageId?: string } = { sending: false };

        if (targetClientEmail) {
          initialGmailStatus = { sending: true };
          // Attempt background send via Gmail API
          sendEmailWithPdfAttachment({
            to: targetClientEmail,
            subject: emailDetails.subject,
            bodyText: emailDetails.body,
            pdfBlob: pdfBlob,
            pdfFilename: opt.filename
          }).then(res => {
            if (res.success) {
              setEmailModalData(prev => prev ? {
                ...prev,
                gmailStatus: { sending: false, success: true, messageId: res.id }
              } : null);
            } else {
              setEmailModalData(prev => prev ? {
                ...prev,
                gmailStatus: { sending: false, success: false, error: res.error }
              } : null);
            }
          });
        }

        // Display modal with invoice email details and action buttons
        setEmailModalData({
          isOpen: true,
          clientName: selectedClient.name,
          clientEmail: targetClientEmail,
          subject: emailDetails.subject,
          body: emailDetails.body,
          mailtoLink: emailDetails.mailtoLink,
          monthCycleStr: emailDetails.monthCycleStr,
          invoiceNo: emailDetails.invoiceNo,
          totalAmount: grandTotal,
          pdfBlob: pdfBlob,
          pdfFilename: opt.filename,
          gmailStatus: initialGmailStatus
        });
      } catch (err: any) {
        console.error("Error saving to cloud:", err);
        alert("Error saving invoice/work items to cloud: " + (err?.message || String(err)));
      }
      setIsGenerating(false);
      
    }).catch((err: any) => {
      restoreStyles();
      console.error(err);
      setIsGenerating(false);
      alert("An error occurred while generating the PDF: " + (err?.message || String(err)));
    });
  };

  const handleSendGmailManual = async () => {
    if (!emailModalData) return;
    const recipient = emailModalData.clientEmail.trim();
    if (!recipient) {
      alert("Please enter a recipient email address.");
      return;
    }

    setIsSendingGmail(true);
    setEmailModalData(prev => prev ? { ...prev, gmailStatus: { sending: true } } : null);

    try {
      let currentPdfBlob = emailModalData.pdfBlob;
      if (!currentPdfBlob) {
        const element = document.getElementById('invoice-preview-container');
        if (element) {
          try {
            currentPdfBlob = await html2pdf().set({
              margin: [10, 10, 10, 10],
              filename: emailModalData.pdfFilename || `Invoice_${emailModalData.invoiceNo}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, logging: false },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(element).output('blob');
          } catch (e) {
            console.warn("Could not generate on-the-fly PDF blob:", e);
          }
        }
      }

      const token = await acquireGmailAccessToken();
      const res = await sendEmailWithPdfAttachment({
        to: recipient,
        subject: emailModalData.subject,
        bodyText: emailModalData.body,
        pdfBlob: currentPdfBlob,
        pdfFilename: emailModalData.pdfFilename || `Invoice_${emailModalData.invoiceNo}.pdf`,
        accessToken: token
      });

      if (res.success) {
        setEmailModalData(prev => prev ? {
          ...prev,
          gmailStatus: { sending: false, success: true, messageId: res.id }
        } : null);
      } else {
        setEmailModalData(prev => prev ? {
          ...prev,
          gmailStatus: { sending: false, success: false, error: res.error }
        } : null);
      }
    } catch (err: any) {
      console.error("Gmail manual send error:", err);
      setEmailModalData(prev => prev ? {
        ...prev,
        gmailStatus: { sending: false, success: false, error: err?.message || String(err) }
      } : null);
    } finally {
      setIsSendingGmail(false);
    }
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
              
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date From *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date To *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Automatically loads uninvoiced work within this custom date span.</p>
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
            
            {/* Quick Set Direct Grand Total */}
            <div className="mb-5 p-3.5 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-100 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator size={15} className="text-indigo-600" />
                    Direct Grand Total Split
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Enter target grand total to divide equally across all {reels.length} item{reels.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₹</span>
                    <input 
                      type="number" 
                      min="0"
                      placeholder="e.g. 10000"
                      value={directGrandTotalInput}
                      onChange={(e) => setDirectGrandTotalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyDirectGrandTotal();
                        }
                      }}
                      className="w-32 sm:w-36 pl-7 pr-2 py-1.5 text-sm font-semibold border border-indigo-200 rounded-lg bg-white text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-xs"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={handleApplyDirectGrandTotal}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Divide size={13} />
                    Split Equally
                  </button>
                </div>
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

            {/* Discount / Deduction Fields */}
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Discount / Deduction (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deduction Description</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Early payment discount"
                    value={discountDescription}
                    onChange={(e) => setDiscountDescription(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deduction Amount (₹)</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="e.g. 1000"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-sm text-slate-500">
                <span>Subtotal</span>
                <span>₹{total.toLocaleString('en-IN')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm text-rose-500 font-medium">
                  <span>Deduction ({discountDescription.trim() || 'Discount'})</span>
                  <span>-₹{discount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-100">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Grand Total</span>
                <span className="text-2xl font-bold text-slate-900">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
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
                  <p className="text-lg font-medium text-slate-500 tracking-widest uppercase">{profile?.servicesDescription || 'Video Editing Services'}</p>
                </div>
                <div className="w-1/3 flex flex-col items-end text-right">
                  <div className="flex items-center gap-2 mb-1 justify-end">
                    <Logo className="w-8 h-8 rounded-lg shadow-sm" />
                    <p className="text-2xl font-bold text-slate-900">{profile?.name || user?.displayName || 'Video Editor'}</p>
                  </div>
                  {profile?.phone && <p className="text-lg text-slate-700 whitespace-nowrap">{profile.phone}</p>}
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
                  <div className="mb-2 text-lg flex justify-end items-center gap-4">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Date</span> 
                    <span className="font-semibold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>
                  <div className="mb-2 text-lg flex justify-end items-center gap-4">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Invoice No</span> 
                    <span className="font-semibold text-slate-900">#INV-{String(invoices.length + 1).padStart(4, '0')}</span>
                  </div>
                  <div className="text-lg flex justify-end items-center gap-4">
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Last Payment Date</span> 
                    <span className="font-semibold text-slate-900">
                      {selectedClient?.lastPaymentDate 
                        ? new Date(selectedClient.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
                        : 'N/A'}
                    </span>
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
                          <div className="font-medium">{reel.title || <span className="text-slate-400 italic">Item description...</span>}</div>
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
              <div className="flex justify-end mb-16 avoid-break" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="w-1/2">
                  <div className="flex justify-between border-b border-slate-200 py-3 text-lg">
                    <span className="uppercase tracking-widest text-sm font-bold text-slate-500">Subtotal</span>
                    <span className="font-semibold text-slate-800">₹{total.toLocaleString('en-IN')}</span>
                  </div>
                  
                  {discount > 0 && (
                    <div className="flex justify-between border-b border-slate-200 py-3 text-lg text-rose-600 font-medium">
                      <span className="uppercase tracking-widest text-sm font-bold text-rose-500">Deduction {discountDescription ? `(${discountDescription})` : ''}</span>
                      <span>-₹{discount.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-b-2 border-slate-800 py-4 text-2xl font-bold mt-1 text-slate-900">
                    <span className="uppercase tracking-widest text-lg">Total Due</span>
                    <span>₹{grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              
              {/* Payment Info Section */}
              <div className="mt-auto border-t-2 border-slate-800 pt-8 flex items-start justify-between avoid-break" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="max-w-[60%]">
                  <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-slate-500">Payment Details</h3>
                  <div className="space-y-3 text-lg text-slate-900">
                    <p className="flex items-center gap-3"><span className="font-bold w-40 text-slate-600">Method</span> UPI Transfer</p>
                    <p className="flex items-center gap-3"><span className="font-bold w-40 text-slate-600">UPI ID</span> <span className="font-mono bg-slate-100 px-2 py-1 rounded text-base">{profile?.upiId || 'Not specified'}</span></p>
                    <p className="flex items-center gap-3"><span className="font-bold w-40 text-slate-600">Name</span> {profile?.name || user?.displayName || 'Video Editor'}</p>
                    <p className="flex items-center gap-3">
                      <span className="font-bold w-40 text-slate-600">Last Payment Date</span> 
                      <span className="font-semibold text-slate-800">
                        {selectedClient?.lastPaymentDate 
                          ? new Date(selectedClient.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
                          : 'N/A (First Cycle)'}
                      </span>
                    </p>
                  </div>
                  <div className="mt-8 text-sm italic text-slate-500 leading-relaxed max-w-md">
                    Thank you for your business! Please process the payment within 7 days of receiving this invoice.
                  </div>
                </div>
                <div className="bg-white p-3 border border-slate-200 shadow-sm rounded-xl flex flex-col items-center">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="UPI QR Code" 
                      className="w-[140px] h-[140px]"
                    />
                  ) : (
                    <div className="w-[140px] h-[140px] flex items-center justify-center text-slate-300 text-xs italic">
                      Generating QR...
                    </div>
                  )}
                  <p className="text-center text-[10px] font-bold mt-3 text-slate-400 uppercase tracking-widest">Scan to Pay</p>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History & Email Actions Section */}
      <div className="mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt size={20} className="text-indigo-600" />
              Invoice History & Email Dispatch
            </h3>
            <p className="text-xs text-slate-500">
              View generated cycle invoices and resend email notifications with itemized work details.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Local Invoice Search Bar */}
            <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={invoiceSearchQuery}
                onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                placeholder="Filter invoices or client..."
                className="w-full bg-slate-50 text-xs pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
              />
              {invoiceSearchQuery && (
                <button
                  onClick={() => setInvoiceSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 shrink-0">
              {invoices.length} Invoices
            </span>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 space-y-1">
            <p className="text-xs font-semibold text-slate-600">No invoices generated yet</p>
            <p className="text-[11px]">Select a client above and click "Download PDF Invoice" to generate an invoice & send email.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5">Invoice No / Date</th>
                  <th className="p-3.5">Client</th>
                  <th className="p-3.5">Items / Summary</th>
                  <th className="p-3.5 text-right">Total Amount</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Email Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {invoices
                  .filter(inv => {
                    if (!invoiceSearchQuery.trim()) return true;
                    const q = invoiceSearchQuery.toLowerCase().trim();
                    const invNo = inv.id.substring(0, 8).toLowerCase();
                    const itemsText = inv.reels ? inv.reels.map(r => r.title).join(' ').toLowerCase() : '';
                    return inv.clientName.toLowerCase().includes(q) ||
                      invNo.includes(q) ||
                      itemsText.includes(q);
                  })
                  .slice()
                  .sort((a, b) => b.date - a.date)
                  .map((inv) => {
                  const clientObj = clients.find(c => c.id === inv.clientId) || {
                    id: inv.clientId,
                    name: inv.clientName,
                    email: '',
                    phone: '',
                    defaultRate: 0,
                    createdAt: 0
                  };

                  const emailDetails = generateInvoiceEmailDetails(clientObj, inv, profile);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3.5 font-mono text-xs text-slate-700">
                        <div className="font-bold text-slate-900">#{inv.id.substring(0, 8).toUpperCase()}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="p-3.5 font-medium text-slate-900">
                        <div>{inv.clientName}</div>
                        {clientObj.email && (
                          <div className="text-[11px] text-slate-400 font-normal">{clientObj.email}</div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <div className="font-semibold text-xs text-slate-800">{inv.reels.length} item(s)</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {inv.reels.map(r => r.title).join(', ')}
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-900">
                        ₹{inv.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={async () => {
                            const newStatus = inv.status === 'Paid' ? 'Pending' : 'Paid';
                            await addInvoice({ ...inv, status: newStatus });
                            if (newStatus === 'Paid' && clientObj.id) {
                              const pDate = inv.date || Date.now();
                              await updateClient({ ...clientObj, lastPaymentDate: pDate });
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border cursor-pointer transition-transform hover:scale-105 ${
                            inv.status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                          title={`Click to mark as ${inv.status === 'Paid' ? 'Pending' : 'Paid & update last payment date'}`}
                        >
                          {inv.status}
                        </button>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              const pdfFilename = `Invoice_${clientObj.name.replace(/\s+/g, '_')}_${inv.id.substring(0, 8)}.pdf`;
                              setEmailModalData({
                                isOpen: true,
                                clientName: inv.clientName,
                                clientEmail: clientObj.email || '',
                                subject: emailDetails.subject,
                                body: emailDetails.body,
                                mailtoLink: emailDetails.mailtoLink,
                                monthCycleStr: emailDetails.monthCycleStr,
                                invoiceNo: inv.id.substring(0, 8).toUpperCase(),
                                totalAmount: inv.totalAmount,
                                pdfFilename: pdfFilename,
                                gmailStatus: { sending: false }
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                            title="Send Invoice PDF via Gmail"
                          >
                            <Mail size={13} /> Send via Gmail
                          </button>

                          <a
                            href={emailDetails.mailtoLink}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Open Default Mail App"
                          >
                            <Send size={13} />
                          </a>

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`Subject: ${emailDetails.subject}\n\n${emailDetails.body}`);
                              alert(`Invoice email details for ${inv.clientName} copied to clipboard!`);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Copy Email Text to Clipboard"
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Sent / Prepared Modal */}
      {emailModalData && emailModalData.isOpen && (
        <div 
          onClick={() => setEmailModalData(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8 max-h-[90vh] overflow-y-auto cursor-default"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
                  <MailCheck size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Invoice Email & Gmail Delivery for {emailModalData.clientName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cycle: <span className="font-semibold text-slate-700">{emailModalData.monthCycleStr}</span> • Amount: <span className="font-bold text-emerald-600">₹{emailModalData.totalAmount.toLocaleString('en-IN')}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEmailModalData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Gmail Live Status Banner */}
            {emailModalData.gmailStatus?.sending ? (
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2.5 font-medium">
                <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                <span>Sending Invoice PDF directly to <strong>{emailModalData.clientEmail || 'client'}</strong> via Gmail API...</span>
              </div>
            ) : emailModalData.gmailStatus?.success ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="text-emerald-600 w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">Invoice PDF successfully sent via Gmail!</p>
                    <p className="text-[11px] text-emerald-700">Delivered to <strong>{emailModalData.clientEmail}</strong> with PDF attached.</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded">Gmail API</span>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /> Gmail Automatic Delivery Status:
                  </p>
                  {emailModalData.gmailStatus?.error && (
                    <span className="text-[10px] text-rose-600 font-mono font-semibold max-w-xs truncate" title={emailModalData.gmailStatus.error}>
                      {emailModalData.gmailStatus.error}
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {emailModalData.clientEmail 
                    ? "Click 'Send Invoice PDF via Gmail' below to authorize Gmail and send the attached PDF directly to your client." 
                    : "Please enter your client's email address below, then click 'Send Invoice PDF via Gmail'."}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Client Email Address *</label>
                  <input
                    type="email"
                    value={emailModalData.clientEmail}
                    onChange={e => setEmailModalData({ ...emailModalData, clientEmail: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                {emailModalData.pdfFilename && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Attached Document</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">✓ Included in Gmail Send</span>
                    </label>
                    <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-between text-xs font-mono text-slate-700 h-[38px]">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <FileText size={14} className="text-rose-500 shrink-0" />
                        <span className="truncate">{emailModalData.pdfFilename}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {emailModalData.pdfBlob && (
                          <button
                            type="button"
                            onClick={() => {
                              if (emailModalData.pdfBlob) {
                                const url = URL.createObjectURL(emailModalData.pdfBlob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = emailModalData.pdfFilename || 'Invoice.pdf';
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-sans text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                            title="Download Invoice PDF file"
                          >
                            <Download size={12} className="text-indigo-600" /> Save PDF
                          </button>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded">
                          PDF
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Email Subject</label>
                <input
                  type="text"
                  value={emailModalData.subject}
                  onChange={e => setEmailModalData({ ...emailModalData, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Email Message Body</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${emailModalData.subject}\n\n${emailModalData.body}`);
                      alert("Invoice email content copied to clipboard!");
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy Text
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={emailModalData.body}
                  onChange={e => setEmailModalData({ ...emailModalData, body: e.target.value })}
                  className="w-full p-3.5 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono leading-relaxed outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Target: <strong className="text-slate-700">{emailModalData.clientEmail || 'No email entered'}</strong>
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEmailModalData(null)}
                  className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Close
                </button>

                <a
                  href={emailModalData.mailtoLink}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Open Default Mail App"
                >
                  <Send size={15} />
                </a>

                <button
                  type="button"
                  onClick={handleSendGmailManual}
                  disabled={isSendingGmail || emailModalData.gmailStatus?.sending}
                  className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  {isSendingGmail || emailModalData.gmailStatus?.sending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Sending via Gmail...
                    </>
                  ) : (
                    <>
                      <Mail size={14} />
                      Send Invoice PDF via Gmail
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
