import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Wallet, Users, TrendingUp, AlertTriangle,
  CheckCircle, MapPin, Clock, Sun, Moon, Scale, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatBDT } from '../lib/money';
import { useTheme } from '../contexts/ThemeContext';
import {
  calculateTripFinancials,
  calculateSettlementPlan,
} from '../lib/financial-calculations';
import type {
  Trip, TripMember, Contribution, Expense, ExpenseAllocation,
  FundTransaction, TripFinancials, SettlementPlan,
} from '../types';
import { format } from 'date-fns';

/**
 * Public Share View
 *
 * Security model:
 * - This page calls a Supabase Edge Function (`get-shared-trip`) passing the raw token.
 * - The Edge Function hashes the token on the server, validates it against trip_share_links,
 *   checks revocation and expiry, then returns only public-safe trip data.
 * - No admin credentials or private data are ever exposed.
 * - If the Edge Function is not deployed, we fall back to a clear error message.
 */

interface PublicTripResponse {
  trip: Pick<Trip, 'id' | 'name' | 'description' | 'location' | 'start_date' | 'end_date' | 'currency' | 'status'>;
  members: TripMember[];
  contributions: Contribution[];
  expenses: Expense[];
  allocations: ExpenseAllocation[];
  fund_transactions: FundTransaction[];
}

export function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicTripResponse | null>(null);
  const [financials, setFinancials] = useState<TripFinancials | null>(null);
  const [settlementPlan, setSettlementPlan] = useState<SettlementPlan | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'balances' | 'expenses'>('overview');

  useEffect(() => {
    if (!token) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }
    loadSharedTrip(token);
  }, [token]);

  const loadSharedTrip = async (rawToken: string) => {
    try {
      setLoading(true);

      // Call the Edge Function
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'get-shared-trip',
        { body: { token: rawToken } }
      );

      if (fnError) {
        if (fnError.message?.includes('not found') || fnError.message?.includes('404')) {
          setError('This share link is invalid, expired, or has been revoked.');
        } else {
          setError('Unable to load this shared trip. Please check the link or try again later.');
        }
        return;
      }

      if (!result || result.error) {
        setError(result?.error ?? 'This share link is invalid or has been revoked.');
        return;
      }

      const parsed = result as PublicTripResponse;
      setData(parsed);

      // Calculate financials client-side
      const fin = calculateTripFinancials(
        parsed.members,
        parsed.contributions,
        parsed.expenses,
        parsed.allocations,
        parsed.fund_transactions,
      );
      setFinancials(fin);
      setSettlementPlan(calculateSettlementPlan(fin));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading trip...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-6 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Link Not Available</h1>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <Link to="/" className="btn btn-primary text-sm w-full">Go Home</Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { trip, members } = data;
  const activeMembers = members.filter(m => m.status === 'active');
  const validContributions = data.contributions.filter(c => c.status === 'valid');
  const validExpenses = data.expenses.filter(e => e.status === 'valid');

  const totalTripExpenses = validExpenses.reduce((sum, e) => sum + e.amount, 0);
  const perMemberShare = activeMembers.length > 0 ? Math.round(totalTripExpenses / activeMembers.length) : 0;

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Wallet size={16} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
              {trip.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
            </button>
            <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">Read Only</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {/* Trip Info */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-5 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{trip.name}</h1>
          {trip.location && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mt-1">
              <MapPin size={13} /> {trip.location}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mt-1">
            <Clock size={11} />
            {format(new Date(trip.start_date), 'MMM d')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
          </div>
          {trip.description && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{trip.description}</p>}
        </div>

        {/* Financial Overview */}
        {financials && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-100 dark:border-green-900/60 rounded-xl p-3 text-center">
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Contributions</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">{formatBDT(financials.totalContributions)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 rounded-xl p-3 text-center">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Expenses</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300">
                {formatBDT(financials.totalGroupFundExpenses + financials.totalPersonalExpenses)}
              </p>
            </div>
            <div className={`${financials.groupCashBalance >= 0 ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/60' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/60'} border rounded-xl p-3 text-center`}>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Cash Balance</p>
              <p className={`text-lg font-bold ${financials.groupCashBalance >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {formatBDT(financials.groupCashBalance)}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tab-nav mb-5">
          {(['overview', 'balances', 'expenses'] as const).map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Users size={14} /> Members ({activeMembers.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {members.map(m => (
                  <span key={m.id} className={`badge ${m.status === 'active' ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                    {m.name}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <TrendingUp size={14} className="text-green-600 dark:text-green-400" /> Recent Contributions
              </h2>
              <div className="space-y-2">
                {validContributions.slice(0, 8).map(c => {
                  const member = members.find(m => m.id === c.member_id);
                  return (
                    <div key={c.id} className="flex justify-between items-center text-sm p-2.5 bg-green-50 dark:bg-green-950/40 border border-green-100 dark:border-green-900/40 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-200">{member?.name ?? '—'}</span>
                      <span className="font-semibold text-green-700 dark:text-green-300">+{formatBDT(c.amount)}</span>
                    </div>
                  );
                })}
                {validContributions.length === 0 && (
                  <p className="text-sm text-slate-400">No contributions recorded</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Balances Tab: Equal Share & Net Settlement */}
        {activeTab === 'balances' && financials && (
          <div className="space-y-5">
            {/* Equal Share KPI Card */}
            <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 rounded-xl p-4 shadow-sm bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-blue-950/20">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Scale size={14} /> Equal Share Per Member
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatBDT(perMemberShare)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Total Expenses ({formatBDT(totalTripExpenses)}) ÷ {activeMembers.length || 1}
              </p>
            </div>

            {/* Member Settlements List */}
            <div className="space-y-3">
              {activeMembers.map(member => {
                const totalContributed = validContributions
                  .filter(c => c.member_id === member.id)
                  .reduce((sum, c) => sum + c.amount, 0);

                const personallyPaid = validExpenses
                  .filter(e => e.payment_source === 'personal' && e.payer_member_id === member.id)
                  .reduce((sum, e) => sum + e.amount, 0);

                const totalPaid = totalContributed + personallyPaid;
                const netBalance = totalPaid - perMemberShare;

                const isSurplus = netBalance > 0;
                const isDue = netBalance < 0;
                const isSettled = netBalance === 0;

                return (
                  <div key={member.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/60 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{member.name[0].toUpperCase()}</span>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
                      </div>

                      <div>
                        {isSurplus && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <ArrowDownLeft size={13} /> Gets back {formatBDT(netBalance)}
                          </span>
                        )}
                        {isDue && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border border-red-300 dark:border-red-800">
                            <ArrowUpRight size={13} /> Owes {formatBDT(Math.abs(netBalance))}
                          </span>
                        )}
                        {isSettled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <CheckCircle size={13} /> Settled (৳0)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-center">
                      <div>
                        <p className="text-slate-400 dark:text-slate-500 mb-0.5">Contributed</p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{formatBDT(totalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 dark:text-slate-500 mb-0.5">Equal Share</p>
                        <p className="font-semibold text-slate-600 dark:text-slate-400">{formatBDT(perMemberShare)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 dark:text-slate-500 mb-0.5">Net Balance</p>
                        <p className={`font-bold ${isSurplus ? 'text-emerald-600 dark:text-emerald-400' : isDue ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {isSurplus ? `+${formatBDT(netBalance)}` : isDue ? `-${formatBDT(Math.abs(netBalance))}` : formatBDT(0)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Suggested Settlements */}
            {settlementPlan && settlementPlan.actions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Suggested Settlements</h3>
                <div className="space-y-2">
                  {settlementPlan.actions.map((action, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3 text-sm">
                      {action.type === 'member_to_member' && (
                        <span>
                          <strong className="text-red-600 dark:text-red-400">{action.from.name}</strong>
                          {' pays '}
                          <strong className="text-emerald-600 dark:text-emerald-400">{action.to.name}</strong>
                          {' → '}
                          <strong className="text-blue-700 dark:text-blue-300">{formatBDT(action.amount)}</strong>
                        </span>
                      )}
                      {action.type === 'group_fund_refund' && (
                        <span>
                          Group Fund refunds{' '}
                          <strong className="text-emerald-600 dark:text-emerald-400">{action.to.name}</strong>
                          {' → '}
                          <strong className="text-emerald-600 dark:text-emerald-400">{formatBDT(action.amount)}</strong>
                        </span>
                      )}
                      {action.type === 'additional_contribution_needed' && (
                        <span>
                          <strong className="text-red-600 dark:text-red-400">{action.from.name}</strong>
                          {' needs to contribute '}
                          <strong className="text-red-600 dark:text-red-400">{formatBDT(action.amount)}</strong>
                          {' more'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {validExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No expenses recorded</p>
            ) : (
              validExpenses.map(e => {
                const payer = members.find(m => m.id === e.payer_member_id);
                return (
                  <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{e.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {e.payment_source === 'group_fund' ? '👥 Group Fund' : `👤 ${payer?.name ?? 'Personal'}`}
                          {' · '}
                          {format(new Date(e.occurred_at), 'MMM d')}
                        </p>
                      </div>
                      <span className="font-bold text-red-600 dark:text-red-400 flex-shrink-0">
                        {formatBDT(e.amount)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          <p>Shared via Friends Trip Expense Manager</p>
          <p className="mt-0.5">Read-only view · No account required</p>
        </div>
      </main>
    </div>
  );
}
