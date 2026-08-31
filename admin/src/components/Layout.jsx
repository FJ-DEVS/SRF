import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import logo1 from '../assets/logo1.png';
import {
  LayoutDashboard,
  Users,
  Package,
  UserCircle,
  Building2,
  Truck,
  ShoppingCart,
  BarChart3,
  Award,
  Trophy,
  LayoutGrid,
  Disc3,
  DatabaseBackup,
  LogOut,
  MoreHorizontal,
  X
} from 'lucide-react';

const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/consolidation', icon: BarChart3, label: 'Consolidation' },
  { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/items', icon: Package, label: 'Items' },
  { path: '/raks', icon: LayoutGrid, label: 'Raks' },
  { path: '/customers', icon: UserCircle, label: 'Customers' },
  { path: '/salesmen', icon: Users, label: 'Salesmen' },
  { path: '/rollers', icon: Disc3, label: 'Rollers' },
  { path: '/vendors', icon: Building2, label: 'Vendors' },
  { path: '/cargo', icon: Truck, label: 'Cargo' },
  { path: '/schemas', icon: Award, label: 'Schema' },
  { path: '/schema-leaderboard', icon: Trophy, label: 'Leaderboard' },
  { path: '/database', icon: DatabaseBackup, label: 'Database' },
];

// Mobile bottom bar: first 4 items get a tab, the rest live in the "More" sheet
const primaryItems = menuItems.slice(0, 4);
const moreItems = menuItems.slice(4);

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPage = menuItems.find((m) => m.path === location.pathname);

  return (
    <div className="flex h-dvh bg-slate-100 text-slate-900">
      {/* Sidebar (desktop only) */}
      <aside className="hidden w-64 flex-col bg-slate-950 text-slate-300 lg:flex">
        {/* Brand */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img
              src={logo1}
              alt="SRF"
              className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15"
            />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold tracking-tight text-white">SRF</p>
              <p className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-slate-500">Admin Console</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 scrollbar-none">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Menu</p>
          {menuItems.map((item) => {
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
                {/* Active indicator */}
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-400 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon className={`h-[17px] w-[17px] transition-colors ${isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold uppercase text-indigo-300 ring-1 ring-indigo-400/30">
              {user?.username?.charAt(0) || 'A'}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-slate-100">{user?.username}</p>
              <p className="text-[10.5px] text-slate-500">Administrator</p>
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5">
            <img src={logo1} alt="SRF" className="h-7 w-7 rounded-md object-cover" />
            <span className="font-display text-sm font-bold tracking-tight text-slate-900">
              {currentPage?.label || 'SRF Admin'}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-5 lg:px-8 lg:py-6 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+72px)] shadow-2xl lg:hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">More</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid grid-cols-4 gap-2 px-4 pb-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5 px-1">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-bold uppercase text-indigo-600 ring-1 ring-indigo-400/30">
                  {user?.username?.charAt(0) || 'A'}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{user?.username}</p>
                  <p className="text-[10.5px] text-slate-400">Administrator</p>
                </div>
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    setShowLogoutModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-rose-500 transition-colors hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-medium transition-colors ${
                isActive && !moreOpen ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-medium transition-colors ${
            moreOpen || moreItems.some((m) => m.path === location.pathname)
              ? 'text-indigo-600'
              : 'text-slate-400'
          }`}
          aria-label="More"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Logout confirmation modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Log out?"
        message="You will be signed out of the admin console. Any unsaved changes will be lost."
        type="warning"
        confirmLabel="Log out"
      />
    </div>
  );
};

export default Layout;
