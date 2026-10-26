import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, DollarSign } from 'lucide-react';
import { Input, Select, Textarea, Button, Alert } from '../ui';
import { Modal } from '../ui/Modal';
import { addContribution } from '../../lib/api';
import type { TripMember, Contribution, PaymentMethod } from '../../types';
import toast from 'react-hot-toast';

const contributionSchema = z.object({
  member_id: z.string().uuid('Select a member'),
  amount: z.coerce.number().int('Amount must be a whole number').positive('Amount must be positive'),
  occurred_at: z.string().min(1, 'Date is required'),
  payment_method: z.enum(['cash', 'bkash', 'nagad', 'bank', 'other']),
  note: z.string().max(300).optional(),
  reference: z.string().max(100).optional(),
});

type ContributionFormData = z.infer<typeof contributionSchema>;

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

interface AddContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  members: TripMember[];
  /** When set (Group Member), only this member can be selected. */
  restrictedMemberId?: string | null;
  onSuccess: (contribution: Contribution) => void;
}

export function AddContributionModal({
  isOpen,
  onClose,
  tripId,
  members,
  restrictedMemberId,
  onSuccess,
}: AddContributionModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormData>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      payment_method: 'cash',
      occurred_at: new Date().toISOString().slice(0, 16),
    },
  });

  const activeMembers = members.filter(m => m.status === 'active')
    .filter(m => !restrictedMemberId || m.id === restrictedMemberId);

  const handleClose = useCallback(() => {
    reset();
    setSubmitError(null);
    onClose();
  }, [reset, onClose]);

  const onSubmit = async (data: ContributionFormData) => {
    setSubmitError(null);
    try {
      const contribution = await addContribution(tripId, {
        member_id: data.member_id,
        amount: data.amount,
        occurred_at: new Date(data.occurred_at).toISOString(),
        payment_method: data.payment_method as PaymentMethod,
        note: data.note,
        reference: data.reference,
      });
      toast.success(`Contribution of ৳${data.amount.toLocaleString()} recorded!`);
      reset();
      onSuccess(contribution);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record contribution');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Contribution"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            form="contribution-form"
            type="submit"
            variant="success"
            loading={isSubmitting}
            leftIcon={<Plus size={15} />}
          >
            Record Contribution
          </Button>
        </>
      }
    >
      <form id="contribution-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {submitError && <Alert variant="danger">{submitError}</Alert>}

        <Select
          label="Member"
          options={activeMembers.map(m => ({ value: m.id, label: m.name }))}
          placeholder="Select member..."
          error={errors.member_id?.message}
          required
          {...register('member_id')}
        />

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Amount (৳) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">৳</span>
            <input
              type="number"
              min="1"
              step="1"
              className={`form-input pl-7 ${errors.amount ? 'error' : ''}`}
              placeholder="1000"
              {...register('amount')}
            />
          </div>
          {errors.amount && <p className="text-sm text-red-600 mt-1">{errors.amount.message}</p>}
        </div>

        <Input
          label="Date & Time"
          type="datetime-local"
          error={errors.occurred_at?.message}
          required
          {...register('occurred_at')}
        />

        <Select
          label="Payment Method"
          options={paymentMethodOptions}
          error={errors.payment_method?.message}
          required
          {...register('payment_method')}
        />

        <Input
          label="Reference"
          placeholder="Transaction ID, receipt no., etc."
          error={errors.reference?.message}
          {...register('reference')}
        />

        <Textarea
          label="Note"
          placeholder="Any additional notes..."
          error={errors.note?.message}
          rows={2}
          {...register('note')}
        />
      </form>
    </Modal>
  );
}

// ─── Contribution Card ────────────────────────────────────────────────────────

interface ContributionCardProps {
  contribution: Contribution;
  onVoid: (id: string) => void;
  isAdmin: boolean;
}

export function ContributionCard({ contribution: c, onVoid, isAdmin }: ContributionCardProps) {
  const paymentLabels: Record<PaymentMethod, string> = {
    cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', bank: 'Bank', other: 'Other',
  };

  return (
    <div className={`p-4 rounded-xl border ${c.status === 'void' ? 'opacity-50 bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <DollarSign size={16} className="text-green-700" />
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{c.member?.name ?? '—'}</p>
            <p className="text-xs text-slate-500">
              {paymentLabels[c.payment_method]} ·{' '}
              {new Date(c.occurred_at).toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            {c.note && <p className="text-xs text-slate-600 mt-0.5 italic">{c.note}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${c.status === 'void' ? 'text-slate-400 line-through' : 'amount-positive'}`}>
            +৳{c.amount.toLocaleString()}
          </span>
          {c.status === 'void' && (
            <span className="badge bg-red-100 text-red-600 text-xs">Void</span>
          )}
          {c.status === 'valid' && isAdmin && (
            <button
              onClick={() => onVoid(c.id)}
              className="btn btn-ghost btn-sm p-1 text-xs text-slate-400 hover:text-red-500"
              title="Void this contribution"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
