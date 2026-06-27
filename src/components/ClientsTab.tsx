import React, { useState } from 'react';
import { Client } from '../types';
import { Plus, Edit2, Trash2, CheckCircle2, X } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';

interface ClientsTabProps {
  user: User | null;
}

export default function ClientsTab({ user }: ClientsTabProps) {
  const { data: clients, loading, addOrUpdateItem, removeItem } = useFirestore<Client>('clients', user?.uid);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    defaultRate: '',
    onSiteShootRate: '',
    websiteMakingRate: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        const client = clients.find(c => c.id === isEditing);
        if (client) {
          const updatedClient: any = { 
            ...client, 
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            defaultRate: Number(formData.defaultRate)
          };
          if (formData.onSiteShootRate) updatedClient.onSiteShootRate = Number(formData.onSiteShootRate);
          else delete updatedClient.onSiteShootRate;
          
          if (formData.websiteMakingRate) updatedClient.websiteMakingRate = Number(formData.websiteMakingRate);
          else delete updatedClient.websiteMakingRate;

          await addOrUpdateItem(updatedClient);
        }
        setIsEditing(null);
      } else {
        const newClient: any = { 
          id: generateUUID(), 
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          defaultRate: Number(formData.defaultRate), 
          createdAt: Date.now() 
        };
        if (formData.onSiteShootRate) newClient.onSiteShootRate = Number(formData.onSiteShootRate);
        if (formData.websiteMakingRate) newClient.websiteMakingRate = Number(formData.websiteMakingRate);

        await addOrUpdateItem(newClient as Client);
      }
      setFormData({ name: '', phone: '', email: '', defaultRate: '', onSiteShootRate: '', websiteMakingRate: '' });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      alert("Error saving client: " + (err?.message || String(err)));
    }
  };
  
  const editClient = (c: Client) => {
    setIsEditing(c.id);
    setFormData({ 
      name: c.name, 
      phone: c.phone, 
      email: c.email, 
      defaultRate: String(c.defaultRate),
      onSiteShootRate: c.onSiteShootRate ? String(c.onSiteShootRate) : '',
      websiteMakingRate: c.websiteMakingRate ? String(c.websiteMakingRate) : ''
    });
    setIsFormOpen(true);
  };

  const deleteClient = async (id: string) => {
    if (confirm('Are you sure you want to delete this client?')) {
      await removeItem(id);
    }
  };
  
  const cancelEdit = () => {
    setIsEditing(null);
    setFormData({ name: '', phone: '', email: '', defaultRate: '', onSiteShootRate: '', websiteMakingRate: '' });
    setIsFormOpen(false);
  };

  if (loading) {
    return <div className="p-8 max-w-7xl mx-auto text-center py-20"><div className="animate-pulse flex items-center justify-center space-x-2"><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div></div></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Client Management</h2>
          <p className="text-slate-500 mt-1">Manage your clients and default reel rates.</p>
        </div>
        
        {!isFormOpen && (
          <button 
            onClick={() => setIsFormOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm w-full md:w-auto"
          >
            <Plus size={16} />
            Add New Client
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{isEditing ? 'Edit Client' : 'Add New Client'}</h3>
            <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Client Name *</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="e.g. Acme Corp"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone Number *</label>
              <input 
                required
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="+91 98765 43210"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Email Address (Optional)</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="client@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Default Reel Rate (₹) *</label>
              <input 
                required
                type="number" 
                min="0"
                step="1"
                value={formData.defaultRate}
                onChange={e => setFormData({...formData, defaultRate: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="e.g. 1500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">On Site Shoot Rate (₹)</label>
              <input 
                type="number" 
                min="0"
                step="1"
                value={formData.onSiteShootRate}
                onChange={e => setFormData({...formData, onSiteShootRate: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="e.g. 5000"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Website Making Rate (₹)</label>
              <input 
                type="number" 
                min="0"
                step="1"
                value={formData.websiteMakingRate}
                onChange={e => setFormData({...formData, websiteMakingRate: e.target.value})}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                placeholder="e.g. 15000"
              />
            </div>
            
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button 
                type="button" 
                onClick={cancelEdit}
                className="px-4 py-2 rounded text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm"
              >
                <CheckCircle2 size={16} />
                {isEditing ? 'Save Changes' : 'Save Client'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="px-6 py-4 font-medium">Client Details</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium text-right">Default Rate</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No clients saved yet. Add your first client to get started.
                  </td>
                </tr>
              ) : clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{client.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">ID: {client.id.split('-')[0]}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{client.phone}</div>
                    {client.email && <div className="text-xs text-slate-500 mt-0.5">{client.email}</div>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                      ₹{client.defaultRate.toLocaleString('en-IN')} / reel
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => editClient(client)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => deleteClient(client.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
