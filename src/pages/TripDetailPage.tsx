import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Users, DollarSign, TrendingUp, TrendingDown,
  Wallet, BarChart3, AlertTriangle, CheckCircle,
  Share2, Archive, UserPlus, RefreshCw, Printer, Download,
  Trash2, ArrowUpRight, ArrowDownLeft, Scale,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  StatCard, Badge, Button, EmptyState, PageLoader, Alert,
  Card,
} from '../components/ui/index';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { AddContributionModal, ContributionCard } from '../components/transactions/AddContributionModal';
import { AddExpenseModal, ExpenseCard } from '../components/transactions/AddExpenseModal';
import {
  fetchTrip, fetchTripMembers, fetchContributions, fetchExpenses,
  fetchAllAllocations, fetchFundTransactions, voidContribution,
  voidExpense, addTripMember,
  archiveTrip, deleteTrip, createShareLink, revokeShareLink, getActiveShareLink, addRefund,
  getTripRole, getOrCreateJoinCode, promoteMemberToManager, leaveTrip,
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatBDT } from '../lib/money';
import {
  calculateTripFinancials, calculateSettlementPlan,
} from '../lib/financial-calculations';
import type {
  Trip, TripMember, Contribution, Expense, ExpenseAllocation,
  FundTransaction, TripFinancials, SettlementPlan, TripShareLink,
} from '../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

type TabId = 'overview' | 'members' | 'income' | 'expenses' | 'transactions' |
  'balances' | 'reports';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { id: 'members', label: 'Members', icon: <Users size={14} /> },
  { id: 'income', label: 'Income', icon: <TrendingUp size={14} /> },
  { id: 'expenses', label: 'Expenses', icon: <TrendingDown size={14} /> },
  { id: 'transactions', label: 'All Transactions', icon: <Wallet size={14} /> },
  { id: 'balances', label: 'Balances', icon: <DollarSign size={14} /> },
  { id: 'reports', label: 'Reports & Share', icon: <Share2 size={14} /> },
];

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [, setAllocations] = useState<ExpenseAllocation[]>([]);
  const [fundTransactions, setFundTransactions] = useState<FundTransaction[]>([]);
  const [shareLink, setShareLink] = useState<TripShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [financials, setFinancials] = useState<TripFinancials | null>(null);
  const [settlementPlan, setSettlementPlan] = useState<SettlementPlan | null>(null);
  // Manager / Member role (migration 003). Pre-migration this falls back to
  // owner-only: the trip owner is the Manager, everyone else is blocked by
  // the old RLS policies when the fetches above run.
  const [isManager, setIsManager] = useState(false);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [joinCodeNote, setJoinCodeNote] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      setError(null);
      const [t, m, c, e, a, ft, sl] = await Promise.all([
        fetchTrip(tripId),
        fetchTripMembers(tripId),
        fetchContributions(tripId),
        fetchExpenses(tripId),
        fetchAllAllocations(tripId),
        fetchFundTransactions(tripId),
        getActiveShareLink(tripId),
      ]);
      setTrip(t);
      setMembers(m);
      setContributions(c);
      setExpenses(e);
      setAllocations(a);
      setFundTransactions(ft);
      setShareLink(sl);

      // Role: owner is Manager; otherwise the linked member row decides.
      // A signed-in user who is neither owner nor a linked active member
      // cannot view this trip.
      let manager = t.owner_id === user?.id;
      let myId: string | null = null;
      let roleResolved = false;
      try {
        const role = await getTripRole(tripId);
        manager = role.isManager;
        myId = role.membership?.member_id ?? null;
        roleResolved = true;
      } catch {
        manager = t.owner_id === user?.id;
      }
      if (roleResolved && !manager && !myId) {
        setError('You are not an active member of this trip.');
        return;
      }
      setIsManager(manager);
      setMyMemberId(myId);

      // Join code: Manager only, created lazily here — never at creation.
      if (manager && t.status === 'active') {
        try {
          setJoinCode(await getOrCreateJoinCode(tripId));
          setJoinCodeNote(null);
        } catch (err) {
          setJoinCode(null);
          const message = err instanceof Error ? err.message : 'Failed to load join code';
          setJoinCodeNote(
            message.includes('trip_join_codes')
              ? 'Join codes need migration 003. Run supabase/migrations/003_manager_member_roles.sql on the project database first.'
              : message
          );
        }
      }

      // Calculate financials
      const fin = calculateTripFinancials(m, c, e, a, ft);
      setFinancials(fin);
      setSettlementPlan(calculateSettlementPlan(fin));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  }, [tripId, user?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleVoidContribution = async (id: string) => {
    try {
      await voidContribution(id);
      toast.success('Contribution voided');
      await loadAll();
    } catch { toast.error('Failed to void contribution'); }
  };

  const handleVoidExpense = async (id: string) => {
    try {
      await voidExpense(id);
      toast.success('Expense voided');
      await loadAll();
    } catch { toast.error('Failed to void expense'); }
  };

  const handleArchive = async () => {
    if (!tripId || !isManager) return;
    setArchiving(true);
    try {
      await archiveTrip(tripId);
      toast.success('Trip archived');
      navigate('/dashboard');
    } catch { toast.error('Failed to archive trip'); setArchiving(false); }
  };

  const handleDeleteTrip = async () => {
    if (!tripId || !isManager) return;
    setDeleting(true);
    try {
      await deleteTrip(tripId);
      toast.success('Trip deleted successfully');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete trip');
      setDeleting(false);
    }
  };

  const handlePromote = async (memberId: string) => {
    if (!tripId || !isManager) return;
    if (!confirm('Make this member the Manager? You will then become only a Group Member.')) return;
    try {
      await promoteMemberToManager(tripId, memberId);
      toast.success('Manager changed');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change Manager');
    }
  };

  const handleLeave = async () => {
    if (!tripId) return;
    if (!confirm('Leave this trip?')) return;
    try {
      await leaveTrip(tripId);
      toast.success('You left the trip');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave trip');
    }
  };

  if (loading) return <AppLayout><PageLoader /></AppLayout>;
  if (error || !trip) return (
    <AppLayout>
      <div className="max-w-lg mx-auto mt-12 text-center">
        <Alert variant="danger" title="Error loading trip">{error ?? 'Trip not found'}</Alert>
        <Link to="/dashboard" className="btn btn-secondary mt-4">Back to Dashboard</Link>
      </div>
    </AppLayout>
  );

  const activeMembers = members.filter(m => m.status === 'active');

  return (
    <AppLayout>
      {/* Trip Header */}
      <div className="mb-5">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-3 transition-colors">
          <ArrowLeft size={14} /> Dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{trip.name}</h1>
              <Badge variant={trip.status === 'active' ? 'success' : 'neutral'}>
                {trip.status}
              </Badge>
              <Badge variant={isManager ? 'info' : 'default'}>
                {isManager ? 'Manager' : 'Group Member'}
              </Badge>
            </div>
            {trip.location && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">📍 {trip.location}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {format(new Date(trip.start_date), 'MMM d')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {trip.status === 'active' && (
              <>
                <Button
                  variant="success"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setShowAddContribution(true)}
                >
                  Add Contribution
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setShowAddExpense(true)}
                >
                  Add Expense
                </Button>
              </>
            )}
            {isManager && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                className="bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60 dark:hover:bg-red-900/50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Trip
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Financials Overview Cards */}
      {financials && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard
            label="Group Cash Balance"
            value={formatBDT(financials.groupCashBalance)}
            valueClassName={financials.groupCashBalance >= 0 ? 'text-green-700' : 'text-red-700'}
            icon={<Wallet size={18} />}
          />
          <StatCard
            label="Total Contributions"
            value={formatBDT(financials.totalContributions)}
            valueClassName="text-green-700"
            icon={<TrendingUp size={18} />}
          />
          <StatCard
            label="Total Expenses"
            value={formatBDT(financials.totalGroupFundExpenses + financials.totalPersonalExpenses)}
            valueClassName="text-red-700"
            icon={<TrendingDown size={18} />}
          />
          <StatCard
            label="Members"
            value={String(activeMembers.length)}
            icon={<Users size={18} />}
          />
        </div>
      )}

      {/* Join Code — Manager only, never shown at trip creation */}
      {isManager && trip.status === 'active' && (joinCode || joinCodeNote) && (
        <Card className="mb-5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Join Code (Manager only)</h3>
          {joinCode ? (
            <>
              <p className="text-2xl font-bold tracking-widest text-slate-900 dark:text-white">{joinCode}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Share this code with members so they can join from Dashboard → Join with Code.
                This code was not shown when the trip was created.
              </p>
            </>
          ) : (
            <Alert variant="info">{joinCodeNote}</Alert>
          )}
        </Card>
      )}

      {/* Reconciliation Warning */}
      {financials && !financials.isReconciled && (
        <Alert variant="warning" title="Reconciliation Warning" icon={<AlertTriangle size={16} />}>
          The sum of member balances ({formatBDT(financials.sumOfMemberBalances)}) does not match
          the group cash balance ({formatBDT(financials.groupCashBalance)}).
          Difference: {formatBDT(financials.reconciliationDifference)}.
          This may indicate missing or incorrect transactions.
        </Alert>
      )}

      {/* Tabs */}
      <div className="mt-5">
        <div className="tab-nav mb-5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn flex items-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <OverviewTab
            trip={trip}
            financials={financials}
            members={members}
            contributions={contributions}
            expenses={expenses}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            trip={trip}
            members={members}
            financials={financials}
            tripId={trip.id}
            onRefresh={loadAll}
            isManager={isManager}
            myMemberId={myMemberId}
            onPromote={handlePromote}
            onLeave={handleLeave}
          />
        )}
        {activeTab === 'income' && (
          <IncomeTab
            contributions={contributions}
            members={members}
            tripId={trip.id}
            isAdmin={isManager && trip.status === 'active'}
            onVoid={handleVoidContribution}
            onAddClick={() => setShowAddContribution(true)}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpensesTab
            expenses={expenses}
            members={members}
            tripId={trip.id}
            isAdmin={isManager && trip.status === 'active'}
            onVoid={handleVoidExpense}
            onAddClick={() => setShowAddExpense(true)}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsTab
            contributions={contributions}
            expenses={expenses}
            fundTransactions={fundTransactions}
            members={members}
            isAdmin={isManager && trip.status === 'active'}
            onVoidContribution={handleVoidContribution}
            onVoidExpense={handleVoidExpense}
          />
        )}
        {activeTab === 'balances' && financials && (
          <BalancesTab
            trip={trip}
            members={members}
            contributions={contributions}
            expenses={expenses}
            financials={financials}
            settlementPlan={settlementPlan}
            tripId={trip.id}
            isAdmin={isManager && trip.status === 'active'}
            onRefund={async (memberId, amount, note) => {
              await addRefund(trip.id, memberId, amount, null, note, new Date().toISOString());
              await loadAll();
            }}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsTab
            trip={trip}
            financials={financials}
            shareLink={shareLink}
            members={members}
            contributions={contributions}
            expenses={expenses}
            onGenerateShare={async () => {
              try {
                const { token } = await createShareLink(trip.id);
                const url = `${window.location.origin}/share/${token}`;
                await navigator.clipboard.writeText(url);
                toast.success('Share link copied to clipboard!');
                await loadAll();
              } catch { toast.error('Failed to create share link'); }
            }}
            onRevokeShare={async () => {
              try {
                await revokeShareLink(trip.id);
                toast.success('Share link revoked');
                await loadAll();
              } catch { toast.error('Failed to revoke share link'); }
            }}
            onArchive={() => setShowArchiveConfirm(true)}
            onDelete={() => setShowDeleteConfirm(true)}
            isManager={isManager}
          />
        )}
      </div>

      {/* Modals */}
      <AddContributionModal
        isOpen={showAddContribution}
        onClose={() => setShowAddContribution(false)}
        tripId={trip.id}
        members={members}
        restrictedMemberId={isManager ? null : myMemberId}
        onSuccess={() => loadAll()}
      />

      <AddExpenseModal
        isOpen={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        tripId={trip.id}
        members={members}
        restrictedMemberId={isManager ? null : myMemberId}
        onSuccess={() => loadAll()}
      />

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchive}
        title="Archive Trip?"
        message="Archived trips are read-only. All data is preserved. You can still view the trip and export reports."
        confirmLabel="Archive Trip"
        cancelLabel="Keep Active"
        variant="warning"
        loading={archiving}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteTrip}
        title="Delete Trip?"
        message="Are you sure you want to delete this trip? All associated expenses, contributions, and member records will be permanently removed."
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </AppLayout>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  trip,
  financials,
  members,
  contributions,
  expenses,
}: {
  trip: Trip;
  financials: TripFinancials | null;
  members: TripMember[];
  contributions: Contribution[];
  expenses: Expense[];
}) {
  const recentContributions = contributions.filter(c => c.status === 'valid').slice(0, 5);
  const recentExpenses = expenses.filter(e => e.status === 'valid').slice(0, 5);

  return (
    <div className="space-y-5">
      {trip.description && (
        <Card>
          <p className="text-sm text-slate-600">{trip.description}</p>
        </Card>
      )}

      {financials && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Contributions</p>
            <p className="text-2xl font-bold text-green-700">{formatBDT(financials.totalContributions)}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Expenses</p>
            <p className="text-2xl font-bold text-red-700">
              {formatBDT(financials.totalGroupFundExpenses + financials.totalPersonalExpenses)}
            </p>
          </div>
          <div className={`${financials.groupCashBalance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'} border rounded-xl p-4 text-center`}>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Cash Balance</p>
            <p className={`text-2xl font-bold ${financials.groupCashBalance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
              {formatBDT(financials.groupCashBalance)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Contributions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Contributions</h3>
          {recentContributions.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No contributions yet</p>
          ) : (
            <div className="space-y-2">
              {recentContributions.map(c => (
                <div key={c.id} className="flex justify-between items-center text-sm p-2 bg-green-50 rounded-lg">
                  <span className="text-slate-700">{c.member?.name}</span>
                  <span className="font-semibold text-green-700">+{formatBDT(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Expenses */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Expenses</h3>
          {recentExpenses.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No expenses yet</p>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map(e => (
                <div key={e.id} className="flex justify-between items-center text-sm p-2 bg-red-50 rounded-lg">
                  <span className="text-slate-700 truncate">{e.title}</span>
                  <span className="font-semibold text-red-700 flex-shrink-0 ml-2">-{formatBDT(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members Summary */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Members ({members.filter(m => m.status === 'active').length})</h3>
        <div className="flex flex-wrap gap-2">
          {members.map(m => (
            <span key={m.id} className={`badge ${m.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
              {m.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({
  trip,
  members,
  financials,
  tripId,
  onRefresh,
  isManager,
  myMemberId,
  onPromote,
  onLeave,
}: {
  trip: Trip;
  members: TripMember[];
  financials: TripFinancials | null;
  tripId: string;
  onRefresh: () => void;
  isManager: boolean;
  myMemberId: string | null;
  onPromote: (memberId: string) => void;
  onLeave: () => void;
}) {
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberNotes, setNewMemberNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddMember = async () => {
    if (!newMemberName.trim()) return;
    setAdding(true);
    try {
      await addTripMember(tripId, newMemberName, newMemberNotes);
      toast.success('Member added');
      setNewMemberName('');
      setNewMemberNotes('');
      setShowAddMember(false);
      onRefresh();
    } catch { toast.error('Failed to add member'); }
    finally { setAdding(false); }
  };

  const getMemberBalance = (memberId: string) => {
    return financials?.memberBalances.find(mb => mb.member.id === memberId);
  };

  return (
    <div className="space-y-4">
      {trip.status === 'active' && (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={onLeave}
          >
            Leave Trip
          </Button>
          {isManager && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus size={14} />}
              onClick={() => setShowAddMember(true)}
            >
              Add Member
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {members.map(member => {
          const balance = getMemberBalance(member.id);
          return (
            <Card key={member.id} className={member.status === 'inactive' ? 'opacity-60' : ''}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue-700 text-sm">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{member.name}</p>
                      {member.status === 'inactive' && (
                        <Badge variant="neutral">Inactive</Badge>
                      )}
                      {(() => {
                        const rowRole = member.role ?? (member.user_id === trip.owner_id ? 'manager' : undefined);
                        return rowRole ? (
                          <Badge variant={rowRole === 'manager' ? 'info' : 'default'}>
                            {rowRole === 'manager' ? 'Manager' : 'Group Member'}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                    {member.notes && <p className="text-xs text-slate-500">{member.notes}</p>}
                  </div>
                </div>

                {balance && (
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      balance.netBalance > 0 ? 'amount-positive' :
                      balance.netBalance < 0 ? 'amount-negative' : 'amount-neutral'
                    }`}>
                      {balance.netBalance > 0 ? '+' : ''}{formatBDT(balance.netBalance)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {balance.netBalance > 0 ? 'Receivable / পাওনা' :
                       balance.netBalance < 0 ? 'Payable / দিতে হবে' : 'Settled / হিসাব সমন্বিত'}
                    </p>
                  </div>
                )}
              </div>

              {isManager && member.status === 'active' && member.user_id &&
                member.id !== myMemberId && member.role !== 'manager' &&
                member.user_id !== trip.owner_id && (
                <div className="mt-3 flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => onPromote(member.id)}>
                    Make Manager
                  </Button>
                </div>
              )}

              {balance && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Contributed</p>
                    <p className="text-sm font-semibold text-green-700">{formatBDT(balance.totalContributions)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Personally Paid</p>
                    <p className="text-sm font-semibold text-blue-700">{formatBDT(balance.totalPersonallyPaid)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Share of Expenses</p>
                    <p className="text-sm font-semibold text-red-700">{formatBDT(balance.totalAllocatedExpenses)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Refunds</p>
                    <p className="text-sm font-semibold text-slate-700">{formatBDT(balance.totalRefunds)}</p>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {members.length === 0 && (
          <EmptyState
            icon={<Users size={24} />}
            title="No members yet"
            description="Add members to start tracking contributions and expenses"
          />
        )}
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={showAddMember}
        onClose={() => { setShowAddMember(false); setNewMemberName(''); setNewMemberNotes(''); }}
        title="Add Member"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddMember(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddMember} loading={adding} disabled={!newMemberName.trim()}>
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Name *</label>
            <input
              className="form-input"
              placeholder="Member name"
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMember(); }}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
            <input
              className="form-input"
              placeholder="e.g. driver, organizer..."
              value={newMemberNotes}
              onChange={e => setNewMemberNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Income Tab ───────────────────────────────────────────────────────────────

function IncomeTab({
  contributions,
  tripId: _tripId,
  isAdmin,
  onVoid,
  onAddClick,
  members: _members,
}: {
  contributions: Contribution[];
  members: TripMember[];
  tripId: string;
  isAdmin: boolean;
  onVoid: (id: string) => void;
  onAddClick: () => void;
}) {
  const [voidConfirm, setVoidConfirm] = useState<string | null>(null);
  const valid = contributions.filter(c => c.status === 'valid');
  const total = valid.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Total Contributions</p>
          <p className="text-2xl font-bold text-green-700">{formatBDT(total)}</p>
        </div>
        {isAdmin && (
          <Button variant="success" size="sm" leftIcon={<Plus size={14} />} onClick={onAddClick}>
            Add Contribution
          </Button>
        )}
      </div>

      {contributions.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={24} />}
          title="No contributions yet"
          description="Record when members contribute money to the group fund"
          action={isAdmin ? (
            <Button variant="success" size="sm" leftIcon={<Plus size={14} />} onClick={onAddClick}>
              Add First Contribution
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {contributions.map(c => (
            <ContributionCard
              key={c.id}
              contribution={c}
              onVoid={() => setVoidConfirm(c.id)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!voidConfirm}
        onClose={() => setVoidConfirm(null)}
        onConfirm={() => { if (voidConfirm) { onVoid(voidConfirm); setVoidConfirm(null); } }}
        title="Void Contribution?"
        message="This will mark the contribution as void. It will remain in the audit trail but will not affect balances. This cannot be undone."
        confirmLabel="Void Contribution"
      />
    </div>
  );
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

function ExpensesTab({
  expenses,
  tripId: _tripId,
  isAdmin,
  onVoid,
  onAddClick,
  members: _members,
}: {
  expenses: Expense[];
  members: TripMember[];
  tripId: string;
  isAdmin: boolean;
  onVoid: (id: string) => void;
  onAddClick: () => void;
}) {
  const [voidConfirm, setVoidConfirm] = useState<string | null>(null);
  const valid = expenses.filter(e => e.status === 'valid');
  const total = valid.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Total Expenses</p>
          <p className="text-2xl font-bold text-red-700">{formatBDT(total)}</p>
        </div>
        {isAdmin && (
          <Button variant="danger" size="sm" leftIcon={<Plus size={14} />} onClick={onAddClick}>
            Add Expense
          </Button>
        )}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={<TrendingDown size={24} />}
          title="No expenses yet"
          description="Record trip expenses to track spending"
          action={isAdmin ? (
            <Button variant="danger" size="sm" leftIcon={<Plus size={14} />} onClick={onAddClick}>
              Add First Expense
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {expenses.map(e => (
            <ExpenseCard
              key={e.id}
              expense={e}
              onVoid={() => setVoidConfirm(e.id)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!voidConfirm}
        onClose={() => setVoidConfirm(null)}
        onConfirm={() => { if (voidConfirm) { onVoid(voidConfirm); setVoidConfirm(null); } }}
        title="Void Expense?"
        message="This will mark the expense and all its allocations as void. Balances will be recalculated. This cannot be undone."
        confirmLabel="Void Expense"
      />
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({
  contributions,
  expenses,
  fundTransactions,
  members: _members,
  isAdmin,
  onVoidContribution,
  onVoidExpense,
}: {
  contributions: Contribution[];
  expenses: Expense[];
  fundTransactions: FundTransaction[];
  members: TripMember[];
  isAdmin: boolean;
  onVoidContribution: (id: string) => void;
  onVoidExpense: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'contribution' | 'expense' | 'fund'>('all');

  type UnifiedTx = {
    id: string;
    date: string;
    type: 'contribution' | 'expense' | 'fund';
    description: string;
    member: string;
    amount: number;
    direction: 'in' | 'out';
    status: 'valid' | 'void';
    raw: Contribution | Expense | FundTransaction;
  };

  const allTx: UnifiedTx[] = [
    ...contributions.map(c => ({
      id: c.id,
      date: c.occurred_at,
      type: 'contribution' as const,
      description: `Contribution by ${c.member?.name ?? '—'}`,
      member: c.member?.name ?? '—',
      amount: c.amount,
      direction: 'in' as const,
      status: c.status,
      raw: c,
    })),
    ...expenses.map(e => ({
      id: e.id,
      date: e.occurred_at,
      type: 'expense' as const,
      description: e.title,
      member: e.payer_member?.name ?? 'Group Fund',
      amount: e.amount,
      direction: 'out' as const,
      status: e.status,
      raw: e,
    })),
    ...fundTransactions.map(f => ({
      id: f.id,
      date: f.occurred_at,
      type: 'fund' as const,
      description: f.note ?? `${f.transaction_type} (${f.direction})`,
      member: f.member?.name ?? '—',
      amount: f.amount,
      direction: f.direction,
      status: f.status,
      raw: f,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = allTx.filter(tx => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase()) &&
        !tx.member.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="form-input flex-1"
          placeholder="Search transactions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input sm:w-40"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
        >
          <option value="all">All types</option>
          <option value="contribution">Contributions</option>
          <option value="expense">Expenses</option>
          <option value="fund">Fund Transactions</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Wallet size={24} />} title="No transactions" description="No transactions match your filters" />
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => (
            <div key={tx.id} className={`p-3 rounded-xl border ${tx.status === 'void' ? 'opacity-50 bg-slate-50' : 'bg-white'} flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
                  tx.type === 'contribution' ? 'bg-green-100' :
                  tx.type === 'expense' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  {tx.type === 'contribution' ? '↑' : tx.type === 'expense' ? '↓' : '⟷'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                  <p className="text-xs text-slate-500">
                    {tx.member} · {format(new Date(tx.date), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-bold ${
                  tx.status === 'void' ? 'text-slate-400 line-through' :
                  tx.direction === 'in' ? 'amount-positive' : 'amount-negative'
                }`}>
                  {tx.direction === 'in' ? '+' : '-'}{formatBDT(tx.amount)}
                </span>
                {tx.status === 'void' && <Badge variant="danger">Void</Badge>}
                {tx.status === 'valid' && isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1 text-slate-400 hover:text-red-500"
                    onClick={() => {
                      if (tx.type === 'contribution') onVoidContribution(tx.id);
                      else if (tx.type === 'expense') onVoidExpense(tx.id);
                    }}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Balances Tab ─────────────────────────────────────────────────────────────

function BalancesTab({
  trip: _trip,
  members,
  contributions,
  expenses,
  financials,
  settlementPlan,
  tripId: _tripId,
  isAdmin,
  onRefund,
}: {
  trip?: Trip;
  members: TripMember[];
  contributions: Contribution[];
  expenses: Expense[];
  financials: TripFinancials;
  settlementPlan?: SettlementPlan | null;
  tripId: string;
  isAdmin: boolean;
  onRefund: (memberId: string, amount: number, note: string) => Promise<void>;
}) {
  const [refundConfirm, setRefundConfirm] = useState<{ memberId: string; amount: number } | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  // Active members
  const activeMembers = members.filter(m => m.status === 'active');
  const totalMembersCount = activeMembers.length;

  // Valid expenses
  const validExpenses = expenses.filter(e => e.status === 'valid');
  const totalTripExpenses = validExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Equal Share calculation: Per Member Share = Total Expenses / Total Members
  const perMemberShare = totalMembersCount > 0 ? Math.round(totalTripExpenses / totalMembersCount) : 0;

  // Calculate settlement for each active member:
  // Net Balance = Total Contribution - Per Member Share
  const memberSettlements = activeMembers.map(member => {
    const totalContributed = contributions
      .filter(c => c.member_id === member.id && c.status === 'valid')
      .reduce((sum, c) => sum + c.amount, 0);

    const personallyPaid = validExpenses
      .filter(e => e.payment_source === 'personal' && e.payer_member_id === member.id)
      .reduce((sum, e) => sum + e.amount, 0);

    // Total funding provided by member towards the trip
    const totalPaid = totalContributed + personallyPaid;

    // Net Balance = Total Contribution - Per Member Share
    const netBalance = totalPaid - perMemberShare;

    return {
      member,
      totalContributed,
      personallyPaid,
      totalPaid,
      perMemberShare,
      netBalance,
    };
  });

  // Calculate simplified peer-to-peer settlement actions from net balances
  const debtors = memberSettlements
    .filter(s => s.netBalance < 0)
    .map(s => ({ member: s.member, amount: Math.abs(s.netBalance) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = memberSettlements
    .filter(s => s.netBalance > 0)
    .map(s => ({ member: s.member, amount: s.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  // Derive direct settlement suggestions
  const directTransfers: { from: TripMember; to: TripMember; amount: number }[] = [];
  {
    const dQueue = debtors.map(d => ({ ...d }));
    const cQueue = creditors.map(c => ({ ...c }));
    let di = 0;
    let ci = 0;
    while (di < dQueue.length && ci < cQueue.length) {
      const debtor = dQueue[di];
      const creditor = cQueue[ci];
      const transfer = Math.min(debtor.amount, creditor.amount);
      if (transfer > 0) {
        directTransfers.push({
          from: debtor.member,
          to: creditor.member,
          amount: transfer,
        });
        debtor.amount -= transfer;
        creditor.amount -= transfer;
      }
      if (debtor.amount === 0) di++;
      if (creditor.amount === 0) ci++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Equal Share Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Total Expenses</span>
            <TrendingDown size={16} className="text-red-500" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
            {formatBDT(totalTripExpenses)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Across all trip activities</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Active Members</span>
            <Users size={16} className="text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {totalMembersCount}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Sharing trip expenses</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 rounded-xl p-4 shadow-sm bg-gradient-to-br from-white to-blue-50/40 dark:from-slate-900 dark:to-blue-950/20">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Per Member Share</span>
            <Scale size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300">
            {formatBDT(perMemberShare)}
          </p>
          <p className="text-[11px] text-blue-600/75 dark:text-blue-400/80 mt-1">
            {formatBDT(totalTripExpenses)} ÷ {totalMembersCount || 1} members
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Group Cash Balance</span>
            <Wallet size={16} className="text-emerald-500" />
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${financials.groupCashBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatBDT(financials.groupCashBalance)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">In hand / current pool</p>
        </div>
      </div>

      {/* Net Settlement Summary Table */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale size={18} className="text-blue-600 dark:text-blue-400" />
              Equal Share & Net Settlement
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Net Balance = Total Contribution − Per Member Share ({formatBDT(perMemberShare)})
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Surplus (Gets back)
            </span>
            <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Due (Owes)
            </span>
          </div>
        </div>

        {/* Desktop / Tablet Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="pb-3 pl-2">Member</th>
                <th className="pb-3 text-right">Total Contributed</th>
                <th className="pb-3 text-right">Per Member Share</th>
                <th className="pb-3 text-right">Net Balance</th>
                <th className="pb-3 text-right pr-2">Settlement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {memberSettlements.map(item => {
                const isSurplus = item.netBalance > 0;
                const isDue = item.netBalance < 0;
                const isSettled = item.netBalance === 0;

                return (
                  <tr key={item.member.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 pl-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {item.member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{item.member.name}</p>
                          {item.personallyPaid > 0 && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              Direct: {formatBDT(item.totalContributed)} + Personal: {formatBDT(item.personallyPaid)}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-medium text-slate-800 dark:text-slate-200">
                      {formatBDT(item.totalPaid)}
                    </td>
                    <td className="py-3.5 text-right text-slate-600 dark:text-slate-400">
                      {formatBDT(item.perMemberShare)}
                    </td>
                    <td className="py-3.5 text-right font-bold">
                      <span className={isSurplus ? 'text-emerald-600 dark:text-emerald-400' : isDue ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
                        {isSurplus ? `+${formatBDT(item.netBalance)}` : isDue ? `-${formatBDT(Math.abs(item.netBalance))}` : formatBDT(0)}
                      </span>
                    </td>
                    <td className="py-3.5 text-right pr-2">
                      {isSurplus && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80">
                          <ArrowDownLeft size={13} className="text-emerald-600 dark:text-emerald-400" />
                          Gets back {formatBDT(item.netBalance)}
                        </span>
                      )}
                      {isDue && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border border-red-300 dark:border-red-800/80">
                          <ArrowUpRight size={13} className="text-red-600 dark:text-red-400" />
                          Owes {formatBDT(Math.abs(item.netBalance))}
                        </span>
                      )}
                      {isSettled && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <CheckCircle size={13} className="text-slate-500 dark:text-slate-400" />
                          Settled (৳0)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden space-y-3">
          {memberSettlements.map(item => {
            const isSurplus = item.netBalance > 0;
            const isDue = item.netBalance < 0;
            const isSettled = item.netBalance === 0;

            return (
              <div
                key={item.member.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center">
                      {item.member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {item.member.name}
                    </span>
                  </div>

                  {isSurplus && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      <ArrowDownLeft size={12} /> Gets back {formatBDT(item.netBalance)}
                    </span>
                  )}
                  {isDue && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border border-red-300 dark:border-red-800">
                      <ArrowUpRight size={12} /> Owes {formatBDT(Math.abs(item.netBalance))}
                    </span>
                  )}
                  {isSettled && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <CheckCircle size={12} /> Settled
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-200/70 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Contributed</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBDT(item.totalPaid)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Equal Share</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-400">{formatBDT(item.perMemberShare)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 dark:text-slate-500 block">Net Balance</span>
                    <span className={`font-bold ${isSurplus ? 'text-emerald-600 dark:text-emerald-400' : isDue ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {isSurplus ? `+${formatBDT(item.netBalance)}` : isDue ? `-${formatBDT(Math.abs(item.netBalance))}` : formatBDT(0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Settlement Breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
          <Wallet size={16} className="text-blue-600 dark:text-blue-400" />
          Settlement Breakdown (Who Needs to Pay / Receive)
        </h3>

        {directTransfers.length === 0 && (!settlementPlan || settlementPlan.actions.length === 0) ? (
          <Card>
            <div className="text-center py-6">
              <CheckCircle size={36} className="text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-slate-800 dark:text-white">All balances are settled!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Everyone has contributed their equal share of trip expenses. No further settlements required.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Direct peer-to-peer transfers from equal share calculation */}
            {directTransfers.map((dt, idx) => (
              <div
                key={`transfer-${idx}`}
                className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      <span className="font-bold text-red-600 dark:text-red-400">{dt.from.name}</span>
                      {' '}pays{' '}
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{dt.to.name}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Settles member share towards {dt.to.name}'s surplus
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {formatBDT(dt.amount)}
                  </span>
                </div>
              </div>
            ))}

            {/* Also show Group Fund refund actions if available */}
            {settlementPlan && settlementPlan.actions.filter(a => a.type === 'group_fund_refund').map((action, i) => (
              <div
                key={`refund-${i}`}
                className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                    <ArrowDownLeft size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      <span className="text-slate-600 dark:text-slate-400">Group Fund refunds </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{action.to.name}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Surplus refund paid back from the shared group cash balance
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatBDT(action.amount)}
                  </span>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="success"
                      className="text-xs"
                      onClick={() => setRefundConfirm({ memberId: action.to.id, amount: action.amount })}
                    >
                      Record Refund
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger Reconciliation Check */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-blue-600 dark:text-blue-400" />
          Ledger & Cash Reconciliation
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Group Cash Pool</span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatBDT(financials.groupCashBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Total Valid Expenses</span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatBDT(totalTripExpenses)}</span>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between">
            <span className="font-medium text-slate-700 dark:text-slate-300">Reconciliation Status</span>
            <span className={`font-bold ${financials.isReconciled ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {financials.isReconciled ? 'Balanced (৳0 diff)' : `Difference: ${formatBDT(financials.reconciliationDifference)}`}
            </span>
          </div>
          {financials.isReconciled ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs mt-2">
              <CheckCircle size={14} /> Full mathematical ledger integrity verified
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs mt-2">
              <AlertTriangle size={14} /> Discrepancy detected — please review transactions
            </div>
          )}
        </div>
      </Card>

      {/* Refund Confirm */}
      <ConfirmDialog
        isOpen={!!refundConfirm}
        onClose={() => setRefundConfirm(null)}
        onConfirm={async () => {
          if (!refundConfirm) return;
          setRefundLoading(true);
          try {
            await onRefund(refundConfirm.memberId, refundConfirm.amount, 'Settlement refund from group fund');
            toast.success('Refund recorded successfully');
            setRefundConfirm(null);
          } catch { toast.error('Failed to record refund'); }
          finally { setRefundLoading(false); }
        }}
        title="Record Refund?"
        message={`This will record a ৳${refundConfirm?.amount.toLocaleString('en-BD')} refund from the group fund. This will decrease the group fund balance.`}
        confirmLabel="Record Refund"
        variant="warning"
        loading={refundLoading}
      />
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────

function ReportsTab({
  trip,
  financials,
  shareLink,
  members,
  contributions,
  expenses,
  onGenerateShare,
  onRevokeShare,
  onArchive,
  onDelete,
  isManager,
}: {
  trip: Trip;
  financials: TripFinancials | null;
  shareLink: TripShareLink | null;
  members: TripMember[];
  contributions: Contribution[];
  expenses: Expense[];
  onGenerateShare: () => Promise<void>;
  onRevokeShare: () => Promise<void>;
  onArchive: () => void;
  onDelete: () => void;
  isManager: boolean;
}) {
  const [generatingShare, setGeneratingShare] = useState(false);
  const [revokingShare, setRevokingShare] = useState(false);

  const handlePrint = () => window.print();

  const handleCSVExport = () => {
    const rows = [
      ['Type', 'Date', 'Description', 'Member', 'Amount', 'Status'],
      ...contributions.map(c => [
        'Contribution',
        new Date(c.occurred_at).toLocaleDateString(),
        `${c.member?.name} - ${c.payment_method}`,
        c.member?.name ?? '',
        String(c.amount),
        c.status,
      ]),
      ...expenses.map(e => [
        'Expense',
        new Date(e.occurred_at).toLocaleDateString(),
        e.title,
        e.payer_member?.name ?? 'Group Fund',
        String(e.amount),
        e.status,
      ]),
      ['', '', '', '', '', ''],
      ['Member Summary', 'Status', 'Total Paid', 'Total Share', 'Net Balance', 'Settlement Status'],
      ...members.map(m => {
        const bal = financials?.memberBalances.find(b => b.member.id === m.id);
        const totalPaid = (bal?.totalContributions ?? 0) + (bal?.totalPersonallyPaid ?? 0);
        const totalShare = bal?.totalAllocatedExpenses ?? 0;
        const net = bal?.netBalance ?? 0;
        return [
          m.name,
          m.status,
          String(totalPaid),
          String(totalShare),
          String(net),
          net > 0 ? 'Gets Refund' : net < 0 ? 'Owes Money' : 'Settled',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/\s+/g, '_')}_transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Financial Summary */}
      {financials && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3">Financial Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Total Contributions</span>
              <span className="font-semibold text-green-700">{formatBDT(financials.totalContributions)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Group Fund Expenses</span>
              <span className="font-semibold text-red-700">{formatBDT(financials.totalGroupFundExpenses)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Personal Expenses</span>
              <span className="font-semibold text-orange-700">{formatBDT(financials.totalPersonalExpenses)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Refunds</span>
              <span className="font-semibold">{formatBDT(financials.totalRefunds)}</span>
            </div>
            <div className="flex justify-between py-1 font-semibold">
              <span className="text-slate-800">Group Cash Balance</span>
              <span className={financials.groupCashBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
                {formatBDT(financials.groupCashBalance)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Member Balances Summary */}
      {financials && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3">Member Balance Summary</h3>
          <div className="space-y-2">
            {financials.memberBalances.map(mb => (
              <div key={mb.member.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">{mb.member.name}</span>
                <span className={`font-semibold ${mb.netBalance > 0 ? 'text-green-700' : mb.netBalance < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                  {mb.netBalance > 0 ? '+' : ''}{formatBDT(mb.netBalance)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Export Actions */}
      <Card>
        <h3 className="font-semibold text-slate-800 mb-3">Export</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Printer size={14} />} onClick={handlePrint}>
            Print Report
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<Download size={14} />} onClick={handleCSVExport}>
            Export CSV
          </Button>
        </div>
      </Card>

      {/* Share Link — Manager only */}
      {isManager && (
      <Card>
        <h3 className="font-semibold text-slate-800 mb-3">Read-Only Share Link</h3>
        <p className="text-xs text-slate-500 mb-3">
          Share a read-only view of this trip with others. The link uses a secure token and shows only public trip data.
          No account is required to view.
        </p>

        {shareLink ? (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Share link is active</p>
              <p className="text-xs text-slate-400">
                Created: {format(new Date(shareLink.created_at), 'MMM d, yyyy HH:mm')}
              </p>
              {shareLink.expires_at && (
                <p className="text-xs text-amber-600">
                  Expires: {format(new Date(shareLink.expires_at), 'MMM d, yyyy')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<RefreshCw size={14} />}
                loading={generatingShare}
                onClick={async () => { setGeneratingShare(true); try { await onGenerateShare(); } finally { setGeneratingShare(false); } }}
              >
                Regenerate Link
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={revokingShare}
                onClick={async () => { setRevokingShare(true); try { await onRevokeShare(); } finally { setRevokingShare(false); } }}
              >
                Revoke Link
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Share2 size={14} />}
            loading={generatingShare}
            onClick={async () => { setGeneratingShare(true); try { await onGenerateShare(); } finally { setGeneratingShare(false); } }}
          >
            Generate Share Link
          </Button>
        )}
      </Card>
      )}

      {/* Archive — Manager only */}
      {isManager && trip.status === 'active' && (
        <Card>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Archive Trip</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Archive this trip to mark it as complete. Archived trips are read-only but all data is preserved.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Archive size={14} />}
            onClick={onArchive}
          >
            Archive Trip
          </Button>
        </Card>
      )}

      {/* Danger Zone: Delete Trip — Manager only */}
      {isManager && (
      <Card className="border-red-200 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/20">
        <h3 className="font-semibold text-red-800 dark:text-red-400 mb-1 flex items-center gap-2">
          <Trash2 size={16} /> Danger Zone
        </h3>
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">
          Delete this trip permanently. All associated expenses, contributions, allocations, and member records will be permanently removed.
        </p>
        <Button
          variant="danger"
          size="sm"
          leftIcon={<Trash2 size={14} />}
          onClick={onDelete}
        >
          Delete Trip Permanently
        </Button>
      </Card>
      )}
    </div>
  );
}
