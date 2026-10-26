import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Input, Button, Alert } from '../components/ui/index';
import { joinTripByCode } from '../lib/api';
import toast from 'react-hot-toast';

export function JoinTripPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJoining(true);
    try {
      const tripId = await joinTripByCode(code);
      toast.success('Joined trip as a Group Member!');
      navigate(`/trips/${tripId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join trip';
      setError(
        message.includes('trip_join_codes') || message.includes('join_trip_by_code')
          ? 'Join codes are not set up yet. Ask the trip owner to run migration 003 on the project database first.'
          : message
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Join a Trip</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Enter the join code shared by the trip Manager. You will join as a Group Member.
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-6" noValidate>
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-600 dark:text-blue-400" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Join Code</h2>
            </div>

            <Input
              label="Join code"
              placeholder="e.g. K7Q2XA"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              required
            />

            <p className="text-xs text-slate-500 dark:text-slate-400">
              As a Member you will see only the trips you have joined. You can add your own
              contributions and expenses, but you cannot delete or archive a trip, or remove
              other members. You can leave a trip at any time from its Members tab.
            </p>
          </div>

          <div className="flex gap-3 justify-end pb-8">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(-1)}
              disabled={joining}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={joining} disabled={!code.trim()}>
              Join Trip
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
