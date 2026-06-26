import { LayoutDashboard, Users, FileText, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { Tab } from '../App';
import { User } from 'firebase/auth';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  user?: User;
  onLogout?: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'invoice', label: 'Invoice Generator', icon: FileText },
  ] as const;

  return (
    <nav className="w-64 bg-slate-900 text-white flex flex-col h-full z-20">
      <div className="p-6">
        <h1 className="text-white font-bold text-xl tracking-tight">Tilak Popat</h1>
        <p className="text-slate-400 text-xs mt-1">Video Editor Pro</p>
      </div>
      
      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                isActive 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <Icon size={20} className={clsx(isActive ? "text-white" : "text-slate-400")} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="p-6 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName || 'User Account'}</p>
            <p className="text-xs text-emerald-400">Cloud Sync Active</p>
          </div>
        </div>
        
        {onLogout && (
          <button onClick={onLogout} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors" title="Sign out">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </nav>
  );
}
