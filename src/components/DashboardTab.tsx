import React, { useState, useMemo, useRef } from 'react';
import { Invoice, WorkItem, Client } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { IndianRupee, Clock, TrendingUp, CheckCircle2, DownloadCloud, UploadCloud, AlertTriangle, Send, Users, ArrowRight, Mail, Bell, Copy, Smartphone } from 'lucide-react';
import { User } from 'firebase/auth';
import { useFirestore } from '../hooks/useFirestore';
import { 
  getPaymentStatusInfo, 
  calculateClientFinancials, 
  generateWhatsAppReminder,
  generateEmailReminder,
  triggerBrowserOverdueAlert
} from '../lib/paymentUtils';
import { registerFcmDeviceToken, triggerFcmPaymentReminder } from '../lib/fcmService';
import StickyNotesWidget from './StickyNotesWidget';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface DashboardTabProps {
  user: User | null;
  onNavigateToClients?: () => void;
}

export default function DashboardTab({ user, onNavigateToClients }: DashboardTabProps) {
  const { data: clients, addOrUpdateItem: updateClient } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices, loading, addOrUpdateItem, removeItem, batchReplaceAll } = useFirestore<Invoice>('invoices', user?.uid);
  const { batchReplaceAll: batchReplaceClients } = useFirestore<any>('clients', user?.uid);
  const { data: workItems, addOrUpdateItem: updateWorkItem } = useFirestore<WorkItem>('workItems', user?.uid);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toastAlert, setToastAlert] = useState<{ title: string; body: string; type: 'success' | 'warning' } | null>(null);
  const [isFcmRegistering, setIsFcmRegistering] = useState(false);

  const handleRegisterFcmDevice = async () => {
    setIsFcmRegistering(true);
    try {
      const res = await registerFcmDeviceToken(user?.uid);
      if (res.token) {
        setToastAlert({
          title: 'FCM Device Registered!',
          body: 'Firebase Cloud Messaging device token saved. Overdue payment reminders will push directly to this device.',
          type: 'success'
        });
      } else {
        alert(res.error || 'Failed to register FCM device token.');
      }
    } catch (err: any) {
      alert('Error registering FCM device: ' + (err?.message || String(err)));
    } finally {
      setIsFcmRegistering(false);
    }
  };

  // Client statuses & notifications
  const clientStatuses = useMemo(() => {
    return clients.map(c => ({
      client: c,
      statusInfo: getPaymentStatusInfo(c, invoices, workItems),
      financials: calculateClientFinancials(c.id, invoices, workItems)
    }));
  }, [clients, invoices, workItems]);

  const activeNotifications = useMemo(() => {
    return clientStatuses.filter(cs => cs.statusInfo.isNotificationRequired);
  }, [clientStatuses]);

  // Calculate metrics for current month
  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalEarned = 0;
    let totalDue = 0;
    let totalInvoicesThisMonth = 0;
    
    const clientRevenueMap = new Map<string, number>();

    invoices.forEach(inv => {
      const invDate = new Date(inv.date);
      const isCurrentMonth = invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
      
      if (isCurrentMonth) {
        totalInvoicesThisMonth++;
        if (inv.status === 'Paid') {
          totalEarned += inv.totalAmount;
        } else {
          totalDue += inv.totalAmount;
        }
        
        const current = clientRevenueMap.get(inv.clientName) || 0;
        clientRevenueMap.set(inv.clientName, current + inv.totalAmount);
      }
    });

    const chartData = Array.from(clientRevenueMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { totalEarned, totalDue, totalInvoicesThisMonth, chartData };
  }, [invoices]);

  const toggleInvoiceStatus = async (id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (inv) {
      const nextStatus = inv.status === 'Paid' ? 'Pending' : 'Paid';
      await addOrUpdateItem({ ...inv, status: nextStatus });
      if (nextStatus === 'Paid') {
        const clientObj = clients.find(c => c.id === inv.clientId || c.name === inv.clientName);
        if (clientObj) {
          const pDate = inv.date || Date.now();
          await updateClient({ ...clientObj, lastPaymentDate: pDate });
        }
      }
    }
  };

  const deleteInvoice = async (id: string) => {
    if (confirm('Are you sure you want to delete this invoice record?')) {
      try {
        const linkedWork = workItems.filter(w => w.invoiceId === id);
        for (const item of linkedWork) {
          const updatedItem = { ...item };
          delete updatedItem.invoiceId;
          updatedItem.status = 'Uninvoiced';
          await updateWorkItem(updatedItem);
        }
        await removeItem(id);
      } catch (err: any) {
        console.error("Error resetting work items on invoice deletion:", err);
        alert("Failed to reset work items: " + (err?.message || String(err)));
      }
    }
  };

  const handleExport = () => {
    const data = {
      clients: localStorage.getItem('clients') || '[]',
      monthlyWork: JSON.stringify(invoices),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.clients) {
          const parsedClients = typeof data.clients === 'string' ? JSON.parse(data.clients) : data.clients;
          await batchReplaceClients(parsedClients);
        }
        if (data.monthlyWork) {
           const parsedWork = typeof data.monthlyWork === 'string' ? JSON.parse(data.monthlyWork) : data.monthlyWork;
           await batchReplaceAll(parsedWork);
        }
        alert("Data imported successfully!");
      } catch (err) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const migrateLocalData = async () => {
    try {
      const localClients = localStorage.getItem('clients');
      if (localClients) {
        const parsedClients = JSON.parse(localClients);
        if (parsedClients.length > 0) {
          await batchReplaceClients(parsedClients);
        }
      }
      const localInvoices = localStorage.getItem('monthlyWork');
      if (localInvoices) {
        const parsedInvoices = JSON.parse(localInvoices);
        if (parsedInvoices.length > 0) {
          await batchReplaceAll(parsedInvoices);
        }
      }
      localStorage.removeItem('clients');
      localStorage.removeItem('monthlyWork');
      alert("Local data successfully migrated to Cloud!");
    } catch(err) {
      alert("Error migrating data.");
    }
  };

  const recentInvoices = [...invoices].sort((a, b) => b.date - a.date);

  if (loading) {
    return <div className="p-8 max-w-7xl mx-auto text-center py-20"><div className="animate-pulse flex items-center justify-center space-x-2"><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div></div></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h2>
          <p className="text-slate-500 mt-1">Overview of your monthly earnings, client payment cycles & due reminders.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {(localStorage.getItem('clients') || localStorage.getItem('monthlyWork')) ? (
            <button 
              onClick={migrateLocalData}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors shadow-sm"
            >
              <UploadCloud size={16} /> Migrate Local Data
            </button>
          ) : null}
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-sm font-medium transition-colors shadow-sm"
          >
            <DownloadCloud size={16} /> Export Sync
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-sm font-medium transition-colors shadow-sm"
          >
            <UploadCloud size={16} /> Import Sync
          </button>
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
          />
        </div>
      </div>

      {/* Toast Notification Floating Banner */}
      {toastAlert && (
        <div className="fixed top-5 right-5 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-indigo-500/50 animate-in fade-in slide-in-from-top-4 flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl shrink-0 mt-0.5">
            <Bell size={18} className="animate-bounce" />
          </div>
          <div className="flex-1 space-y-0.5">
            <h5 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">{toastAlert.title}</h5>
            <p className="text-xs text-slate-200 leading-relaxed">{toastAlert.body}</p>
          </div>
          <button
            onClick={() => setToastAlert(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>
      )}



      {activeNotifications.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-amber-900 font-bold text-base">
              <AlertTriangle className="text-amber-600 animate-bounce" size={20} />
              <span>Payment Cycle Reminders ({activeNotifications.length} Client(s) Need Follow-up)</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRegisterFcmDevice}
                disabled={isFcmRegistering}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                title="Register this device for Firebase Cloud Messaging (FCM) push notifications"
              >
                <Smartphone size={13} /> {isFcmRegistering ? 'Registering...' : 'Register FCM Device'}
              </button>

              <button
                onClick={() => {
                  activeNotifications.forEach(({ client, statusInfo }) => {
                    if (client.emailRemindersEnabled !== false) {
                      triggerBrowserOverdueAlert(client.name, statusInfo.label, statusInfo.notificationMessage, user?.uid);
                    }
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
                title="Send FCM device push notifications for all overdue client payment reminders"
              >
                <Bell size={13} /> Trigger All FCM Alerts
              </button>

              {onNavigateToClients && (
                <button 
                  onClick={onNavigateToClients}
                  className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View Directory <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeNotifications.map(({ client, statusInfo, financials }) => {
              const emailData = generateEmailReminder(client, statusInfo);
              const isEmailEnabled = client.emailRemindersEnabled !== false;

              return (
                <div 
                  key={client.id}
                  className="bg-white p-4 rounded-xl border border-amber-200 flex flex-col justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">{client.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusInfo.badgeClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                      <div>Due Date: <span className="font-semibold text-slate-800">{new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN')}</span></div>
                      {financials.totalPendingAmount > 0 && (
                        <div>Pending Balance: <span className="font-bold text-rose-600">₹{financials.totalPendingAmount.toLocaleString('en-IN')}</span></div>
                      )}
                      <div className="pt-1 flex items-center gap-1.5 text-[11px]">
                        <span className={`w-2 h-2 rounded-full ${isEmailEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}></span>
                        <span className="text-slate-600">Email Reminders: <strong className={isEmailEnabled ? 'text-indigo-700' : 'text-slate-500'}>{isEmailEnabled ? 'Enabled' : 'Disabled'}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      <a
                        href={generateWhatsAppReminder(client, statusInfo)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
                        title="Send WhatsApp Reminder"
                      >
                        <Send size={13} />
                      </a>

                      {isEmailEnabled && (
                        <a
                          href={emailData.mailtoLink}
                          className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                          title="Draft Email Reminder"
                        >
                          <Mail size={13} />
                        </a>
                      )}

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`Subject: ${emailData.subject}\n\n${emailData.body}`);
                          alert(`Email reminder template for ${client.name} copied to clipboard!`);
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                        title="Copy Email Text to Clipboard"
                      >
                        <Copy size={13} />
                      </button>

                      <button
                        onClick={() => triggerBrowserOverdueAlert(client.name, statusInfo.label, statusInfo.notificationMessage, user?.uid)}
                        className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        title="Trigger FCM Device Notification"
                      >
                        <Bell size={13} />
                      </button>
                    </div>

                    {onNavigateToClients && (
                      <button
                        onClick={onNavigateToClients}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline"
                      >
                        Open Profile
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <IndianRupee size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Total Earned This Month</p>
            <h3 className="text-3xl font-bold text-slate-900">₹{metrics.totalEarned.toLocaleString('en-IN')}</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Total Amount Due</p>
            <h3 className="text-3xl font-bold text-slate-900">₹{metrics.totalDue.toLocaleString('en-IN')}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Invoices This Month</p>
            <h3 className="text-3xl font-bold text-slate-900">{metrics.totalInvoicesThisMonth}</h3>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-6">Monthly Work Distribution</h3>
          <div className="flex-1 min-h-[300px]">
            {metrics.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4b5563' }} width={80} />
                  <Tooltip 
                    cursor={{fill: '#f9fafb'}}
                    formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {metrics.chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 text-center">
                No data available for this month.<br/>Generate invoices to see the chart.
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Recent Invoices</h3>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No invoices generated yet.
                    </td>
                  </tr>
                ) : recentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div>{inv.clientName}</div>
                      {inv.discountAmount && (
                        <div className="text-xs text-rose-500 font-normal mt-0.5">
                          Deduction: -₹{inv.discountAmount.toLocaleString('en-IN')}{inv.discountDescription ? ` (${inv.discountDescription})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      ₹{inv.totalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleInvoiceStatus(inv.id)}
                        title="Click to toggle payment status"
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                          inv.status === 'Paid' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {inv.status === 'Paid' && <CheckCircle2 size={12} />}
                        {inv.status}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button
                        onClick={() => toggleInvoiceStatus(inv.id)}
                        className={`text-xs font-semibold hover:underline ${
                          inv.status === 'Paid' 
                            ? 'text-amber-600 hover:text-amber-800' 
                            : 'text-emerald-600 hover:text-emerald-800'
                        }`}
                      >
                        {inv.status === 'Paid' ? 'Mark Pending' : 'Approve Payment'}
                      </button>
                      <button
                        onClick={() => deleteInvoice(inv.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sticky Notes Widget */}
      <StickyNotesWidget user={user} clients={clients} />
    </div>
  );
}
