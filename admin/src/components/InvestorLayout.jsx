import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import logo1 from '../assets/logo1.png';
import {
  LayoutDashboard,
  Layers,
  Users,
  UserCircle,
  BarChart3,
  Trophy,
  WalletCards,
  Hourglass,
  LogOut,
  MoreHorizontal,
  X
} from 'lucide-react';

const menuItems = [
  { path: '/investor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/investor/categories', icon: Layers, label: 'Categories' },
  { path: '/investor/salesmen', icon: Users, label: 'Salesmen' },
  { path: '/investor/customers', icon: UserCircle, label: 'Customers' },
  { path: '/investor/consolidation', icon: BarChart3, label: 'Consolidation' },
  { path: '/investor/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { path: '/investor/outstandings', icon: WalletCards, label: 'Outstandings' },
  { path: '/investor/non-moving', icon: Hourglass, label: 'Non-moving Stock' }
];

// Phones: the first four get a tab, the rest live in the "More" sheet
const primaryItems = menuItems.slice(0, 4);
const moreItems = menuItems.slice(4);

// A page and the drill-down pages under it share a menu entry
const isActive = (item, pathname) => pathname === item.path || pathname.startsWith(`${item.path}/`);

// The investor dashboard's shell — the admin console's layout, with only the
// read-only reports in the menu
const InvestorLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/investor/login');
  };

  const current = menuItems.find((m) => isActive(m, location.pathname));
  const displayName = user?.name || user?.username;

  return (
    <div className="flex h-dvh bg-slate-100 text-slate-900">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 flex-col bg-slate-950 text-slate-300 lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Link to="/investor/dashboard" className="flex items-center gap-3">
            <img src={logo1} alt="SRF" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15" />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold tracking-tight text-white">SRF</p>
              <p className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-slate-500">Investor Dashboard</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Reports</p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, location.pathname);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                  active ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-violet-400 transition-opacity ${
                    active ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon className={`h-[17px] w-[17px] ${active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold uppercase text-violet-300 ring-1 ring-violet-400/30">
              {displayName?.charAt(0) || 'I'}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-slate-100">{displayName}</p>
              <p className="text-[10.5px] text-slate-500">Investor</p>
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (phones and tablets) */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur lg:hidden">
          <img src={logo1} alt="SRF" className="h-7 w-7 rounded-md object-cover" />
          <span className="font-display text-sm font-bold tracking-tight text-slate-900">{current?.label || 'Investor'}</span>
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
          <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-5 lg:px-8 lg:py-6 lg:pb-6">{children}</div>
        </main>
      </div>

      {/* "More" sheet (phones) */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+72px)] shadow-2xl lg:hidden">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">More reports</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid grid-cols-3 gap-2 px-4 pb-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item, location.pathname);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11px] font-medium ${
                      active ? 'bg-violet-50 text-violet-600' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-violet-500' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}

      {/* Bottom bar (phones) */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, location.pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-medium ${
                active && !moreOpen ? 'text-violet-600' : 'text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-medium ${
            moreOpen || moreItems.some((m) => isActive(m, location.pathname)) ? 'text-violet-600' : 'text-slate-400'
          }`}
          aria-label="More reports"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Log out?"
        message="You will be signed out of the investor dashboard."
        type="warning"
        confirmLabel="Log out"
      />
    </div>
  );
};

export default InvestorLayout;
