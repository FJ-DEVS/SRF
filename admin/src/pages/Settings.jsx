import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import { Clock, MoonStar, Save, Ban, Info } from 'lucide-react';

// <input type="datetime-local"> works in the browser's own time — these move
// between that and real instants
const pad = (n) => String(n).padStart(2, '0');
const toInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromInput = (value) => (value ? new Date(value) : null);

const formatWhen = (date) =>
  new Date(date).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }).replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// The usual night closure: 6 PM today → 8 AM tomorrow
const tonightPreset = () => {
  const from = new Date();
  from.setHours(18, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setHours(8, 0, 0, 0);
  return { from: toInput(from), to: toInput(to) };
};

const stateOf = (enabled, from, to, now = new Date()) => {
  if (!enabled || !from || !to) return 'off';
  if (now < from) return 'scheduled';
  if (now >= to) return 'expired';
  return 'active';
};

const STATE_BADGES = {
  off: { label: 'Off', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  scheduled: { label: 'Scheduled', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'Ordering closed now', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  expired: { label: 'Ended', cls: 'bg-slate-100 text-slate-500 ring-slate-200' }
};

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // What is stored on the server
  const [saved, setSaved] = useState(null);
  // The form
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'error' });
  const [confirmOff, setConfirmOff] = useState(false);
  // Re-render each minute so the status badge follows the clock
  const [, setTick] = useState(0);

  const showAlert = (title, message, type = 'error') => setAlert({ open: true, title, message, type });

  const applyServer = (data) => {
    setSaved(data);
    setFrom(toInput(data?.from));
    setTo(toInput(data?.to));
    setNote(data?.note || '');
  };

  useEffect(() => {
    api.get('/settings/order-restriction')
      .then((res) => applyServer(res.data.data))
      .catch((err) => showAlert('Could not load settings', err.response?.data?.message || err.message))
      .finally(() => setLoading(false));

    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const fromDate = fromInput(from);
  const toDate = fromInput(to);
  const formError = useMemo(() => {
    if (!from || !to) return 'Pick both a start and an end time.';
    if (toDate <= fromDate) return 'The end time must be after the start time.';
    if (toDate <= new Date()) return 'The end time is already in the past.';
    return '';
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedState = saved
    ? stateOf(saved.enabled, saved.from && new Date(saved.from), saved.to && new Date(saved.to))
    : 'off';
  const badge = STATE_BADGES[savedState];

  const preview = !formError
    ? `Orders cannot be placed from ${formatWhen(fromDate)} to ${formatWhen(toDate)}. Please place your order after this time.${note.trim() ? `\n\n${note.trim()}` : ''}`
    : '';

  const save = async (enabled) => {
    setSaving(true);
    try {
      const res = await api.put('/settings/order-restriction', {
        enabled,
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
        note,
        timeZone: browserTimeZone()
      });
      applyServer(res.data.data);
      showAlert(
        enabled ? 'Order restriction saved' : 'Order restriction turned off',
        enabled
          ? 'Salesmen and customers will not be able to place orders during this time.'
          : 'Salesmen and customers can place orders again.',
        'success'
      );
    } catch (err) {
      showAlert('Could not save', err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
      setConfirmOff(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
      </div>
    );
  }

  return (
    <div className="srf-page">
      <PageHeader title="Settings" subtitle="App-wide rules for salesmen and customers" />

      <section className="srf-card max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[15px] font-bold text-slate-900">Order restriction</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Stop salesmen and customers from placing orders for a period of time. Admins can still place orders.
              </p>
            </div>
          </div>
          <span className={`srf-badge ring-1 ring-inset ${badge.cls}`}>{badge.label}</span>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {saved?.enabled && saved.from && saved.to && savedState !== 'expired' && (
            <div className={`rounded-lg px-3 py-2.5 text-[13px] ring-1 ring-inset ${
              savedState === 'active' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
            }`}>
              {savedState === 'active' ? 'Ordering is closed until ' : 'Ordering will close from '}
              {savedState === 'active'
                ? <strong>{formatWhen(saved.to)}</strong>
                : <><strong>{formatWhen(saved.from)}</strong> to <strong>{formatWhen(saved.to)}</strong></>}
              .
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const p = tonightPreset();
                setFrom(p.from);
                setTo(p.to);
              }}
              className="srf-chip"
            >
              <MoonStar className="h-3.5 w-3.5" />
              Today 6 PM → Tomorrow 8 AM
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700" htmlFor="restrict-from">
                Closed from
              </label>
              <input
                id="restrict-from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700" htmlFor="restrict-to">
                Open again at
              </label>
              <input
                id="restrict-to"
                type="datetime-local"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700" htmlFor="restrict-note">
              Extra note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="restrict-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Stock count in progress"
              className="w-full resize-none"
            />
          </div>

          {from && to && formError && (
            <p className="text-xs font-medium text-rose-600">{formError}</p>
          )}

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Info className="h-3 w-3" />
                Message shown in the app
              </p>
              <p className="whitespace-pre-line text-[13px] text-slate-700">{preview}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
          {saved?.enabled && savedState !== 'expired' && (
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              disabled={saving}
              className="srf-btn srf-btn-secondary text-rose-600"
            >
              <Ban className="h-4 w-4" />
              Turn off
            </button>
          )}
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving || Boolean(formError)}
            className="srf-btn srf-btn-primary"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save restriction'}
          </button>
        </div>
      </section>

      <AlertModal
        isOpen={alert.open}
        onClose={() => setAlert((a) => ({ ...a, open: false }))}
        title={alert.title}
        message={alert.message}
        type={alert.type}
      />

      <ConfirmModal
        isOpen={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={() => save(false)}
        title="Turn off order restriction?"
        message="Salesmen and customers will be able to place orders straight away."
        type="warning"
        confirmLabel="Turn off"
      />
    </div>
  );
};

export default Settings;
