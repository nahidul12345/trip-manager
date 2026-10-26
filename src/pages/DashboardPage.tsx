import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Layout } from '../components/Layout';
import { Button, Card, Alert } from '../components/ui';
import { supabase } from '../lib/supabase';

type TripRow = { trip_id: string; role: string; trips: { id: string; name: string; location: string | null; status: string } | null };

export function DashboardPage() {
  const { user, loading } = useAuth();
  const { tr } = useLang();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('trip_members')
      .select('trip_id, role, trips(id, name, location, status)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setTrips((data ?? []) as unknown as TripRow[]);
        setBusy(false);
      });
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-4">{tr('dashboard')}</h1>
      {error && <div className="mb-4"><Alert variant="danger">{error}</Alert></div>}
      <div className="flex gap-3 flex-wrap mb-6 no-print">
        <Link to="/trips/new"><Button>{tr('createTrip')}</Button></Link>
        <Link to="/trips/join"><Button variant="secondary">{tr('joinTrip')}</Button></Link>
        <Link to="/role"><Button variant="secondary">Change Role</Button></Link>
      </div>
      <h2 className="text-lg font-semibold mb-3">{tr('myTrips')}</h2>
      {busy && <p className="text-slate-500">{tr('loading')}</p>}
      {!busy && trips.length === 0 && <Card><p className="text-slate-600">No trips yet. Create one as a Manager, or join one with a Join Code.</p></Card>}
      <div className="grid gap-4">
        {trips.filter((t) => t.trips).map((t) => (
          <Link key={t.trip_id} to={`/trips/${t.trip_id}`} className="no-underline text-slate-900">
            <Card>
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{t.trips!.name}</h3>
                  {t.trips!.location && <p className="text-slate-500 text-sm">{t.trips!.location}</p>}
                </div>
                <span className="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-1 h-fit">{t.role} · {t.trips!.status}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
