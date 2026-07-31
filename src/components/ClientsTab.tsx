import React, { useState } from 'react';
import { Client, Invoice, WorkItem } from '../types';
import { 
  Plus, Edit2, Trash2, CheckCircle2, X, Search, Calendar, 
  Clock, Phone, Mail, ArrowRight, AlertTriangle, Send, ShieldAlert,
  ChevronRight, Filter, Download, Users
} from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';
import { exportClientCSV } from '../lib/csvExport';
import { 
  getPaymentStatusInfo, 
  calculateClientFinancials, 
  generateWhatsAppReminder,
  generateEmailReminder,
  triggerBrowserOverdueAlert
} from '../lib/paymentUtils';
import ClientDashboard from './ClientDashboard';

interface ClientsTabProps {
  user: User | null;
  initialSearchQuery?: string;
  initialSelectedClientId?: string | null;
}

export default function ClientsTab({ user, initialSearchQuery = '', initialSelectedClientId = null }: ClientsTabProps) {
  const { data: clients, loading: clientsLoading, addOrUpdateItem: saveClient, removeItem: deleteClientFromDb } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices } = useFirestore<Invoice>('invoices', user?.uid);
  const { data: workItems } = useFirestore<WorkItem>('workItems', user?.uid);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialSelectedClientId);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterType, setFilterType] = useState<'all' | 'due' | 'uptodate'>('all');
  const [isNotificationDismissed, setIsNotificationDismissed] = useState(false);

  React.useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  React.useEffect(() => {
    if (initialSelectedClientId) {
      setSelectedClientId(initialSelectedClientId);
    }
  }, [initialSelectedClientId]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    defaultRate: '',
    onSiteShootRate: '',
    websiteMakingRate: '',
    lastPaymentDate: new Date().toISOString().split('T')[0],
    emailRemindersEnabled: true
  });

  // Calculate notification alerts across all clients
  const clientStatuses = clients.map(c => ({
    client: c,
    statusInfo: getPaymentStatusInfo(c, invoices, workItems),
    financials: calculateClientFinancials(c.id, invoices, workItems)
  }));

  const notificationClients = clientStatuses.filter(cs => cs.statusInfo.isNotificationRequired);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const paymentDateTimestamp = formData.lastPaymentDate 
        ? new Date(formData.lastPaymentDate).getTime() 
        : Date.now();

      if (isEditing) {
        const existing = clients.find(c => c.id === isEditing);
        if (existing) {
          const updatedClient: Client = { 
            ...existing, 
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            defaultRate: Number(formData.defaultRate),
            lastPaymentDate: paymentDateTimestamp,
            emailRemindersEnabled: formData.emailRemindersEnabled
          };
          
          if (formData.onSiteShootRate) updatedClient.onSiteShootRate = Number(formData.onSiteShootRate);
          else delete updatedClient.onSiteShootRate;
          
          if (formData.websiteMakingRate) updatedClient.websiteMakingRate = Number(formData.websiteMakingRate);
          else delete updatedClient.websiteMakingRate;

          await saveClient(updatedClient);
        }
        setIsEditing(null);
      } else {
        const newClient: Client = { 
          id: generateUUID(), 
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          defaultRate: Number(formData.defaultRate), 
          lastPaymentDate: paymentDateTimestamp,
          emailRemindersEnabled: formData.emailRemindersEnabled,
          createdAt: Date.now() 
        };
        if (formData.onSiteShootRate) newClient.onSiteShootRate = Number(formData.onSiteShootRate);
        if (formData.websiteMakingRate) newClient.websiteMakingRate = Number(formData.websiteMakingRate);

        await saveClient(newClient);
      }
      
      setFormData({ 
        name: '', 
        phone: '', 
        email: '', 
        defaultRate: '', 
        onSiteShootRate: '', 
        websiteMakingRate: '',
        lastPaymentDate: new Date().toISOString().split('T')[0],
        emailRemindersEnabled: true
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      alert("Error saving client: " + (err?.message || String(err)));
    }
  };
  
  const handleEditClient = (c: Client) => {
    setIsEditing(c.id);
    setFormData({ 
      name: c.name, 
      phone: c.phone, 
      email: c.email || '', 
      defaultRate: String(c.defaultRate),
      onSiteShootRate: c.onSiteShootRate ? String(c.onSiteShootRate) : '',
      websiteMakingRate: c.websiteMakingRate ? String(c.websiteMakingRate) : '',
      lastPaymentDate: c.lastPaymentDate ? new Date(c.lastPaymentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      emailRemindersEnabled: c.emailRemindersEnabled !== false
    });
    setIsFormOpen(true);
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete client "${name}"?`)) {
      await deleteClientFromDb(id);
      if (selectedClientId === id) setSelectedClientId(null);
    }
  };
  
  const cancelEdit = () => {
    setIsEditing(null);
    setFormData({ 
      name: '', 
      phone: '', 
      email: '', 
      defaultRate: '', 
      onSiteShootRate: '', 
      websiteMakingRate: '',
      lastPaymentDate: new Date().toISOString().split('T')[0],
      emailRemindersEnabled: true
    });
    setIsFormOpen(false);
  };

  // If a client is selected, render that client's dedicated dashboard!
  const selectedClient = clients.find(c => c.id === selectedClientId);
  if (selectedClient) {
    return (
      <ClientDashboard
        client={selectedClient}
        user={user}
        onBack={() => setSelectedClientId(null)}
        onEditClient={handleEditClient}
      />
    );
  }

  // Filter clients for list/grid view
  const filteredClients = clientStatuses.filter(({ client, statusInfo }) => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          client.phone.includes(searchQuery) ||
                          client.email?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType === 'due') return statusInfo.isNotificationRequired || statusInfo.daysRemaining <= 3;
    if (filterType === 'uptodate') return !statusInfo.isNotificationRequired && statusInfo.daysRemaining > 3;
    return true;
  });

  if (clientsLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto text-center py-20">
        <div className="animate-pulse flex items-center justify-center space-x-2">
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Client Directory & Profiles</h2>
          <p className="text-slate-500 text-sm mt-1">
            Click any client profile to view their individual dashboard, work logs, and 30-day payment cycle.
          </p>
        </div>
        
        {!isFormOpen && (
          <button 
            onClick={() => setIsFormOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm w-full md:w-auto"
          >
            <Plus size={16} />
            Add New Client
          </button>
        )}
      </div>

      {/* Global Payment Reminders Bar across clients (if any client has payment due or delayed) */}
      {!isNotificationDismissed && notificationClients.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3 relative">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5 text-amber-900 font-bold text-sm">
              <AlertTriangle className="text-amber-600 animate-bounce" size={20} />
              <span>Payment Cycle Reminders ({notificationClients.length} Action Required)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 font-medium">30-Day Recurring Cycle Alerts</span>
            </div>
          </div>
          <button
            onClick={() => setIsNotificationDismissed(true)}
            className="absolute top-4 right-4 text-amber-700 hover:text-amber-950 hover:bg-amber-200/60 p-1.5 rounded-lg transition-colors cursor-pointer"
            title="Dismiss notification"
            aria-label="Close notification"
          >
            <X size={16} />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {notificationClients.map(({ client, statusInfo, financials }) => (
              <div 
                key={client.id}
                className="bg-white p-3.5 rounded-xl border border-amber-200 flex items-center justify-between gap-3 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{client.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusInfo.badgeClass}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Due Date: {new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN')}
                    {financials.totalPendingAmount > 0 && (
                      <span className="font-semibold text-rose-600 ml-2">
                        ₹{financials.totalPendingAmount.toLocaleString('en-IN')} due
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setSelectedClientId(client.id)}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-semibold transition-colors"
                  >
                    Dashboard
                  </button>
                  <a
                    href={generateWhatsAppReminder(client, statusInfo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
                    title="Send WhatsApp Reminder"
                  >
                    <Send size={12} />
                  </a>
                  {client.emailRemindersEnabled !== false && (
                    <a
                      href={generateEmailReminder(client, statusInfo).mailtoLink}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors"
                      title="Send Email Reminder"
                    >
                      <Mail size={12} />
                    </a>
                  )}
                  <button
                    onClick={() => triggerBrowserOverdueAlert(client.name, statusInfo.label, statusInfo.notificationMessage, user?.uid)}
                    className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                    title="Trigger FCM Device Push Notification"
                  >
                    <AlertTriangle size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Client Form Modal */}
      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
            <h3 className="text-lg font-bold text-slate-900">{isEditing ? 'Edit Client Profile' : 'Add New Client Profile'}</h3>
            <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Client Name *</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="e.g. Acme Media Studio"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Phone Number *</label>
              <input 
                required
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="+91 98765 43210"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Email Address (Optional)</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="client@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Previous Payment Date *</label>
              <input 
                required
                type="date" 
                value={formData.lastPaymentDate}
                onChange={e => setFormData({...formData, lastPaymentDate: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
              />
              <p className="text-[10px] text-slate-400">Next payment due date will be 30 days after this date.</p>
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Default Reel Rate (₹) *</label>
              <input 
                required
                type="number" 
                min="0"
                step="1"
                value={formData.defaultRate}
                onChange={e => setFormData({...formData, defaultRate: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="e.g. 1500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">On Site Shoot Rate (₹)</label>
              <input 
                type="number" 
                min="0"
                step="1"
                value={formData.onSiteShootRate}
                onChange={e => setFormData({...formData, onSiteShootRate: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="e.g. 5000"
              />
            </div>
            
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">Website Making Rate (₹)</label>
              <input 
                type="number" 
                min="0"
                step="1"
                value={formData.websiteMakingRate}
                onChange={e => setFormData({...formData, websiteMakingRate: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-600"
                placeholder="e.g. 15000"
              />
            </div>

            <div className="md:col-span-2 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail size={18} className="text-indigo-600 shrink-0" />
                <div>
                  <label htmlFor="emailRemindersToggle" className="text-xs font-bold text-slate-900 cursor-pointer">
                    Enable Overdue Payment Email Reminders
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Automatically draft email reminders and trigger browser alerts when payment due dates are reached or overdue.
                  </p>
                </div>
              </div>
              <input
                id="emailRemindersToggle"
                type="checkbox"
                checked={formData.emailRemindersEnabled}
                onChange={e => setFormData({ ...formData, emailRemindersEnabled: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
            </div>
            
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button 
                type="button" 
                onClick={cancelEdit}
                className="px-4 py-2 rounded-xl text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
              >
                <CheckCircle2 size={16} />
                {isEditing ? 'Save Changes' : 'Save Client Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search clients by name, phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Clients ({clients.length})
          </button>

          <button
            onClick={() => setFilterType('due')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              filterType === 'due'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Clock size={12} /> Due / Action ({notificationClients.length})
          </button>

          <button
            onClick={() => setFilterType('uptodate')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'uptodate'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            Up to Date
          </button>
        </div>
      </div>

      {/* Client Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClients.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Search size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No client profiles found</h3>
            <p className="text-xs text-slate-500">
              {clients.length === 0 
                ? "Get started by adding your first client profile." 
                : "Try adjusting your search query or filter selection."}
            </p>
          </div>
        ) : (
          filteredClients.map(({ client, statusInfo, financials }) => {
            const formattedPrevDate = client.lastPaymentDate
              ? new Date(client.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              : 'Not set';

            const formattedNextDate = new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

            return (
              <div 
                key={client.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all group flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  {/* Top row: Avatar & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                          {client.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-mono">ID: {client.id.split('-')[0]}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const cWorkItems = workItems.filter(item => item.clientId === client.id);
                          const cInvoices = invoices.filter(inv => inv.clientId === client.id);
                          exportClientCSV(client, cWorkItems, cInvoices);
                        }}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Export Work History & Invoices to CSV"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditClient(client); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Client Profile"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id, client.name); }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Client"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Payment Status Pill & Sub-Clients Badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.badgeClass}`}>
                      <Clock size={12} /> {statusInfo.label}
                    </span>
                    {client.subClients && client.subClients.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        <Users size={12} /> {client.subClients.length} Sub-Clients
                      </span>
                    )}
                  </div>

                  {/* 30-Day Cycle Dates Row */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Prev Payment</span>
                      <span className="font-bold text-slate-800">{formattedPrevDate}</span>
                    </div>

                    <div className="border-l border-slate-200 pl-2.5">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Next Due</span>
                      <span className="font-bold text-slate-900">{formattedNextDate}</span>
                    </div>
                  </div>

                  {/* Financials & Rates */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div>
                      <span className="text-slate-400 block">Default Rate</span>
                      <span className="font-semibold text-slate-700">₹{client.defaultRate.toLocaleString('en-IN')} / reel</span>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-400 block">Pending Balance</span>
                      <span className={`font-bold ${financials.totalPendingAmount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        ₹{financials.totalPendingAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setSelectedClientId(client.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
                  >
                    Open Dashboard
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const cWorkItems = workItems.filter(item => item.clientId === client.id);
                      const cInvoices = invoices.filter(inv => inv.clientId === client.id);
                      exportClientCSV(client, cWorkItems, cInvoices);
                    }}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    title="Export Work History & Invoice Summary to CSV"
                  >
                    <Download size={14} className="text-emerald-600" /> CSV
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
