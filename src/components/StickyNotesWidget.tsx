import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { useFirestore } from '../hooks/useFirestore';
import { Client, StickyNote } from '../types';
import { StickyNote as NoteIcon, Plus, Trash2, Edit3, Search, Pin, User as UserIcon, Tag, Check, X } from 'lucide-react';

interface StickyNotesWidgetProps {
  user: User | null;
  clients: Client[];
}

const COLOR_MAP: Record<StickyNote['color'], { bg: string; border: string; text: string; badge: string; pin: string; dot: string }> = {
  yellow: {
    bg: 'bg-amber-50',
    border: 'border-amber-200 hover:border-amber-300',
    text: 'text-amber-950',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    pin: 'text-amber-500',
    dot: 'bg-amber-400'
  },
  blue: {
    bg: 'bg-sky-50',
    border: 'border-sky-200 hover:border-sky-300',
    text: 'text-sky-950',
    badge: 'bg-sky-100 text-sky-800 border-sky-300',
    pin: 'text-sky-500',
    dot: 'bg-sky-400'
  },
  green: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200 hover:border-emerald-300',
    text: 'text-emerald-950',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    pin: 'text-emerald-500',
    dot: 'bg-emerald-400'
  },
  pink: {
    bg: 'bg-pink-50',
    border: 'border-pink-200 hover:border-pink-300',
    text: 'text-pink-950',
    badge: 'bg-pink-100 text-pink-800 border-pink-300',
    pin: 'text-pink-500',
    dot: 'bg-pink-400'
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200 hover:border-purple-300',
    text: 'text-purple-950',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    pin: 'text-purple-500',
    dot: 'bg-purple-400'
  }
};

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'note_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

export default function StickyNotesWidget({ user, clients }: StickyNotesWidgetProps) {
  const { data: notes, loading, addOrUpdateItem, removeItem } = useFirestore<StickyNote>('notes', user?.uid);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [formData, setFormData] = useState<{
    clientId: string;
    content: string;
    color: StickyNote['color'];
  }>({
    clientId: 'general',
    content: '',
    color: 'yellow'
  });

  const handleOpenAdd = () => {
    setEditingNoteId(null);
    setFormData({
      clientId: 'general',
      content: '',
      color: 'yellow'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (note: StickyNote) => {
    setEditingNoteId(note.id);
    setFormData({
      clientId: note.clientId || 'general',
      content: note.content,
      color: note.color || 'yellow'
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingNoteId(null);
    setFormData({
      clientId: 'general',
      content: '',
      color: 'yellow'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) {
      alert("Note content cannot be empty.");
      return;
    }

    try {
      if (editingNoteId) {
        const existing = notes.find(n => n.id === editingNoteId);
        if (existing) {
          const updatedNote: StickyNote = {
            ...existing,
            clientId: formData.clientId,
            content: formData.content.trim(),
            color: formData.color,
            updatedAt: Date.now()
          };
          await addOrUpdateItem(updatedNote);
        }
      } else {
        const newNote: StickyNote = {
          id: generateUUID(),
          clientId: formData.clientId,
          content: formData.content.trim(),
          color: formData.color,
          createdAt: Date.now()
        };
        await addOrUpdateItem(newNote);
      }

      handleCloseModal();
    } catch (err: any) {
      console.error("Error saving sticky note:", err);
      alert("Failed to save sticky note: " + (err?.message || String(err)));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this sticky note?")) {
      try {
        await removeItem(id);
      } catch (err: any) {
        console.error("Error deleting note:", err);
        alert("Failed to delete note: " + (err?.message || String(err)));
      }
    }
  };

  const filteredNotes = notes.filter(note => {
    const matchesClient = selectedClientFilter === 'ALL' 
      ? true 
      : selectedClientFilter === 'GENERAL'
        ? note.clientId === 'general' || !note.clientId
        : note.clientId === selectedClientFilter;

    const matchesSearch = searchQuery.trim() === '' || 
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clients.find(c => c.id === note.clientId)?.name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesClient && matchesSearch;
  }).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg">
            <NoteIcon size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Sticky Notes
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                {notes.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500">Quick temporary snippets and notes for your clients.</p>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus size={16} /> Add Note
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search notes or clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Clients & Notes</option>
            <option value="GENERAL">General Snippets Only</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sticky Notes Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 animate-pulse">Loading sticky notes...</div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Pin size={20} />
          </div>
          <p className="text-xs font-semibold text-slate-600">No sticky notes found</p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            {searchQuery || selectedClientFilter !== 'ALL'
              ? 'Try clearing your search filters to view existing notes.'
              : 'Create a quick sticky note to record client guidelines, feedback, or temporary snippets.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-800 transition-colors"
          >
            <Plus size={14} /> Create First Note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const client = clients.find(c => c.id === note.clientId);
            const style = COLOR_MAP[note.color || 'yellow'];

            return (
              <div
                key={note.id}
                className={`relative p-5 rounded-xl border ${style.bg} ${style.border} ${style.text} shadow-xs hover:shadow-md transition-all flex flex-col justify-between min-h-[170px] group`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Pin size={14} className={`${style.pin} rotate-45 shrink-0`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
                        {client ? client.name : 'General Note'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEdit(note)}
                        className="p-1 rounded hover:bg-black/5 text-slate-600 transition-colors"
                        title="Edit note"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-rose-600 transition-colors"
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                    {note.content}
                  </p>
                </div>

                <div className="pt-3 border-t border-black/5 flex items-center justify-between text-[10px] text-slate-500 mt-3">
                  <span>
                    {new Date(note.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
                    <span className="capitalize">{note.color}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pin size={18} className="text-indigo-600" />
                {editingNoteId ? 'Edit Sticky Note' : 'Create New Sticky Note'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Client Association</label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                >
                  <option value="general">📌 General / Quick Snippet (No Client)</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>👤 {c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Note Content *</label>
                <textarea
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="e.g., Client prefers energetic transition effects, 9:16 aspect ratio, and background music at -18dB..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-normal focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Color Palette</label>
                <div className="flex items-center gap-2">
                  {(['yellow', 'blue', 'green', 'pink', 'purple'] as StickyNote['color'][]).map((color) => {
                    const style = COLOR_MAP[color];
                    const isSelected = formData.color === color;

                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${style.bg} ${
                          isSelected ? 'border-slate-900 scale-110 shadow-xs' : 'border-slate-200 hover:scale-105'
                        }`}
                        title={color}
                      >
                        {isSelected && <Check size={14} className="text-slate-800" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  {editingNoteId ? 'Update Note' : 'Save Sticky Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
