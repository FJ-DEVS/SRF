import React, { useMemo, useState } from 'react';
import { Search, X, KeyRound } from 'lucide-react';

// Fewer options than this need no search box
const SEARCH_FROM = 8;

// One permission list: "every one" (null) or the ticked options
const PermissionSection = ({ section, state, onChange }) => {
  const [query, setQuery] = useState('');
  const { all, selected } = state;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return section.options;
    return section.options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q));
  }, [query, section.options]);

  const toggle = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ all, selected: next });
  };

  // Ticks or clears the options the search currently shows
  const setVisible = (checked) => {
    const next = new Set(selected);
    visible.forEach((o) => (checked ? next.add(o.value) : next.delete(o.value)));
    onChange({ all, selected: next });
  };

  const count = section.options.filter((o) => selected.has(o.value)).length;

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">{section.label}</p>
          <p className="text-[11px] text-slate-400">
            {all ? `All ${section.options.length}, including any added later` : `${count} of ${section.options.length} allowed`}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] font-medium text-slate-600">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => onChange({ all: e.target.checked, selected })}
            className="h-4 w-4 accent-indigo-600"
          />
          {section.allLabel}
        </label>
      </div>

      {!all && (
        <div className="space-y-2 border-t border-slate-100 p-2.5">
          {section.options.length >= SEARCH_FROM && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${section.label.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full !pl-9"
              />
            </div>
          )}
          <div className="flex items-center gap-3 px-1 text-[11px] font-semibold">
            <button type="button" onClick={() => setVisible(true)} className="text-indigo-600 hover:text-indigo-500">
              Select {query ? 'shown' : 'all'}
            </button>
            <button type="button" onClick={() => setVisible(false)} className="text-slate-400 hover:text-slate-600">
              Clear {query ? 'shown' : 'all'}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 scrollbar-thin">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-slate-400">Nothing matches</p>
            ) : (
              visible.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2.5 border-b border-slate-50 px-3 py-2 last:border-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="h-4 w-4 shrink-0 accent-indigo-600"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{o.label}</span>
                  {o.sub && <span className="shrink-0 text-[11px] text-slate-400">{o.sub}</span>}
                </label>
              ))
            )}
          </div>
          {count === 0 && (
            <p className="px-1 text-[11px] font-medium text-amber-600">{section.emptyWarning}</p>
          )}
        </div>
      )}
    </div>
  );
};

// Permission manager for one record. Each section is a list that is either
// open to every option (saved as null) or limited to the ticked ones (saved
// as an array of their values). `onSave` gets { [section.key]: null | [] }.
const PermissionsModal = ({ title, subtitle, sections, loading = false, onClose, onSave }) => {
  const [states, setStates] = useState({});
  const [saving, setSaving] = useState(false);

  // A list that is not narrowed yet starts with everything ticked, so
  // switching "all" off means unticking what should go
  const stateFor = (section) =>
    states[section.key] || {
      all: section.value == null,
      selected: new Set(section.value == null ? section.options.map((o) => o.value) : section.value.map(String))
    };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = {};
      sections.forEach((section) => {
        const { all, selected } = stateFor(section);
        // Keep only options that still exist
        values[section.key] = all ? null : section.options.filter((o) => selected.has(o.value)).map((o) => o.value);
      });
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="srf-modal-title truncate">{title}</h3>
              {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="srf-icon-btn">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="srf-modal-body space-y-3">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
            </div>
          ) : (
            sections.map((section) => (
              <PermissionSection
                key={section.key}
                section={section}
                state={stateFor(section)}
                onChange={(next) => setStates((prev) => ({ ...prev, [section.key]: next }))}
              />
            ))
          )}
        </div>

        <div className="srf-modal-footer">
          <button type="button" onClick={onClose} className="srf-btn srf-btn-secondary">Cancel</button>
          <button type="button" onClick={handleSave} disabled={loading || saving} className="srf-btn srf-btn-primary">
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionsModal;
