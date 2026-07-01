import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { Users, ShieldAlert, Lock, Unlock, Search, Trash2, Ban, CheckCircle, UserX, UserCheck } from 'lucide-react';

interface BlockedUser {
  id: string;
  blockedAt: number;
}

export default function AdminTab() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [blockedList, setBlockedList] = useState<BlockedUser[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUid, setManualUid] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Default admin password is 'admin2026'
  const ADMIN_PASSWORD = 'admin2026';

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError('');
      // Store in session storage so it persists during current tab session
      sessionStorage.setItem('isAdminAuthenticated', 'true');
    } else {
      setPasswordError('Invalid admin password. Please try again.');
    }
  };

  // Check session storage on load
  useEffect(() => {
    if (sessionStorage.getItem('isAdminAuthenticated') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch all profiles
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingProfiles(true);
    const unsubscribe = onSnapshot(
      collection(db, 'profiles'),
      (snapshot) => {
        const items: UserProfile[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as UserProfile);
        });
        setProfiles(items.sort((a, b) => b.createdAt - a.createdAt));
        setLoadingProfiles(false);
      },
      (error) => {
        console.error('Error fetching profiles in admin:', error);
        setLoadingProfiles(false);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Fetch all blocked users
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingBlocked(true);
    const unsubscribe = onSnapshot(
      collection(db, 'blocked_users'),
      (snapshot) => {
        const items: BlockedUser[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as BlockedUser);
        });
        setBlockedList(items);
        setLoadingBlocked(false);
      },
      (error) => {
        console.error('Error fetching blocked users in admin:', error);
        setLoadingBlocked(false);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated]);

  const handleBlockUser = async (userId: string) => {
    if (!userId.trim()) return;
    setActionLoading(userId);
    try {
      await setDoc(doc(db, 'blocked_users', userId), {
        blockedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to block user:', err);
      alert('Error blocking user. Check permissions.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      await deleteDoc(doc(db, 'blocked_users', userId));
    } catch (err) {
      console.error('Failed to unblock user:', err);
      alert('Error unblocking user.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) return;
    try {
      await handleBlockUser(manualUid.trim());
      setManualUid('');
      alert('User successfully blocked.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogoutAdmin = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('isAdminAuthenticated');
    setPassword('');
  };

  // Helper to check if a user is blocked
  const isUserBlocked = (userId: string) => {
    return blockedList.some(u => u.id === userId);
  };

  // Filter profiles based on search
  const filteredProfiles = profiles.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.professionalTitle?.toLowerCase().includes(q) ||
      p.upiId?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.id?.toLowerCase().includes(q)
    );
  });

  // Password Protection Login Card
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40"></div>
        
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Command Center</h1>
            <p className="text-slate-400 text-xs mt-1.5 max-w-xs">
              This area is restricted to website administrators. Please enter your access password below.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            {passwordError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-medium text-center">
                {passwordError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Access Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 font-mono tracking-widest transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <p className="text-[10px] text-slate-500 mt-2 text-center">
                Hint: Default access password is <code className="bg-slate-950 px-1 py-0.5 rounded text-indigo-400">admin2026</code>
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              Unlock Console
            </button>

            {(window.location.pathname === '/admin' || window.location.hash === '#/admin' || window.location.hash === '#admin' || window.location.search.includes('admin=true')) && (
              <button
                type="button"
                onClick={() => { window.location.href = '/' }}
                className="w-full border border-slate-800 hover:bg-slate-800 text-slate-400 py-3 rounded-xl text-xs font-semibold transition-all mt-1 text-center"
              >
                Back to Main Website
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  return (
    <div className="p-6 md:p-8 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Manage active freelancers, view usage statistics, and configure user blocking policies.</p>
        </div>
        <div className="flex items-center gap-2">
          {(window.location.pathname === '/admin' || window.location.hash === '#/admin' || window.location.hash === '#admin' || window.location.search.includes('admin=true')) && (
            <button
              onClick={() => { window.location.href = '/' }}
              className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow"
            >
              Back to Main Website
            </button>
          )}
          <button
            onClick={handleLogoutAdmin}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow"
          >
            Lock Console
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Freelancers</p>
            <p className="text-2xl font-bold text-slate-900">{loadingProfiles ? '...' : profiles.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Blocked Users</p>
            <p className="text-2xl font-bold text-slate-900">{loadingBlocked ? '...' : blockedList.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm col-span-1 sm:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Instant Block by UID</h3>
          <form onSubmit={handleManualBlock} className="flex gap-2">
            <input
              type="text"
              placeholder="Paste Firebase Auth UID"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-red-500 font-mono"
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              required
            />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              Block
            </button>
          </form>
        </div>
      </div>

      {/* User Management Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-base">Registered Freelancer Accounts</h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, title, UPI or phone..."
              className="w-full border border-slate-200 bg-white rounded-lg pl-9 pr-4 py-2 text-xs outline-none focus:border-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Profiles List */}
        <div className="overflow-x-auto">
          {loadingProfiles || loadingBlocked ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
              Loading database profiles...
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              No freelancer profiles found matching your search.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-100">
                  <th className="p-4 font-bold">Freelancer</th>
                  <th className="p-4 font-bold">Professional Details</th>
                  <th className="p-4 font-bold">Billing Details</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProfiles.map((p) => {
                  const blocked = isUserBlocked(p.id);
                  const isProcessing = actionLoading === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5 select-all" title="User UID">{p.id}</div>
                        <div className="text-slate-400 text-[10px] mt-1">Joined: {new Date(p.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="p-4 space-y-1">
                        <div className="font-medium text-slate-700">{p.professionalTitle}</div>
                        <div className="text-slate-500 italic text-[11px]">{p.servicesDescription}</div>
                      </td>
                      <td className="p-4 space-y-1">
                        <div><span className="text-slate-400">Phone:</span> {p.phone}</div>
                        <div><span className="text-slate-400">UPI:</span> <span className="font-mono bg-slate-50 px-1 py-0.5 rounded text-slate-700">{p.upiId}</span></div>
                      </td>
                      <td className="p-4 text-center">
                        {blocked ? (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-semibold text-[10px] uppercase tracking-wider">
                            <UserX className="w-3 h-3" />
                            Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold text-[10px] uppercase tracking-wider">
                            <UserCheck className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {blocked ? (
                          <button
                            onClick={() => handleUnblockUser(p.id)}
                            disabled={isProcessing}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-colors active:scale-95 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            Unblock Access
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlockUser(p.id)}
                            disabled={isProcessing}
                            className="bg-red-50 text-red-700 hover:bg-red-600 hover:text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            Block User
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
