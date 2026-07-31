import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, Clock, Edit2, ArrowUpDown, ExternalLink, Play, Video, Search, X, Users } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { Client, WorkItem } from '../types';
import clsx from 'clsx';
import { User } from 'firebase/auth';
import { generateUUID, extractVideoUrl } from '../lib/utils';

interface WorkLogTabProps {
  user: User;
  initialSearchQuery?: string;
}

export function WorkLogTab({ user, initialSearchQuery = '' }: WorkLogTabProps) {
  const { data: clients, loading: clientsLoading } = useFirestore<Client>('clients', user.uid);
  const { data: workItems, loading: workLoading, addOrUpdateItem, removeItem } = useFirestore<WorkItem>('workItems', user.uid);
  const { data: invoices, loading: invoicesLoading, addOrUpdateItem: addOrUpdateInvoice, removeItem: removeInvoice } = useFirestore<any>('invoices', user.uid);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [formData, setFormData] = useState({
    clientId: '',
    subClientId: '',
    description: '',
    videoUrl: '',
    quantity: '1',
    rate: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleEditWork = (work: WorkItem) => {
    setEditingWorkId(work.id);
    setFormData({
      clientId: work.clientId,
      subClientId: work.subClientId || '',
      description: work.description,
      videoUrl: work.videoUrl || '',
      quantity: String(work.quantity),
      rate: String(work.rate),
      date: new Date(work.date).toISOString().split('T')[0]
    });
    setIsFormOpen(true);
  };

  const handleCancel = () => {
    setEditingWorkId(null);
    setFormData({
      clientId: '',
      subClientId: '',
      description: '',
      videoUrl: '',
      quantity: '1',
      rate: '',
      date: new Date().toISOString().split('T')[0]
    });
    setIsFormOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) return alert("Please select a client");
    
    const client = clients.find(c => c.id === formData.clientId);
    const selectedSub = client?.subClients?.find(sc => sc.id === formData.subClientId);
    const selectedRate = Number(formData.rate) || (client ? client.defaultRate : 0);
    const selectedDate = new Date(formData.date).getTime();
    const selectedQty = Number(formData.quantity);
    const trimmedVideoUrl = formData.videoUrl.trim() || undefined;

    try {
      if (editingWorkId) {
        const existing = workItems.find(w => w.id === editingWorkId);
        if (existing) {
          const updatedWork: WorkItem = {
            ...existing,
            clientId: formData.clientId,
            subClientId: selectedSub ? selectedSub.id : (formData.subClientId ? formData.subClientId : undefined),
            subClientName: selectedSub ? selectedSub.name : undefined,
            description: formData.description,
            videoUrl: trimmedVideoUrl,
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
                    title: formData.description,
                    quantity: selectedQty,
                    rate: selectedRate,
                    subClientId: selectedSub ? selectedSub.id : undefined,
                    subClientName: selectedSub ? selectedSub.name : undefined
                  };
                }
                return reel;
              });

              const newSubtotal = updatedReels.reduce((sum: number, r: any) => sum + (r.quantity * r.rate), 0);
              const discount = invoice.discountAmount || 0;
              const newTotal = Math.max(0, newSubtotal - discount);

              await addOrUpdateInvoice({
                ...invoice,
                reels: updatedReels,
                totalAmount: newTotal
              });
            }
          }

          await addOrUpdateItem(updatedWork);
        }
      } else {
        const newWork: WorkItem = {
          id: generateUUID(),
          clientId: formData.clientId,
          subClientId: selectedSub ? selectedSub.id : (formData.subClientId ? formData.subClientId : undefined),
          subClientName: selectedSub ? selectedSub.name : undefined,
          description: formData.description,
          videoUrl: trimmedVideoUrl,
          quantity: selectedQty,
          rate: selectedRate,
          date: selectedDate,
          status: 'Uninvoiced',
          createdAt: Date.now()
        };

        await addOrUpdateItem(newWork);
      }

      handleCancel();
    } catch (err: any) {
      console.error(err);
      alert("Error saving work item: " + (err?.message || String(err)));
    }
  };

  const deleteWork = async (item: WorkItem) => {
    const isInvoiced = item.status === 'Invoiced';
    const message = isInvoiced 
      ? 'This work log is currently invoiced. Deleting it will also remove it from the associated invoice and adjust the invoice totals. Are you sure you want to delete this work log?' 
      : 'Are you sure you want to delete this work log?';

    if (confirm(message)) {
      try {
        if (isInvoiced && item.invoiceId) {
          // Find the associated invoice
          const invoice = invoices.find(inv => inv.id === item.invoiceId);
          if (invoice) {
            // Filter out the matching reel from invoice items
            let matched = false;
            const updatedReels = invoice.reels.filter((reel: any) => {
              if (!matched && reel.title === item.description && reel.quantity === item.quantity && reel.rate === item.rate) {
                matched = true;
                return false;
              }
              return true;
            });

            if (updatedReels.length === 0) {
              // If no reels are left, we delete the invoice
              await removeInvoice(invoice.id);
            } else {
              // Recalculate total amount and update invoice, keeping any existing discount
              const newSubtotal = updatedReels.reduce((sum: number, r: any) => sum + (r.quantity * r.rate), 0);
              const discount = invoice.discountAmount || 0;
              const newTotal = Math.max(0, newSubtotal - discount);
              await addOrUpdateInvoice({
                ...invoice,
                reels: updatedReels,
                totalAmount: newTotal
              });
            }
          }
        }
        await removeItem(item.id);
      } catch (err: any) {
        console.error("Error deleting work log:", err);
        alert("Failed to delete work log: " + (err?.message || String(err)));
      }
    }
  };

  if (clientsLoading || workLoading || invoicesLoading) {
    return <div className="p-8 flex justify-center items-center h-full"><p className="text-slate-500">Loading work logs...</p></div>;
  }

  const filteredWork = workItems.filter(w => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const client = clients.find(c => c.id === w.clientId);
    const clientName = client ? client.name.toLowerCase() : '';
    return w.description.toLowerCase().includes(q) ||
      clientName.includes(q) ||
      (w.videoUrl && w.videoUrl.toLowerCase().includes(q));
  });

  const sortedWork = [...filteredWork].sort((a, b) => 
    sortOrder === 'asc' 
      ? (a.date - b.date || a.createdAt - b.createdAt) 
      : (b.date - a.date || b.createdAt - a.createdAt)
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Work Log</h2>
          <p className="text-slate-500 mt-1">Log completed edits and services before generating invoices.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Work Log Filter Search Bar */}
          <div className="relative flex-1 md:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search work or client..."
              className="w-full bg-white text-xs pl-9 pr-7 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
            title="Toggle sort order"
          >
            <ArrowUpDown size={14} />
            Sort: {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
          </button>
          {!isFormOpen && (
            <button 
              onClick={() => setIsFormOpen(true)}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <Plus size={15} />
              Log Work
            </button>
          )}
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">{editingWorkId ? 'Edit Work Log Entry' : 'Log Completed Work'}</h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                <select 
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={formData.clientId}
                  onChange={(e) => {
                    const clientId = e.target.value;
                    const client = clients.find(c => c.id === clientId);
                    setFormData({...formData, clientId, subClientId: '', rate: client ? String(client.defaultRate) : ''});
                  }}
                >
                  <option value="">Select Client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {(() => {
                  const selClient = clients.find(c => c.id === formData.clientId);
                  if (selClient?.subClients && selClient.subClients.length > 0) {
                    return (
                      <div className="mt-2.5 bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                        <label className="block text-xs font-bold text-purple-900 mb-1 flex items-center gap-1">
                          <Users size={12} className="text-purple-600" /> Assign Sub-Client (Optional)
                        </label>
                        <select
                          className="w-full p-2 border border-purple-300 rounded-md text-xs bg-white font-medium text-slate-800 outline-none focus:ring-2 focus:ring-purple-500"
                          value={formData.subClientId}
                          onChange={(e) => setFormData({ ...formData, subClientId: e.target.value })}
                        >
                          <option value="">Direct Parent Client ({selClient.name})</option>
                          {selClient.subClients.map(sc => (
                            <option key={sc.id} value={sc.id}>Sub-Client: {sc.name} {sc.code ? `(${sc.code})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date Completed</label>
                <input 
                  type="date"
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description (e.g., Real Estate Reel, VLOG Edit)</label>
              <input 
                type="text"
                required
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Description of work"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Video / Post Link (Optional)</label>
              <input 
                type="text"
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-mono"
                value={formData.videoUrl}
                onChange={(e) => setFormData({...formData, videoUrl: e.target.value})}
                placeholder="https://instagram.com/reel/... or YouTube / Google Drive link"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                <input 
                  type="number"
                  min="1"
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (₹)</label>
                <input 
                  type="number"
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={formData.rate}
                  onChange={(e) => setFormData({...formData, rate: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={handleCancel}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-medium mr-2"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700"
              >
                {editingWorkId ? 'Save Changes' : 'Log Work'}
              </button>
            </div>
          </form>
        </div>
      )}

      {sortedWork.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Clock className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No work logged yet</h3>
          <p className="text-slate-500">Start logging your edits and services to easily generate invoices later.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description / Video Link</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedWork.map(work => {
                  const client = clients.find(c => c.id === work.clientId);
                  const videoUrl = extractVideoUrl(work);
                  return (
                    <tr key={work.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4 text-sm text-slate-600">
                        {new Date(work.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="py-4 px-4 text-sm font-medium text-slate-900">
                        <div>{client?.name || 'Unknown Client'}</div>
                        {work.subClientName && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded mt-0.5">
                            <Users size={10} /> Sub: {work.subClientName}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-600">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                          <span className="font-medium text-slate-900">{work.description}</span>
                          <span className="text-xs text-slate-400">({work.quantity}x)</span>
                          {videoUrl && (
                            <a
                              href={videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200 transition-all shrink-0 cursor-pointer w-fit"
                              title={`Open video/post: ${videoUrl}`}
                            >
                              <Play size={11} className="fill-indigo-700" /> Open Video/Post <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm font-medium text-slate-900">
                        ₹{(work.quantity * work.rate).toLocaleString('en-IN')}
                      </td>
                      <td className="py-4 px-4 text-sm">
                        {work.status === 'Invoiced' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle size={12} /> Invoiced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock size={12} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-sm text-right flex justify-end items-center gap-1">
                        {videoUrl && (
                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Directly Open Video / Post in new tab"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        <button 
                          onClick={() => handleEditWork(work)}
                          className="text-slate-500 hover:text-indigo-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                          title="Edit Work Log"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => deleteWork(work)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="Delete Work Log"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
