import React, { useState } from 'react';
import api from '../utils/api';
import { todayInput, noteDayInput, noteDayFull, noteDayLabel, sortNotes } from '../utils/rollerNotes';
import { X, NotebookPen, CalendarDays, Pencil, Trash2 } from 'lucide-react';

const NOTE_MAX = 500;

const writtenAt = (value) => {
  const d = new Date(value);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
};

// Mounted only while the dialog is open, so it always opens on a blank "add"
// form without any reset bookkeeping.
const NotesPanel = ({ order, subtitle, onClose, onChange }) => {
  // The id of the note being edited, or null while adding a new one
  const [editing, setEditing] = useState(null);
  const [date, setDate] = useState(todayInput);
  const [text, setText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const notes = sortNotes(order.rollerNotes);
  const base = `/orders/roller/${order._id}/notes`;

  const reset = () => {
    setEditing(null);
    setDate(todayInput());
    setText('');
    setError('');
  };

  const startEdit = (note) => {
    setEditing(note._id);
    setDate(noteDayInput(note.date));
    setText(note.text);
    setError('');
    setConfirmDelete(null);
  };

  // Runs one change and hands the notes the server comes back with to the chat
  const run = async (request, after) => {
    try {
      setSaving(true);
      setError('');
      const response = await request();
      if (response.data.success) {
        onChange(response.data.data);
        after();
      }
    } catch (err) {
      // An edited note another roller removed meanwhile — saving again adds it back
      if (editing && err.response?.status === 404) setEditing(null);
      setError(err.response?.data?.message || 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!date) return setError('Pick a date for the note');
    if (!text.trim()) return setError('Write something in the note');
    const body = { date, text: text.trim() };
    run(() => (editing ? api.put(`${base}/${editing}`, body) : api.post(base, body)), reset);
  };

  const remove = (note) =>
    run(() => api.delete(`${base}/${note._id}`), () => {
      setConfirmDelete(null);
      if (editing === note._id) reset();
    });

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Order notes</h3>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="srf-modal-body min-h-0 flex-1 space-y-2.5">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <NotebookPen className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">No notes yet</p>
              <p className="mt-1 text-xs text-slate-400">Pick a date and write what to remember about this order.</p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note._id}
                className={`rounded-xl bg-white px-3.5 py-2.5 ring-1 ${
                  editing === note._id ? 'ring-2 ring-indigo-400' : 'ring-slate-200/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-[12.5px]" title={noteDayFull(note.date)}>
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className="font-semibold text-slate-900">{noteDayLabel(note.date)}</span>
                    <span className="truncate text-slate-400">{noteDayFull(note.date)}</span>
                  </p>
                  <div className="ml-auto flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      disabled={saving}
                      className="srf-icon-btn"
                      aria-label="Edit note"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(note._id)}
                      disabled={saving}
                      className="srf-icon-btn hover:!bg-rose-50 hover:!text-rose-600"
                      aria-label="Delete note"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-700">{note.text}</p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {note.createdBy?.name || note.createdBy?.username || 'A roller'} · {writtenAt(note.createdAt)}
                </p>

                {confirmDelete === note._id && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2">
                    <p className="flex-1 text-[12px] font-medium text-rose-700">Delete this note?</p>
                    <button type="button" onClick={() => setConfirmDelete(null)} disabled={saving} className="srf-btn srf-btn-secondary !px-2.5 !py-1">
                      Keep
                    </button>
                    <button type="button" onClick={() => remove(note)} disabled={saving} className="srf-btn srf-btn-danger !px-2.5 !py-1">
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={submit} className="shrink-0 space-y-2.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] sm:px-5 sm:pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="note-date">{editing ? 'Edit note' : 'Add a note'}</label>
            <span className="text-[11px] tabular-nums text-slate-400">{text.length}/{NOTE_MAX}</span>
          </div>
          <input
            id="note-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError('');
            }}
            className="w-full"
            aria-label="Note date"
          />
          <textarea
            rows={3}
            maxLength={NOTE_MAX}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder="e.g. Customer asked to hold until Monday"
            className="w-full resize-none"
            aria-label="Note"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2.5">
            {editing && (
              <button type="button" onClick={reset} disabled={saving} className="srf-btn srf-btn-secondary">
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving} className="srf-btn srf-btn-primary">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// A roller's dated notes on one order: read them, add one, edit or remove any.
// onChange receives the order's notes after every change.
const OrderNotesModal = ({ isOpen, onClose, order, subtitle, onChange }) => {
  if (!isOpen || !order) return null;
  return <NotesPanel key={order._id} order={order} subtitle={subtitle} onClose={onClose} onChange={onChange} />;
};

export default OrderNotesModal;
