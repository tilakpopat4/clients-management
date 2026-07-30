import React, { useState } from 'react';
import { Client, Invoice, WorkItem } from '../types';
import { 
  ArrowLeft, Calendar, Phone, Mail, Edit3, CheckCircle2, Clock, 
  IndianRupee, Plus, AlertTriangle, Send, FileText, ClipboardList,
  Sparkles, ShieldAlert, DollarSign, Copy
} from 'lucide-react';
import { User } from 'firebase/auth';
import { useFirestore } from '../hooks/useFirestore';
import { 
  getPaymentStatusInfo, 
  calculateClientFinancials, 
  generateWhatsAppReminder,
  generateEmailReminder,
  generateInvoiceEmailDetails,
  triggerBrowserOverdueAlert
} from '../lib/paymentUtils';
import { generateUUID } from '../lib/utils';

interface ClientDashboardProps {
  client: Client;
  user: User | null;
  onBack: () => void;
  onEditClient: (client: Client) => void;
}

export default function ClientDashboard({ client, user, onBack, onEditClient }: ClientDashboardProps) {
  const { data: invoices, addOrUpdateItem: updateInvoice } = useFirestore<Invoice>('invoices', user?.uid);
  const { data: workItems, addOrUpdateItem: updateWorkItem, removeItem: removeWorkItem } = useFirestore<WorkItem>('workItems', user?.uid);
  const { addOrUpdateItem: updateClient } = useFirestore<Client>('clients', user?.uid);

  const [activeTab, setActiveTab] = useState<'work' | 'invoices' | 'settings'>('work');
  
  // Payment Date update state
  const [isUpdatingPaymentDate, setIsUpdatingPaymentDate] = useState(false);
  const [newPaymentDate, setNewPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [markPendingAsPaid, setMarkPendingAsPaid] = useState(true);

  const openPaymentModal = () => {
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setIsUpdatingPaymentDate(true);
  };

  // New Work Log modal state inside client dashboard
  const [isWorkFormOpen, setIsWorkFormOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [workFormData, setWorkFormData] = useState({
    description: '',
    quantity: '1',
    rate: String(client.defaultRate),
    date: new Date().toISOString().split('T')[0]
  });

  // Calculate financials & payment status
  const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
  const clientWorkItems = workItems.filter(item => item.clientId === client.id);
  
  const financials = calculateClientFinancials(client.id, invoices, workItems);
  const statusInfo = getPaymentStatusInfo(client, invoices, workItems);

  // Save new payment date
  const handleSavePaymentDate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedTimestamp = new Date(newPaymentDate).getTime();
      const updatedClient: Client = {
        ...client,
        lastPaymentDate: selectedTimestamp
      };

      await updateClient(updatedClient);

      // Optionally mark pending invoices for this client as Paid
      if (markPendingAsPaid) {
        for (const inv of financials.pendingInvoices) {
          await updateInvoice({ ...inv, status: 'Paid' });
        }
      }

      setIsUpdatingPaymentDate(false);
      alert("Payment date updated successfully!");
    } catch (err: any) {
      console.error(err);
      alert("Failed to update payment date: " + (err?.message || String(err)));
    }
  };

  const handleStartEditWork = (item: WorkItem) => {
    setEditingWorkId(item.id);
    setWorkFormData({
      description: item.description,
      quantity: String(item.quantity),
      rate: String(item.rate),
      date: new Date(item.date).toISOString().split('T')[0]
    });
    setIsWorkFormOpen(true);
  };

  const handleCancelWorkForm = () => {
    setEditingWorkId(null);
    setWorkFormData({
      description: '',
      quantity: '1',
      rate: String(client.defaultRate),
      date: new Date().toISOString().split('T')[0]
    });
    setIsWorkFormOpen(false);
  };

  // Add or update work log for this specific client
  const handleSaveWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedRate = Number(workFormData.rate) || client.defaultRate;
      const selectedQty = Number(workFormData.quantity);
      const selectedDate = new Date(workFormData.date).getTime();

      if (editingWorkId) {
        const existing = workItems.find(w => w.id === editingWorkId);
        if (existing) {
          const updatedWork: WorkItem = {
            ...existing,
            description: workFormData.description,
            quantity: selectedQty,
            rate: selectedRate,
            date: selectedDate
          };

          // If item is invoiced, update the corresponding invoice reel details as well
          if (existing.status === 'Invoiced' && existing.invoiceId) {
            const invoice = invoices.find(inv => inv.id === existing.invoiceId);
            if (invoice && invoice.reels) {
              let replaced = false;
              const updatedReels = invoice.reels.map((reel: any) => {
                if (!replaced && reel.title === existing.description && reel.quantity === existing.quantity && reel.rate === existing.rate) {
                  replaced = true;
                  return {
                    ...reel,
                    title: workFormData.description,
                    quantity: selectedQty,
                    rate: selectedRate
                  };
                }
                return reel;
              });

              const newSubtotal = updatedReels.reduce((sum: number, r: any) => sum + (r.quantity * r.rate), 0);
              const discount = invoice.discountAmount || 0;
              const newTotal = Math.max(0, newSubtotal - discount);

              await updateInvoice({
                ...invoice,
                reels: updatedReels,
                totalAmount: newTotal
              });
            }
          }

          await updateWorkItem(updatedWork);
        }
      } else {
        const newWork: WorkItem = {
          id: generateUUID(),
          clientId: client.id,
          description: workFormData.description,
          quantity: selectedQty,
          rate: selectedRate,
          date: selectedDate,
          status: 'Uninvoiced',
          createdAt: Date.now()
        };

        await updateWorkItem(newWork);
      }

      handleCancelWorkForm();
    } catch (err: any) {
      console.error(err);
      alert("Error saving work item: " + (err?.message || String(err)));
    }
  };

  const handleDeleteWork = async (id: string) => {
    if (confirm("Are you sure you want to delete this work item?")) {
      await removeWorkItem(id);
    }
  };

  const formattedLastPaymentDate = client.lastPaymentDate
    ? new Date(client.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Not Recorded';

  const formattedNextDueDate = new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all hover:bg-slate-50 w-fit"
        >
          <ArrowLeft size={16} />
          Back to Client Directory
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditClient(client)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all shadow-sm"
          >
            <Edit3 size={14} /> Edit Client Info
          </button>
          
          <button
            onClick={openPaymentModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
          >
            <Calendar size={14} /> Update Payment Date
          </button>
        </div>
      </div>

      {/* Main Client Profile Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{client.name}</h1>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.badgeClass}`}>
                  <Clock size={12} /> {statusInfo.label}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-slate-400" /> {client.phone}
                </span>
                {client.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={14} className="text-slate-400" /> {client.email}
                  </span>
                )}
                <span className="text-slate-400">
                  Client since: {new Date(client.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Quick Email Reminders Toggle */}
            <button
              onClick={async () => {
                try {
                  const updated = { ...client, emailRemindersEnabled: client.emailRemindersEnabled === false ? true : false };
                  await updateClient(updated);
                } catch (err) {
                  console.error(err);
                }
              }}
              className={`flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                client.emailRemindersEnabled !== false 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100' 
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
              title="Toggle email reminders for overdue payments"
            >
              <div className="flex items-center gap-1.5">
                <Mail size={14} className={client.emailRemindersEnabled !== false ? 'text-indigo-600' : 'text-slate-400'} />
                <span>Email Reminders: {client.emailRemindersEnabled !== false ? 'ON' : 'OFF'}</span>
              </div>
            </button>

            <a
              href={generateWhatsAppReminder(client, statusInfo)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              <Send size={14} /> Send WhatsApp Reminder
            </a>
          </div>
        </div>
      </div>

      {/* Payment Reminder / Alert Notification Banner (when notification is required) */}
      {statusInfo.isNotificationRequired && (
        <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          statusInfo.severity === 'critical' 
            ? 'bg-red-50 border-red-200 text-red-900' 
            : statusInfo.severity === 'urgent' 
            ? 'bg-orange-50 border-orange-200 text-orange-900' 
            : statusInfo.severity === 'delayed'
            ? 'bg-purple-50 border-purple-200 text-purple-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${
              statusInfo.severity === 'critical' ? 'bg-red-100 text-red-600' :
              statusInfo.severity === 'urgent' ? 'bg-orange-100 text-orange-600' :
              statusInfo.severity === 'delayed' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'
            }`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold">{statusInfo.notificationTitle}</h4>
                {client.emailRemindersEnabled !== false && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Email Reminders Active
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5 opacity-90">{statusInfo.notificationMessage}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={openPaymentModal}
              className="px-3 py-1.5 bg-white border border-current rounded-lg text-xs font-bold hover:opacity-90 shadow-sm"
            >
              Record Payment
            </button>
            <a
              href={generateWhatsAppReminder(client, statusInfo)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-1"
            >
              <Send size={12} /> WhatsApp
            </a>
            {client.emailRemindersEnabled !== false && (
              <a
                href={generateEmailReminder(client, statusInfo).mailtoLink}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-1"
              >
                <Mail size={12} /> Send Email
              </a>
            )}
            <button
              onClick={() => triggerBrowserOverdueAlert(client.name, statusInfo.label, statusInfo.notificationMessage, user?.uid)}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 shadow-sm flex items-center gap-1 cursor-pointer"
              title="Trigger FCM Device Notification"
            >
              <AlertTriangle size={12} /> FCM Device Push
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Previous Payment Date */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Previous Payment Date</span>
            <Calendar size={16} className="text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formattedLastPaymentDate}</div>
          <button 
            onClick={openPaymentModal}
            className="text-xs text-indigo-600 font-semibold hover:underline"
          >
            Change date
          </button>
        </div>

        {/* Next Payment Due Date */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Next Payment Due</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formattedNextDueDate}</div>
          <div className="text-xs font-medium text-slate-500">
            {statusInfo.daysRemaining === 0 ? 'Due Today!' : statusInfo.daysRemaining > 0 ? `In ${statusInfo.daysRemaining} days` : `${Math.abs(statusInfo.daysRemaining)} days overdue`}
          </div>
        </div>

        {/* Pending Due Balance */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Pending Balance</span>
            <IndianRupee size={16} className="text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600">₹{financials.totalPendingAmount.toLocaleString('en-IN')}</div>
          <div className="text-xs text-slate-500">
            {financials.pendingInvoices.length} pending inv, {financials.uninvoicedWork.length} un-invoiced
          </div>
        </div>

        {/* Lifetime Paid Billed */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Total Lifetime Billed</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600">₹{financials.paidTotal.toLocaleString('en-IN')}</div>
          <div className="text-xs text-slate-500">From paid invoices</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 pt-4 flex gap-6">
          <button
            onClick={() => setActiveTab('work')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'work'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList size={16} /> Work Logs ({clientWorkItems.length})
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'invoices'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={16} /> Invoices ({clientInvoices.length})
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign size={16} /> Client Rates & Info
          </button>
        </div>

        {/* Tab 1: Work Logs */}
        {activeTab === 'work' && (
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Work Logs for {client.name}</h3>
                <p className="text-xs text-slate-500">Track all completed video edits and services specifically for this client.</p>
              </div>

              <button
                onClick={() => setIsWorkFormOpen(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm"
              >
                <Plus size={14} /> Log Work for {client.name.split(' ')[0]}
              </button>
            </div>

            {/* Quick Add / Edit Work Modal inside Client Dashboard */}
            {isWorkFormOpen && (
              <div className="bg-slate-50 p-5 rounded-xl border border-indigo-200 space-y-4 animate-in fade-in">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-900">{editingWorkId ? 'Edit Work Entry' : 'Add New Work Entry'}</h4>
                  <button onClick={handleCancelWorkForm} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <form onSubmit={handleSaveWorkLog} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Work Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Wedding Highlight Reel Edit"
                      value={workFormData.description}
                      onChange={e => setWorkFormData({ ...workFormData, description: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Quantity *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={workFormData.quantity}
                      onChange={e => setWorkFormData({ ...workFormData, quantity: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Rate (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={workFormData.rate}
                      onChange={e => setWorkFormData({ ...workFormData, rate: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Completion Date *</label>
                    <input
                      type="date"
                      required
                      value={workFormData.date}
                      onChange={e => setWorkFormData({ ...workFormData, date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2 flex items-end justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCancelWorkForm}
                      className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-all shadow-sm"
                    >
                      {editingWorkId ? 'Save Changes' : 'Save Work Log'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Work Items Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Description</th>
                    <th className="p-3.5 text-right">Quantity & Rate</th>
                    <th className="p-3.5 text-right">Total</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {clientWorkItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No work items logged for this client yet.
                      </td>
                    </tr>
                  ) : (
                    clientWorkItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 text-slate-600">
                          {new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-3.5 font-medium text-slate-900">{item.description}</td>
                        <td className="p-3.5 text-right text-slate-600">
                          {item.quantity} × ₹{item.rate.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-900">
                          ₹{(item.quantity * item.rate).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3.5 text-center">
                          {item.status === 'Invoiced' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} /> Invoiced
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock size={12} /> Uninvoiced
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleStartEditWork(item)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteWork(item.id)}
                            className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Invoices */}
        {activeTab === 'invoices' && (
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Invoices for {client.name}</h3>
                <p className="text-xs text-slate-500">History of generated PDF invoices and payment statuses.</p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="p-3.5">Invoice Date</th>
                    <th className="p-3.5">Reels / Line Items</th>
                    <th className="p-3.5 text-right">Total Amount</th>
                    <th className="p-3.5 text-center">Payment Status</th>
                    <th className="p-3.5 text-right">Email Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {clientInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No invoices generated for this client yet.
                      </td>
                    </tr>
                  ) : (
                    clientInvoices.map(inv => {
                      const emailData = generateInvoiceEmailDetails(client, inv, null);

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="p-3.5 text-slate-600">
                            <div className="font-semibold text-slate-900">#{inv.id.substring(0, 8).toUpperCase()}</div>
                            <div className="text-xs text-slate-500">{new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                          </td>
                          <td className="p-3.5 text-slate-900">
                            <div className="font-medium">{inv.reels.length} item(s)</div>
                            <div className="text-xs text-slate-500 truncate max-w-xs">
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
                                await updateInvoice({ ...inv, status: newStatus });
                                if (newStatus === 'Paid') {
                                  const pDate = inv.date || Date.now();
                                  await updateClient({ ...client, lastPaymentDate: pDate });
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-transform hover:scale-105 ${
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
                              <a
                                href={emailData.mailtoLink}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                                title="Send Email for this Invoice"
                              >
                                <Mail size={13} /> Send Email
                              </a>

                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`Subject: ${emailData.subject}\n\n${emailData.body}`);
                                  alert(`Invoice email details for ${client.name} copied to clipboard!`);
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Client Settings & Rates */}
        {activeTab === 'settings' && (
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Rates & Contact Info</h3>
                <p className="text-xs text-slate-500">Configured pricing rates for video services for this client.</p>
              </div>

              <button
                onClick={() => onEditClient(client)}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
              >
                <Edit3 size={14} /> Modify Rates
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Default Reel Rate</span>
                <div className="text-xl font-bold text-indigo-600">₹{client.defaultRate.toLocaleString('en-IN')}</div>
                <span className="text-xs text-slate-400">Per video edit</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">On Site Shoot Rate</span>
                <div className="text-xl font-bold text-indigo-600">
                  {client.onSiteShootRate ? `₹${client.onSiteShootRate.toLocaleString('en-IN')}` : 'Not Set'}
                </div>
                <span className="text-xs text-slate-400">Per shoot day</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Website Making Rate</span>
                <div className="text-xl font-bold text-indigo-600">
                  {client.websiteMakingRate ? `₹${client.websiteMakingRate.toLocaleString('en-IN')}` : 'Not Set'}
                </div>
                <span className="text-xs text-slate-400">Per website project</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Update Payment Date Modal */}
      {isUpdatingPaymentDate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Update Previous Payment Date</h3>
              <button 
                onClick={() => setIsUpdatingPaymentDate(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Recording the date when this client last paid updates the 30-day payment cycle. The next due date will automatically shift 30 days after this date.
            </p>

            <form onSubmit={handleSavePaymentDate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Payment Received Date *</label>
                <input
                  type="date"
                  required
                  value={newPaymentDate}
                  onChange={e => setNewPaymentDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 outline-none focus:border-indigo-600 font-medium"
                />
              </div>

              {financials.pendingInvoices.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    id="markPaidCheckbox"
                    checked={markPendingAsPaid}
                    onChange={e => setMarkPendingAsPaid(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <label htmlFor="markPaidCheckbox" className="cursor-pointer font-medium">
                    Also mark all {financials.pendingInvoices.length} pending invoice(s) (₹{financials.pendingInvoiceTotal.toLocaleString('en-IN')}) as Paid
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUpdatingPaymentDate(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                >
                  Save & Update Cycle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
