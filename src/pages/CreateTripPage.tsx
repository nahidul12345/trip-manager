import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Layout } from '../components/Layout';
import { Button, Card, Input, Alert } from '../components/ui';
import { supabase } from '../lib/supabase';
import { makeJoinCode } from '../lib/calculations';

export function CreateTripPage() {
  const { user, loading } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({ owner_id: user.id, name, location: location || null, start_date: startDate || null, end_date: endDate || null, currency })
        .select('id')
        .single();
      if (tripError) throw tripError;
      const { error: memberError } = await supabase.from('trip_members').insert({ trip_id: trip.id, user_id: user.id, role: 'manager', status: 'active' });
      if (memberError) throw memberError;
      // Join code is NOT shown at creation time. It is created now and shown
      // only on the trip page, to the Manager.
      const { error: codeError } = await supabase.from('trip_join_codes').insert({ trip_id: trip.id, code: makeJoinCode(), created_by: user.id, is_active: true });
      if (codeError) throw codeError;
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create trip.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-2">Create Trip</h1>
      <p className="text-slate-600 mb-4">The Join Code is not shown at creation time. After creating the trip, the Manager will see it on the trip page.</p>
      {error && <div className="mb-4"><Alert variant="danger">{error}</Alert></div>}
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Trip Name *" id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Location" id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Input label="Start Date" id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End Date" id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label htmlFor="currency" className="text-sm font-medium text-slate-700">Currency</label>
            <select id="currency" className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="BDT">BDT</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <Button type="submit" loading={saving} size="lg" className="w-full">Create Trip</Button>
        </form>
      </Card>
      <Link to="/dashboard"><Button variant="secondary">{tr('backDashboard')}</Button></Link>
    </Layout>
  );
}
