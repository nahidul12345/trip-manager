import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, MapPin, Wallet,
  Users, Clock, ArrowRight, Archive, AlertCircle,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { StatCard, Card, Badge, Button, CardSkeleton, EmptyState } from '../components/ui/index';
import { fetchTrips } from '../lib/api';
import type { Trip } from '../types';
import { format } from 'date-fns';

function TripStatusBadge({ status }: { status: Trip['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'neutral'}>
      {status === 'active' ? 'Active' : 'Archived'}
    </Badge>
  );
}

export function DashboardPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await fetchTrips();
      setTrips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const activeTrips = trips.filter(t => t.status === 'active');
  const archivedTrips = trips.filter(t => t.status === 'archived');

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your group trip expenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/trips/join">
            <Button variant="secondary" size="lg">
              Join with Code
            </Button>
          </Link>
          <Link to="/trips/new">
            <Button variant="primary" leftIcon={<Plus size={16} />} size="lg">
              New Trip
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Active Trips"
          value={loading ? '—' : String(activeTrips.length)}
          icon={<MapPin size={18} />}
        />
        <StatCard
          label="Total Trips"
          value={loading ? '—' : String(trips.length)}
          icon={<Wallet size={18} />}
        />
        <StatCard
          label="Members Tracked"
          value="—"
          icon={<Users size={18} />}
        />
        <StatCard
          label="Last Updated"
          value={trips.length > 0 ? format(new Date(trips[0].updated_at), 'MMM d') : '—'}
          icon={<Clock size={18} />}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Active Trips */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Active Trips</h2>
          <Link to="/trips" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : activeTrips.length === 0 ? (
          <EmptyState
            icon={<MapPin size={24} />}
            title="No active trips"
            description="Create your first trip to start tracking expenses"
            action={
              <Link to="/trips/new">
                <Button variant="primary" leftIcon={<Plus size={15} />}>
                  Create Trip
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeTrips.map(trip => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>

      {/* Archived Trips */}
      {archivedTrips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Archive size={16} className="text-slate-400 dark:text-slate-500" />
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Archived Trips</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archivedTrips.map(trip => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link to={`/trips/${trip.id}`}>
      <Card className="hover:border-blue-200 dark:hover:border-blue-700 transition-colors group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {trip.name}
            </h3>
            {trip.location && (
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                <MapPin size={11} />
                {trip.location}
              </div>
            )}
          </div>
          <TripStatusBadge status={trip.status} />
        </div>

        {trip.description && (
          <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">{trip.description}</p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {format(new Date(trip.start_date), 'MMM d')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
          </div>
          <span className="text-blue-600 dark:text-blue-400 font-medium group-hover:underline">View →</span>
        </div>
      </Card>
    </Link>
  );
}
