import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, MapPin, Users, Info } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Input, Textarea, Select, Button, Alert } from '../components/ui/index';
import { createTrip } from '../lib/api';
import toast from 'react-hot-toast';

const tripSchema = z.object({
  name: z.string().min(2, 'Trip name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  currency: z.string().default('BDT'),
  members: z.array(
    z.object({
      name: z.string().min(1, 'Member name required').max(100),
      notes: z.string().max(200).optional(),
    })
  ).min(1, 'Add at least one member').max(50),
}).refine(data => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

type TripFormData = z.infer<typeof tripSchema>;

const currencyOptions = [
  { value: 'BDT', label: 'BDT (৳) — Bangladeshi Taka' },
  { value: 'USD', label: 'USD ($) — US Dollar' },
  { value: 'EUR', label: 'EUR (€) — Euro' },
];

export function CreateTripPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      currency: 'BDT',
      members: [{ name: '', notes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'members' });

  const onSubmit = async (data: TripFormData) => {
    setSubmitError(null);
    try {
      const trip = await createTrip({
        ...data,
        members: data.members.filter(m => m.name.trim()),
      });
      toast.success('Trip created successfully!');
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create trip');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create New Trip</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Fill in the trip details and add all participating members.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {submitError && <Alert variant="danger">{submitError}</Alert>}

          {/* Trip Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-blue-600 dark:text-blue-400" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Trip Details</h2>
            </div>

            <Input
              label="Trip Name"
              placeholder="Cox's Bazar Weekend 2025"
              error={errors.name?.message}
              required
              {...register('name')}
            />

            <Textarea
              label="Description"
              placeholder="A fun beach trip with friends..."
              error={errors.description?.message}
              {...register('description')}
            />

            <Input
              label="Location"
              placeholder="Cox's Bazar, Bangladesh"
              error={errors.location?.message}
              {...register('location')}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start Date"
                type="date"
                defaultValue={today}
                error={errors.start_date?.message}
                required
                {...register('start_date')}
              />
              <Input
                label="End Date"
                type="date"
                defaultValue={today}
                error={errors.end_date?.message}
                required
                {...register('end_date')}
              />
            </div>

            <Select
              label="Currency"
              options={currencyOptions}
              error={errors.currency?.message}
              {...register('currency')}
            />
          </div>

          {/* Members */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-blue-600 dark:text-blue-400" />
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">Trip Members</h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                {fields.length} member{fields.length !== 1 ? 's' : ''}
              </span>
            </div>

            {errors.members?.root && (
              <p className="text-sm text-red-600 mb-3">{errors.members.root.message}</p>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder={`Member ${index + 1} name *`}
                      error={errors.members?.[index]?.name?.message}
                      {...register(`members.${index}.name`)}
                    />
                    <Input
                      placeholder="Notes (optional)"
                      {...register(`members.${index}.notes`)}
                    />
                  </div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-1 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                      aria-label="Remove member"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={14} />}
              className="mt-3"
              onClick={() => append({ name: '', notes: '' })}
            >
              Add Member
            </Button>

            <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-lg">
              <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Members can be added or edited after creation. A member with existing transactions
                can be deactivated but not removed.
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 justify-end pb-8">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              leftIcon={<Plus size={16} />}
            >
              Create Trip
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
