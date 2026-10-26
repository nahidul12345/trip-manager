import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Layout } from '../components/Layout';
import { Button, Card, Input, Alert } from '../components/ui';
import { supabase } from '../lib/supabase';

export function JoinTripPage() {
  const { user, loading } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const clean = code.trim().toUpperCase();
      const { data: codeRow, error: codeError } = await supabase
        .from('trip_join_codes')
        .select('trip_id')
        .eq('code', clean)
        .eq('is_active', true)
        .maybeSingle();
      if (codeError) throw codeError;
      if (!codeRow) throw new Error('Invalid Join Code. Please check the code from the Manager.');
      const { error: joinError } = await supabase.from('trip_members').upsert(
        { trip_id: codeRow.trip_id, user_id: user.id, role: 'member', status: 'active' },
        { onConflict: 'trip_id,user_id' },
      );
      if (joinError) throw joinError;
      navigate(`/trips/${codeRow.trip_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join trip.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-2">Join Trip</h1>
      <p className="text-slate-600 mb-4">Enter the Join Code given by the Manager. If the code is correct, you will join that trip as a Group Member.</p>
      {error && <div className="mb-4"><Alert variant="danger">{error}</Alert></div>}
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Join Code" id="code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3" />
          <Button type="submit" loading={saving} size="lg" className="w-full">Join</Button>
        </form>
      </Card>
      <Link to="/dashboard"><Button variant="secondary">{tr('backDashboard')}</Button></Link>
    </Layout>
  );
}
