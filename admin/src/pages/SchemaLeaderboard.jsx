import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { Trophy, Medal, Award, Crown } from 'lucide-react';

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const rankBadge = (rank) => {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-semibold text-slate-400">#{rank}</span>;
};

const SchemaLeaderboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [schemas, setSchemas] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('schema') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSchemas();
  }, []);

  useEffect(() => {
    if (selectedId) fetchLeaderboard(selectedId);
    else setResult(null);
  }, [selectedId]);

  const fetchSchemas = async () => {
    try {
      const response = await api.get('/schemas', { params: { limit: 1000 } });
      if (response.data.success) {
        const list = response.data.data;
        setSchemas(list);
        // Default to the query-param schema, else the first one.
        if (!selectedId && list.length > 0) setSelectedId(list[0]._id);
      }
    } catch (error) {
      console.error('Error fetching schemas:', error);
    }
  };

  const fetchLeaderboard = async (id) => {
    try {
      setLoading(true);
      const response = await api.get(`/schemas/${id}/leaderboard`);
      if (response.data.success) setResult(response.data.data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    setSearchParams(id ? { schema: id } : {});
  };

  const leaderboard = result?.leaderboard || [];
  const topTierPoints =
    result?.schema?.tiers?.length > 0
      ? Math.max(...result.schema.tiers.map((t) => t.pointsRequired))
      : null;

  return (
    <div className="srf-page">
      <PageHeader title="Leaderboard" subtitle="Salesman standings for a schema period" />

      {/* Schema selector */}
      <div className="srf-toolbar">
        <div className="w-full sm:max-w-sm">
          <select value={selectedId} onChange={(e) => handleSelect(e.target.value)} className="w-full">
            <option value="">Select a schema…</option>
            {schemas.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {result?.schema && (
        <div className="srf-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{result.schema.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDate(result.schema.fromDate)} – {formatDate(result.schema.toDate)}
              {result.schema.runBy ? ` · Run by ${result.schema.runBy}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : !selectedId ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Trophy className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">Select a schema</p>
            <p className="mt-1 text-xs text-slate-400">Choose a schema to view its leaderboard.</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Award className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No salesmen yet</p>
            <p className="mt-1 text-xs text-slate-400">No qualifying sales in this period.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th className="w-16">Rank</th>
                    <th>Salesman</th>
                    <th className="text-right">Points</th>
                    <th>Tier / Gift</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => {
                    const atTop = topTierPoints !== null && row.points >= topTierPoints;
                    return (
                      <tr key={row.salesmanId} className={atTop ? 'bg-amber-50/60' : ''}>
                        <td>
                          <span className="flex h-6 w-6 items-center justify-center">{rankBadge(row.rank)}</span>
                        </td>
                        <td className="font-semibold text-slate-900">
                          {row.name}
                          <span className="ml-1.5 text-xs font-normal text-slate-400">@{row.username}</span>
                        </td>
                        <td className="text-right font-semibold text-slate-900">{row.points}</td>
                        <td>
                          {row.tier ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                              <Award className="h-3 w-3" />
                              {row.tier}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {leaderboard.map((row) => {
                const atTop = topTierPoints !== null && row.points >= topTierPoints;
                return (
                  <div key={row.salesmanId} className={`flex items-center gap-3 p-3.5 ${atTop ? 'bg-amber-50/60' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">{rankBadge(row.rank)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{row.tier || 'No tier yet'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">{row.points} pts</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SchemaLeaderboard;
