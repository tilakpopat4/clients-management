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
import AdminTab from './components/AdminTab';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from './hooks/useFirestore';
import { UserProfile } from './types';
import ProfileModal from './components/ProfileModal';
import { ShieldAlert, LogOut } from 'lucide-react';

export type Tab = 'dashboard' | 'clients' | 'work' | 'invoice' | 'admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const checkIsAdminRoute = () => {
    return (
      window.location.pathname === '/admin' ||
      window.location.hash === '#/admin' ||
      window.location.hash === '#admin' ||
      window.location.search.includes('admin=true')
    );
  };

  const [isAdminRoute, setIsAdminRoute] = useState(checkIsAdminRoute());

  // Handle browser back/forward buttons or direct path modifications
  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(checkIsAdminRoute());
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

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

  // Listen to blocked status in real-time
  useEffect(() => {
    if (!user) {
      setIsBlocked(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'blocked_users', user.uid),
      (docSnap) => {
        setIsBlocked(docSnap.exists());
      },
      (error) => {
        console.error("Error checking block list:", error);
        setIsBlocked(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Open profile modal if the user is signed in but has not set up their profile yet, and is NOT blocked
  useEffect(() => {
    if (user && !profilesLoading && !profile && isBlocked === false) {
      setIsProfileModalOpen(true);
    }
  }, [user, profilesLoading, profile, isBlocked]);

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

  if (loading || (user && (profilesLoading || isBlocked === null))) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Render blocked user screen if they are blocked
  if (user && isBlocked === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden font-sans text-slate-100">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
        
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl relative z-10 text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
            <ShieldAlert className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Access Restricted</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your account has been deactivated or blocked by the platform administrator. You no longer have permission to use this application.
            </p>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed text-left border border-slate-700/50">
            <span className="font-semibold text-slate-400">Account details:</span>
            <div className="mt-1 font-mono break-all text-slate-400">UID: {user.uid}</div>
            <div className="font-mono mt-0.5 text-slate-400">Email: {user.email}</div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 active:scale-98 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow"
            >
              <LogOut className="w-4 h-4" />
              Sign Out & Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center max-w-md w-full font-sans">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isAdminRoute ? 'Admin Portal' : 'Welcome Back'}
          </h1>
          <p className="text-slate-500 mb-6 text-sm">
            {isAdminRoute 
              ? 'Please sign in with Google to authenticate and load the Admin database console.' 
              : 'Please sign in to access your Studio Dashboard and sync your data securely via cloud.'}
          </p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded font-medium transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            {isAdminRoute ? 'Admin Sign In' : 'Sign in with Google'}
          </button>
          {isAdminRoute && (
            <button
              onClick={() => { window.location.href = '/' }}
              className="mt-4 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Back to Main Website
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isAdminRoute) {
    return <AdminTab />;
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
        {activeTab === 'admin' && <AdminTab />}
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
