import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, User, Lock, ArrowRight, Layers, PackageCheck, Users2, AlertCircle } from 'lucide-react';
import logo1 from '../assets/logo1.png';

const FEATURES = [
  {
    icon: Layers,
    title: 'Live inventory',
    text: 'Every laminate sheet and roll, tracked in real time.'
  },
  {
    icon: PackageCheck,
    title: 'Order workflow',
    text: 'From pending to delivered — nothing slips through.'
  },
  {
    icon: Users2,
    title: 'Field sales, synced',
    text: 'Your salesmen and back office on the same page.'
  }
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex bg-white">
      {/* Brand panel — desktop only */}
      <div className="relative hidden lg:flex lg:w-[46%] xl:w-[42%] flex-col justify-between overflow-hidden bg-slate-950 px-12 py-10 text-white">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/3 translate-y-1/3 rounded-full bg-sky-500/20 blur-[130px]" />
        {/* Fine grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
            backgroundSize: '44px 44px'
          }}
        />

        <div className="relative flex items-center gap-3">
          <img src={logo1} alt="SRF" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/20" />
          <div className="leading-tight">
            <p className="font-display text-base font-bold tracking-tight">SRF</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Sales &amp; Distribution</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-[2.1rem] xl:text-[2.5rem] font-bold leading-[1.15] tracking-tight">
            Run your laminate business
            <span className="block bg-gradient-to-r from-sky-300 via-indigo-300 to-indigo-400 bg-clip-text text-transparent">
              from one place.
            </span>
          </h2>
          <div className="mt-10 space-y-5">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                  <feature.icon className="h-4 w-4 text-sky-300" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{feature.title}</p>
                  <p className="text-[13px] text-slate-400">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] font-medium tracking-wide text-slate-500">
          © {new Date().getFullYear()} SRF · Admin Console
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 flex-col justify-center bg-slate-50 px-5 py-10 sm:px-12">
        {/* Subtle top accent for mobile */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-100/60 to-transparent lg:hidden" />

        <div className="relative mx-auto w-full max-w-[24rem]">
          {/* Mobile brand */}
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <img src={logo1} alt="SRF" className="h-11 w-11 rounded-xl object-cover shadow-md ring-1 ring-slate-200" />
            <div className="leading-tight">
              <p className="font-display text-base font-bold tracking-tight text-slate-900">SRF</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Sales &amp; Distribution</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Sign in to manage orders, inventory and your sales team.
          </p>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <p className="text-[13px] font-medium text-rose-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Email or username"
                  className="w-full !pl-10 py-2.5 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full !pl-10 !pr-11 py-2.5 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-900/15 disabled:cursor-not-allowed disabled:opacity-60"
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
            Restricted area — authorised administrators only
          </p>
          <p className="mt-2 text-center">
            <Link to="/" className="text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
              Not an admin? Change role
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
