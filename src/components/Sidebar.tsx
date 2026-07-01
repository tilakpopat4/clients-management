import { LayoutDashboard, Users, FileText, LogOut, ClipboardList, Settings, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { Tab } from '../App';
import { User } from 'firebase/auth';
import Logo from './Logo';
import { UserProfile } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  user?: User;
  onLogout?: () => void;
  profile?: UserProfile | null;
  onEditProfile?: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, profile, onEditProfile }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'work', label: 'Work Log', icon: ClipboardList },
    { id: 'invoice', label: 'Invoice Generator', icon: FileText },
  ] as const;

  return (
    <nav className="fixed md:relative bottom-0 left-0 w-full md:w-64 bg-slate-900 text-white flex md:flex-col md:h-full z-20">
      <div className="hidden md:block p-6">
        <div className="flex items-center gap-3 mb-2">
          <Logo className="w-8 h-8 rounded-lg shadow" />
          <h1 className="text-white font-bold text-lg tracking-tight truncate">{profile?.name || user?.displayName || 'Tilak Popat'}</h1>
        </div>
        <p className="text-slate-400 text-xs pl-11 -mt-2 truncate">{profile?.professionalTitle || 'Video Editor Pro'}</p>
      </div>
      
      <div className="flex-1 px-2 md:px-4 flex flex-row md:flex-col justify-around md:justify-start space-y-0 md:space-y-2 py-2 md:py-0 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "flex flex-col md:flex-row items-center md:space-x-3 px-3 py-2 rounded-lg transition-colors text-xs md:text-sm font-medium w-full max-w-[80px] md:max-w-none flex-shrink-0",
                isActive 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <Icon size={20} className={clsx(isActive ? "text-white" : "text-slate-400", "mb-1 md:mb-0")} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="hidden md:flex p-6 border-t border-slate-800 items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium">
              {(profile?.name || user?.displayName)?.charAt(0) || 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.name || user?.displayName || 'User Account'}</p>
            {onEditProfile && (
              <button 
                onClick={onEditProfile}
                className="text-[10px] text-slate-400 hover:text-indigo-400 flex items-center gap-1 transition-colors outline-none mt-0.5"
              >
                <Settings size={10} />
                Edit Profile
              </button>
            )}
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
