import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card, Alert } from '../components/ui';
import { formatMoney } from '../lib/money';

type Shared = {
  trip: { id: string; name: string; location: string | null; currency: string; status: string } | null;
  members: { id: string; user_id: string; role: string; email: string | null }[];
  contributions: { id: string; member_id: string; amount: number }[];
  expenses: { id: string; title: string; category: string; amount: number }[];
  allocations: { expense_id: string; member_id: string; amount: number }[];
  error?: string;
};

export function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    supabase.rpc('get_shared_trip', { p_token: token }).then(({ data: d, error: e }) => {
      if (e) setError(e.message);
      else if ((d as Shared)?.error) setError('This share link is invalid or expired.');
      else setData(d as Shared);
    });
  }, [token]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Shared Trip (read-only)</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {!error && !data && <p className="text-slate-500">Loading...</p>}
      {data?.trip && (
        <>
          <Card>
            <h2 className="text-xl font-semibold">{data.trip.name}</h2>
            <p className="text-slate-500">{data.trip.location ?? ''} · {data.trip.currency} · {data.trip.status}</p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-2">Members</h3>
            <ul className="text-sm space-y-1">{data.members.map((m) => <li key={m.id}>{m.email ?? m.user_id} — {m.role}</li>)}</ul>
          </Card>
          <Card>
            <h3 className="font-semibold mb-2">Contributions</h3>
            <ul className="text-sm space-y-1">{data.contributions.map((c) => <li key={c.id} className="flex justify-between"><span>{c.member_id}</span><strong>{formatMoney(c.amount, data.trip!.currency)}</strong></li>)}</ul>
          </Card>
          <Card>
            <h3 className="font-semibold mb-2">Expenses</h3>
            <ul className="text-sm space-y-1">{data.expenses.map((e) => <li key={e.id} className="flex justify-between"><span>{e.title} ({e.category})</span><strong>{formatMoney(e.amount, data.trip!.currency)}</strong></li>)}</ul>
          </Card>
        </>
      )}
      <p className="mt-4"><Link to="/login" className="text-blue-600">Go to Login</Link></p>
    </div>
  );
}
