import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';
import { Settings, X, Save } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  initialProfile: UserProfile | null;
  onSave: (profile: UserProfile) => Promise<void>;
  isMandatory?: boolean;
}

export default function ProfileModal({
  isOpen,
  onClose,
  user,
  initialProfile,
  onSave,
  isMandatory = false
}: ProfileModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('Video Editor Pro');
  const [servicesDescription, setServicesDescription] = useState('Video Editing Services');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialProfile?.name || user.displayName || '');
      setPhone(initialProfile?.phone || '');
      setUpiId(initialProfile?.upiId || '');
      setProfessionalTitle(initialProfile?.professionalTitle || 'Video Editor Pro');
      setServicesDescription(initialProfile?.servicesDescription || 'Video Editing Services');
      setError('');
    }
  }, [isOpen, initialProfile, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !upiId.trim() || !professionalTitle.trim() || !servicesDescription.trim()) {
      setError('All fields are required.');
      return;
    }

    // Basic UPI ID validation
    if (!upiId.includes('@')) {
      setError('Please enter a valid UPI ID (e.g. username@bank).');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const updatedProfile: UserProfile = {
        id: user.uid,
        name: name.trim(),
        phone: phone.trim(),
        upiId: upiId.trim(),
        professionalTitle: professionalTitle.trim(),
        servicesDescription: servicesDescription.trim(),
        createdAt: initialProfile?.createdAt || Date.now()
      };
      await onSave(updatedProfile);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="profile-modal-overlay" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        id="profile-modal-container" 
        className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-lg">
              {isMandatory ? 'Set Up Your Freelancer Profile' : 'Profile Settings'}
            </h2>
          </div>
          {!isMandatory && (
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isMandatory && (
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 p-3.5 rounded-lg text-xs leading-relaxed mb-2">
              Welcome! To generate personalized invoices and create payment links, please configure your business details.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Your Full Name *</label>
            <input 
              type="text"
              placeholder="e.g. Tilak Popat"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 outline-none transition-all focus:border-indigo-500 focus:bg-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Professional Title *</label>
            <input 
              type="text"
              placeholder="e.g. Video Editor Pro"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 outline-none transition-all focus:border-indigo-500 focus:bg-white"
              value={professionalTitle}
              onChange={(e) => setProfessionalTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Services Description *</label>
            <input 
              type="text"
              placeholder="e.g. Video Editing Services"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 outline-none transition-all focus:border-indigo-500 focus:bg-white"
              value={servicesDescription}
              onChange={(e) => setServicesDescription(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Phone Number *</label>
            <input 
              type="text"
              placeholder="e.g. +91 78749 03810"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 outline-none transition-all focus:border-indigo-500 focus:bg-white"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">UPI ID (for pay link & QR Code) *</label>
            <input 
              type="text"
              placeholder="e.g. username@okaxis"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 outline-none transition-all focus:border-indigo-500 focus:bg-white font-mono"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">This UPI ID is used to generate custom payment links & UPI QR codes on invoices.</p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            {!isMandatory && (
              <button 
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
