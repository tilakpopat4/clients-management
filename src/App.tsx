/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardTab from './components/DashboardTab';
import ClientsTab from './components/ClientsTab';
import InvoiceTab from './components/InvoiceTab';
import { WorkLogTab } from './components/WorkLogTab';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { useFirestore } from './hooks/useFirestore';
import { UserProfile } from './types';
import ProfileModal from './components/ProfileModal';

export type Tab = 'dashboard' | 'clients' | 'work' | 'invoice';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Load user profile from profiles collection in Firestore
  const { data: profiles, loading: profilesLoading, addOrUpdateItem: saveProfile } = useFirestore<UserProfile>('profiles', user?.uid);
  const profile = profiles[0] || null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Open profile modal if the user is signed in but has not set up their profile yet
  useEffect(() => {
    if (user && !profilesLoading && !profile) {
      setIsProfileModalOpen(true);
    }
  }, [user, profilesLoading, profile]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error(error);
      alert(`Sign in failed. This is often because the app is running in a preview window (iframe). Please open the app in a new tab using the arrow icon in the top right, and try again.\n\nError: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  if (loading || (user && profilesLoading)) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center max-w-md w-full">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-slate-500 mb-6 text-sm">Please sign in to access your Studio Dashboard and sync your data securely via cloud.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded font-medium transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={handleLogout} 
        profile={profile}
        onEditProfile={() => setIsProfileModalOpen(true)}
      />
      <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
        {activeTab === 'dashboard' && <DashboardTab user={user} />}
        {activeTab === 'clients' && <ClientsTab user={user} />}
        {activeTab === 'work' && <WorkLogTab user={user} />}
        {activeTab === 'invoice' && <InvoiceTab user={user} profile={profile} />}
      </main>

      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        initialProfile={profile}
        onSave={saveProfile}
        isMandatory={!profile}
      />
    </div>
  );
}
