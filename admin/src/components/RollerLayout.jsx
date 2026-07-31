import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import logo1 from '../assets/logo1.png';
import { ListChecks, LayoutGrid, LogOut } from 'lucide-react';

const rollerMenu = [
  { path: '/roller/orders', icon: ListChecks, label: 'To Roll' },
  { path: '/roller/placements', icon: LayoutGrid, label: 'Placements' }
];

// Mobile-first shell: a compact top bar and a thumb-reachable bottom tab bar.
// It widens to a centred column on tablets and desktops rather than switching
// to a sidebar, so the roller sees the same layout on every device.
const RollerLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/roller/login');
  };

  const currentPage = rollerMenu.find((m) => m.path === location.pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur">
        <img src={logo1} alt="SRF" className="h-7 w-7 rounded-md object-cover" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-sm font-bold tracking-tight text-slate-900">
            {currentPage?.label || 'Roller'}
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

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-3 py-3 pb-28 sm:px-5 sm:py-5">
          {children}
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {rollerMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
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
        message="You will be signed out of the roller app."
        type="warning"
        confirmLabel="Log out"
      />
    </div>
  );
};

export default RollerLayout;
