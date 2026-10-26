import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Layout } from '../components/Layout';
import { Button, Card, Alert } from '../components/ui';
import { supabase } from '../lib/supabase';

export function RolePage() {
  const { user, loading } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  async function choose(role: 'manager' | 'member') {
    setError(null);
    setSaving(true);
    try {
      // profiles row is created by the handle_new_user trigger in 01_setup.sql.
      // If it does not exist yet (older account), upsert it.
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, email: user.email, preferred_role: role }, { onConflict: 'id' });
      if (upsertError) throw upsertError;
      navigate(role === 'manager' ? '/trips/new' : '/trips/join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Problem saving role.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-6">{tr('roleTitle')}</h1>
      {error && <div className="mb-4"><Alert variant="danger">Problem saving role: {error}</Alert></div>}
      <div className="grid gap-4">
        <Card>
          <h2 className="text-xl font-semibold mb-2">{tr('manager')}</h2>
          <p className="text-slate-600 mb-4">{tr('managerDesc')}</p>
          <Button loading={saving} onClick={() => choose('manager')}>{tr('iAmManager')}</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold mb-2">{tr('member')}</h2>
          <p className="text-slate-600 mb-4">{tr('memberDesc')}</p>
          <Button variant="secondary" loading={saving} onClick={() => choose('member')}>{tr('iAmMember')}</Button>
        </Card>
      </div>
      <p className="text-sm text-slate-500 mt-4">
        Note: this is your starting role. Later you can separately create your own trip as a Manager, and roles are per trip.
      </p>
    </Layout>
  );
}
