import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle, Clock } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { Client, WorkItem } from '../types';
import clsx from 'clsx';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';

interface WorkLogTabProps {
  user: User;
}

export function WorkLogTab({ user }: WorkLogTabProps) {
  const { data: clients, loading: clientsLoading } = useFirestore<Client>('clients', user.uid);
  const { data: workItems, loading: workLoading, addOrUpdateItem, removeItem } = useFirestore<WorkItem>('workItems', user.uid);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    description: '',
    quantity: '1',
    rate: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) return alert("Please select a client");
    
    const client = clients.find(c => c.id === formData.clientId);
    const newWork: WorkItem = {
      id: generateUUID(),
      clientId: formData.clientId,
      description: formData.description,
      quantity: Number(formData.quantity),
      rate: Number(formData.rate) || (client ? client.defaultRate : 0),
      date: new Date(formData.date).getTime(),
      status: 'Uninvoiced',
      createdAt: Date.now()
    };

    try {
      await addOrUpdateItem(newWork);
      setFormData({ ...formData, description: '', quantity: '1', rate: '' });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      alert("Error adding work item: " + (err?.message || String(err)));
    }
  };

  const deleteWork = async (id: string) => {
    if (confirm('Are you sure you want to delete this work log?')) {
      await removeItem(id);
    }
  };

  if (clientsLoading || workLoading) {
    return <div className="p-8 flex justify-center items-center h-full"><p className="text-slate-500">Loading work logs...</p></div>;
  }

  const sortedWork = [...workItems].sort((a, b) => b.date - a.date);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Work Log</h2>
          <p className="text-slate-500 mt-1">Log completed edits and services before generating invoices.</p>
        </div>
        {!isFormOpen && (
          <button 
            onClick={() => setIsFormOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm w-full md:w-auto"
          >
            <Plus size={16} />
            Log Work
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">Log Completed Work</h3>
            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
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
                    setFormData({...formData, clientId, rate: client ? String(client.defaultRate) : ''});
                  }}
                >
                  <option value="">Select Client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-medium mr-2"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700"
              >
                Log Work
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
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedWork.map(work => {
                  const client = clients.find(c => c.id === work.clientId);
                  return (
                    <tr key={work.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4 text-sm text-slate-600">
                        {new Date(work.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="py-4 px-4 text-sm font-medium text-slate-900">
                        {client?.name || 'Unknown Client'}
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-600">
                        {work.description} <span className="text-xs text-slate-400">({work.quantity}x)</span>
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
                      <td className="py-4 px-4 text-sm text-right">
                        {work.status === 'Uninvoiced' && (
                          <button 
                            onClick={() => deleteWork(work.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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
