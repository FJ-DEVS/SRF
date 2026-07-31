import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Disc3, ArrowRight } from 'lucide-react';
import logo1 from '../assets/logo1.png';

const ROLES = [
  {
    path: '/login',
    icon: ShieldCheck,
    title: 'Admin',
    text: 'Orders, inventory, reports and staff accounts.',
    accent: 'group-hover:border-indigo-300 group-hover:bg-indigo-50/60',
    iconWrap: 'bg-indigo-50 text-indigo-600 ring-indigo-100'
  },
  {
    path: '/roller/login',
    icon: Disc3,
    title: 'Roller',
    text: 'Roll pending orders and place items into raks.',
    accent: 'group-hover:border-emerald-300 group-hover:bg-emerald-50/60',
    iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-100'
  }
];

// Entry point — picks which sign-in screen to send you to, so neither role has
// to know a URL by heart
const Landing = () => (
  <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-slate-50 px-5 py-12">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-indigo-100/70 to-transparent" />

    <div className="relative mx-auto w-full max-w-md">
      <div className="flex items-center gap-3">
        <img src={logo1} alt="SRF" className="h-12 w-12 rounded-xl object-cover shadow-md ring-1 ring-slate-200" />
        <div className="leading-tight">
          <p className="font-display text-lg font-bold tracking-tight text-slate-900">SRF</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Sales &amp; Distribution
          </p>
        </div>
      </div>

      <h1 className="mt-8 font-display text-2xl font-bold tracking-tight text-slate-900">
        How are you signing in?
      </h1>
      <p className="mt-1.5 text-[13px] text-slate-500">
        Choose your role to continue to the right login screen.
      </p>

      <div className="mt-7 space-y-3">
        {ROLES.map((role) => {
          const Icon = role.icon;
          return (
            <Link
              key={role.path}
              to={role.path}
              className={`group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${role.accent}`}
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-4 ${role.iconWrap}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-bold text-slate-900">
                  Login as {role.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{role.text}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </Link>
          );
        })}
      </div>

      <p className="mt-9 text-center text-[11px] font-medium text-slate-400">
        © {new Date().getFullYear()} SRF · Restricted access
      </p>
    </div>
  </div>
);

export default Landing;
