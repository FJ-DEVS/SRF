import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, User, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import logo1 from '../../assets/logo1.png';

// Single-column, thumb-friendly sign-in — the roller works on a phone
const RollerLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginRoller, revokedNotice, setRevokedNotice } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setRevokedNotice('');
    setLoading(true);

    const result = await loginRoller(username, password);

    if (result.success) {
      navigate('/roller/orders');
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  const notice = error || revokedNotice;

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-50 px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-100/60 to-transparent" />

      <div className="relative mx-auto w-full max-w-[22rem]">
        <div className="mb-9 flex items-center gap-3">
          <img src={logo1} alt="SRF" className="h-11 w-11 rounded-xl object-cover shadow-md ring-1 ring-slate-200" />
          <div className="leading-tight">
            <p className="font-display text-base font-bold tracking-tight text-slate-900">SRF</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Roller App</p>
          </div>
        </div>

        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Roller sign in</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">
          Roll pending orders and place items into raks.
        </p>

        {notice && (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <p className="text-[13px] font-medium text-rose-700">{notice}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="roller-username" className="mb-1.5 block">Username</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="roller-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                placeholder="Your username"
                className="w-full !pl-10 rounded-xl py-3"
              />
            </div>
          </div>

          <div>
            <label htmlFor="roller-password" className="mb-1.5 block">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="roller-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="w-full !pl-10 !pr-11 rounded-xl py-3"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-900/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-[11px] font-medium text-slate-400">
          Credentials are issued by your administrator
        </p>
        <p className="mt-2 text-center">
          <Link to="/" className="text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
            Not a roller? Change role
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RollerLogin;
