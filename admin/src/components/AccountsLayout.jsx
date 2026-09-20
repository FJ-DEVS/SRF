import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import logo1 from '../assets/logo1.png';
import { LayoutDashboard, ShoppingCart, LogOut } from 'lucide-react';

const accountsMenu = [
  { path: '/accounts/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts/orders', icon: ShoppingCart, label: 'Orders' }
];

// Desk-first shell: the admin console's dark sidebar on a laptop, a compact
// top bar plus bottom tabs on a phone. Only two destinations, so no "More"
// sheet is needed.
const AccountsLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/accounts/login');
  };

  const currentPage = accountsMenu.find((m) => m.path === location.pathname);
  const initial = (user?.name || user?.username || 'A').charAt(0);

  return (
    <div className="flex h-dvh bg-slate-100 text-slate-900">
      {/* Sidebar (desktop only) */}
      <aside className="hidden w-64 flex-col bg-slate-950 text-slate-300 lg:flex">
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <Link to="/accounts/dashboard" className="flex items-center gap-3">
            <img src={logo1} alt="SRF" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15" />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold tracking-tight text-white">SRF</p>
              <p className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-slate-500">Accounts</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 scrollbar-none">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Menu</p>
          {accountsMenu.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-amber-400 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon className={`h-[17px] w-[17px] transition-colors ${isActive ? 'text-amber-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold uppercase text-amber-300 ring-1 ring-amber-400/30">
              {initial}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-slate-100">{user?.name || user?.username}</p>
              <p className="text-[10.5px] text-slate-500">Accounts Manager</p>
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden">
          <img src={logo1} alt="SRF" className="h-7 w-7 rounded-md object-cover" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-sm font-bold tracking-tight text-slate-900">
              {currentPage?.label || 'Accounts'}
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {user?.name || user?.username}
            </p>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            className="ml-auto rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-5 lg:px-8 lg:py-6 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {accountsMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-amber-600' : 'text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Log out?"
        message="You will be signed out of the accounts console."
        type="warning"
        confirmLabel="Log out"
      />
    </div>
  );
};

export default AccountsLayout;
