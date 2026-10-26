import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Layout } from '../components/Layout';
import { Button, Card, Input, Alert } from '../components/ui';
import { supabase } from '../lib/supabase';
import { buildAllocations, computeBalances, greedySettlement, makeToken, type Allocation, type Contribution, type Expense, type Member } from '../lib/calculations';
import { formatMoney } from '../lib/money';

type Trip = { id: string; name: string; location: string | null; start_date: string | null; end_date: string | null; currency: string; status: string };
type MemberRow = Member & { email: string | null };
type ContribRow = Contribution & { note: string | null; payment_method: string };
type ExpenseRow = Expense & { title: string; category: string };

const METHODS = ['cash', 'bkash', 'nagad', 'bank', 'other'];
const CATEGORIES = ['transport', 'food', 'accommodation', 'tickets', 'shopping', 'other'];

export function TripDetailPage() {
  const { tripId } = useParams();
  const { user, loading } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [myMember, setMyMember] = useState<MemberRow | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [contributions, setContributions] = useState<ContribRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const [cAmount, setCAmount] = useState('');
  const [cMethod, setCMethod] = useState('cash');
  const [cNote, setCNote] = useState('');
  const [cRef, setCRef] = useState('');
  const [eTitle, setETitle] = useState('');
  const [eCategory, setECategory] = useState('food');
  const [eAmount, setEAmount] = useState('');
  const [eSource, setESource] = useState<'group_fund' | 'personal'>('group_fund');
  const [eSplit, setESplit] = useState<'equal' | 'custom_amount' | 'custom_percentage'>('equal');
  const [eCustom, setECustom] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user || !tripId) return;
    setBusy(true);
    const [{ data: tripData }, { data: memberData }, { data: contribData }, { data: expenseData }, { data: allocData }, { data: codeData }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase.from('trip_members').select('id, user_id, role, status').eq('trip_id', tripId).eq('status', 'active'),
      supabase.from('contributions').select('*').eq('trip_id', tripId).eq('status', 'valid').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('trip_id', tripId).eq('status', 'valid').order('created_at', { ascending: false }),
      supabase.from('expense_allocations').select('expense_id, member_id, amount'),
      supabase.from('trip_join_codes').select('code').eq('trip_id', tripId).eq('is_active', true).maybeSingle(),
    ]);
    if (!tripData) { setError('Trip not found or you are not a member of this trip.'); setBusy(false); return; }
    setTrip(tripData as Trip);
    const rawMembers = (memberData ?? []) as { id: string; user_id: string; role: string; status: string }[];
    // Profiles may be RLS-restricted to own row; email is best-effort.
    const { data: profiles } = await supabase.from('profiles').select('id, email');
    const profileMap = new Map((profiles ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email]));
    const mapped: MemberRow[] = rawMembers.map((m) => ({ id: m.id, user_id: m.user_id, role: m.role as 'manager' | 'member', email: profileMap.get(m.user_id) ?? null }));
    setMembers(mapped);
    setMyMember(mapped.find((m) => m.user_id === user.id) ?? null);
    setContributions((contribData ?? []) as ContribRow[]);
    setExpenses((expenseData ?? []) as ExpenseRow[]);
    // Only allocations belonging to this trip's expenses.
    const expenseIds = new Set(((expenseData ?? []) as ExpenseRow[]).map((e) => e.id));
    setAllocations(((allocData ?? []) as Allocation[]).filter((a) => expenseIds.has(a.expense_id)));
    setJoinCode(codeData?.code ?? null);
    setBusy(false);
  }, [user, tripId]);

  useEffect(() => { load(); }, [load]);

  const isManager = myMember?.role === 'manager';
  const { balances, totalContributed, totalGroupFundExpenses, fundBalance } = useMemo(
    () => computeBalances(members, contributions, expenses, allocations),
    [members, contributions, expenses, allocations],
  );
  const settlement = useMemo(() => greedySettlement(balances), [balances]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (busy) return <Layout><p className="text-slate-500">{tr('loading')}</p></Layout>;
  if (error || !trip) return <Layout><Alert variant="danger">{error ?? 'Trip not found.'}</Alert><div className="mt-4"><Link to="/dashboard"><Button variant="secondary">{tr('backDashboard')}</Button></Link></div></Layout>;
  if (!myMember) return <Layout><Alert variant="danger">You are not an active member of this trip.</Alert></Layout>;

  async function addContribution(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const amount = Number(cAmount);
      if (!amount || amount <= 0) throw new Error('Amount must be greater than 0.');
      const { error: err } = await supabase.from('contributions').insert({ trip_id: trip.id, member_id: myMember!.id, amount, payment_method: cMethod, note: cNote || null, reference: cRef || null, created_by: user.id });
      if (err) throw err;
      setCAmount(''); setCNote(''); setCRef('');
      await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not add contribution.'); }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const amount = Number(eAmount);
      if (!amount || amount <= 0) throw new Error('Amount must be greater than 0.');
      const allocs = buildAllocations(eSplit, amount, members, eCustom);
      const payer = eSource === 'personal' ? myMember!.id : null;
      const { data: exp, error: expErr } = await supabase.from('expenses').insert({ trip_id: trip.id, title: eTitle, category: eCategory, amount, payment_source: eSource, payer_member_id: payer, created_by: user.id }).select('id').single();
      if (expErr) throw expErr;
      const { error: allocErr } = await supabase.from('expense_allocations').insert(allocs.map((a) => ({ expense_id: exp.id, member_id: a.member_id, amount: a.amount })));
      if (allocErr) throw allocErr;
      setETitle(''); setEAmount(''); setECustom({});
      await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not add expense.'); }
  }

  async function removeMember(memberId: string) {
    if (!isManager) return;
    if (!confirm('Remove this member from the trip?')) return;
    await supabase.from('trip_members').update({ status: 'inactive' }).eq('id', memberId);
    await load();
  }
  async function promote(memberId: string) {
    if (!isManager) return;
    if (!confirm('Make this member a Manager? You will then become a Member.')) return;
    await supabase.from('trip_members').update({ role: 'member' }).eq('id', myMember!.id);
    await supabase.from('trip_members').update({ role: 'manager' }).eq('id', memberId);
    await load();
  }
  async function leave() {
    if (members.filter((m) => m.role === 'manager').length === 1 && isManager) {
      alert('You are the only Manager. Promote someone to Manager first, then you can leave.');
      return;
    }
    if (!confirm('Leave this group?')) return;
    await supabase.from('trip_members').update({ status: 'inactive' }).eq('id', myMember!.id);
    navigate('/dashboard');
  }
  async function archive() {
    if (!isManager) return;
    if (!confirm('Archive this trip?')) return;
    await supabase.from('trips').update({ status: 'archived' }).eq('id', trip.id);
    await load();
  }
  async function createShare() {
    if (!isManager) return;
    const token = makeToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: err } = await supabase.from('trip_share_links').insert({ trip_id: trip.id, token, expires_at: expires, created_by: user.id });
    if (err) { setFormError(err.message); return; }
    setShareLink(`${window.location.origin}/share/${token}`);
  }
  function downloadCsv() {
    const rows: string[][] = [
      ['Trip', trip.name],
      [],
      ['Member', 'Contributed', 'Personal paid', 'Share', 'Balance'],
      ...balances.map((b) => [b.member.email ?? b.member.user_id, String(b.contributed), String(b.personalPaid), String(b.share), String(b.balance)]),
      [],
      ['Settlement', 'From', 'To', 'Amount'],
      ...settlement.map((s) => ['', s.from.email ?? s.from.user_id, s.to.email ?? s.to.user_id, String(s.amount)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.name.replace(/[^a-z0-9]+/gi, '-')}-report.csv`;
    a.click();
  }

  return (
    <Layout>
      <div className="flex justify-between gap-3 flex-wrap items-start">
        <div>
          <h1 className="text-2xl font-bold">{trip.name}</h1>
          <p className="text-slate-500">{trip.location ?? ''} · {trip.currency} · {trip.status} · You are: {myMember.role}</p>
        </div>
        <Link to="/dashboard"><Button variant="secondary">{tr('backDashboard')}</Button></Link>
      </div>
      {formError && <div className="my-4"><Alert variant="danger">{formError}</Alert></div>}

      {isManager && joinCode && (
        <Card>
          <h2 className="text-lg font-semibold">Join Code (Manager only)</h2>
          <p className="font-mono text-2xl font-extrabold tracking-widest text-center bg-slate-50 border border-dashed border-slate-300 rounded-lg py-3">{joinCode}</p>
          <p className="text-sm text-slate-500 mt-2">Share this code with members. It was not shown at trip creation.</p>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-3">{tr('members')}</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex justify-between gap-3 flex-wrap border-b border-slate-100 pb-2">
              <span>{m.email ?? m.user_id} <span className="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 ml-1">{m.role}</span></span>
              {isManager && m.id !== myMember.id && (
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => promote(m.id)}>Make Manager</Button>
                  <Button size="sm" variant="danger" onClick={() => removeMember(m.id)}>Remove</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">Add Contribution</h2>
        <form onSubmit={addContribution} className="space-y-3">
          <Input label="Amount" type="number" required value={cAmount} onChange={(e) => setCAmount(e.target.value)} />
          <div className="flex flex-col gap-1"><label className="text-sm font-medium text-slate-700">Payment method</label>
            <select className="form-input" value={cMethod} onChange={(e) => setCMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <Input label="Note" value={cNote} onChange={(e) => setCNote(e.target.value)} />
          <Input label="Reference" value={cRef} onChange={(e) => setCRef(e.target.value)} />
          <Button type="submit">Add Contribution</Button>
        </form>
        <ul className="mt-4 space-y-1 text-sm">
          {contributions.map((c) => <li key={c.id} className="flex justify-between"><span>{c.payment_method}{c.note ? ` — ${c.note}` : ''}</span><strong>{formatMoney(c.amount, trip.currency)}</strong></li>)}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">Add Expense</h2>
        <form onSubmit={addExpense} className="space-y-3">
          <Input label="Title *" required value={eTitle} onChange={(e) => setETitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1"><label className="text-sm font-medium text-slate-700">Category</label>
              <select className="form-input" value={eCategory} onChange={(e) => setECategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="flex flex-col gap-1"><label className="text-sm font-medium text-slate-700">Payment source</label>
              <select className="form-input" value={eSource} onChange={(e) => setESource(e.target.value as 'group_fund' | 'personal')}>
                <option value="group_fund">Group fund</option><option value="personal">Personal (you paid)</option>
              </select></div>
          </div>
          <Input label="Amount" type="number" required value={eAmount} onChange={(e) => setEAmount(e.target.value)} />
          <div className="flex flex-col gap-1"><label className="text-sm font-medium text-slate-700">Split</label>
            <select className="form-input" value={eSplit} onChange={(e) => setESplit(e.target.value as typeof eSplit)}>
              <option value="equal">Equal</option><option value="custom_amount">Custom amount</option><option value="custom_percentage">Custom percentage</option>
            </select></div>
          {eSplit !== 'equal' && members.map((m) => (
            <Input key={m.id} label={`${m.email ?? m.user_id} (${eSplit === 'custom_amount' ? 'amount' : '%'})`} type="number" value={eCustom[m.id] ?? ''} onChange={(e) => setECustom({ ...eCustom, [m.id]: Number(e.target.value) })} />
          ))}
          <Button type="submit">Add Expense</Button>
        </form>
        <ul className="mt-4 space-y-1 text-sm">
          {expenses.map((e) => <li key={e.id} className="flex justify-between"><span>{e.title} ({e.category}, {e.payment_source})</span><strong>{formatMoney(e.amount, trip.currency)}</strong></li>)}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">{tr('balance')}</h2>
        <p className="text-sm text-slate-600">Total contributed: {formatMoney(totalContributed, trip.currency)} · Group-fund expenses: {formatMoney(totalGroupFundExpenses, trip.currency)} · Fund balance: {formatMoney(fundBalance, trip.currency)}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {balances.map((b) => <li key={b.member.id} className="flex justify-between"><span>{b.member.email ?? b.member.user_id}</span><span>contrib {b.contributed} · paid {b.personalPaid} · share {b.share} · <strong>balance {b.balance}</strong></span></li>)}
        </ul>
        <h3 className="font-semibold mt-4 mb-2">{tr('settlement')}</h3>
        {settlement.length === 0 ? <p className="text-slate-500 text-sm">All settled.</p> : (
          <ul className="space-y-1 text-sm">{settlement.map((s, i) => <li key={i}>{s.from.email ?? s.from.user_id} → {s.to.email ?? s.to.user_id}: <strong>{formatMoney(s.amount, trip.currency)}</strong></li>)}</ul>
        )}
        {fundBalance > 0 && <p className="text-sm text-slate-600 mt-2">Group-fund refund available: {formatMoney(fundBalance, trip.currency)} remains in the fund after group-fund expenses.</p>}
        <div className="mt-4"><Button variant="secondary" onClick={downloadCsv}>Download CSV Report</Button></div>
      </Card>

      {isManager && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">{tr('share')}</h2>
          <Button onClick={createShare}>Create Share Link (30 days)</Button>
          {shareLink && <p className="mt-3 break-all text-sm"><a href={shareLink}>{shareLink}</a></p>}
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-3">Actions</h2>
        <div className="flex gap-3 flex-wrap">
          <Button variant="secondary" onClick={leave}>{tr('leave')}</Button>
          {isManager && <Button variant="danger" onClick={archive}>{tr('archive')}</Button>}
        </div>
        <p className="text-sm text-slate-500 mt-3">Members cannot delete/archive a trip, remove other members, or view other trips. If you are the only Manager, promote someone first before leaving.</p>
      </Card>
    </Layout>
  );
}
