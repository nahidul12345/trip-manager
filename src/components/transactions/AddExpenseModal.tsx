import { useState, useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShoppingBag, Info } from 'lucide-react';
import { Input, Select, Textarea, Button, Alert, Badge } from '../ui';
import { Modal } from '../ui/Modal';
import { addExpense } from '../../lib/api';
import { equalSplit, percentageSplit } from '../../lib/financial-calculations';
import type { TripMember, Expense, ExpenseCategory, PaymentSource, SplitMethod } from '../../types';
import toast from 'react-hot-toast';

// Schema
const expenseSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(200),
  category: z.enum(['transport', 'food', 'tickets', 'accommodation', 'shopping', 'other']),
  amount: z.coerce.number().int('Amount must be a whole number').positive('Amount must be positive'),
  payment_source: z.enum(['group_fund', 'personal']),
  payer_member_id: z.string().optional(),
  occurred_at: z.string().min(1),
  description: z.string().max(500).optional(),
  split_method: z.enum(['equal', 'custom_amount', 'custom_percentage']),
  selected_member_ids: z.array(z.string()).min(1, 'Select at least one member'),
  custom_splits: z.array(z.object({
    member_id: z.string(),
    amount: z.coerce.number().optional(),
    percentage: z.coerce.number().optional(),
  })).optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

const categoryOptions = [
  { value: 'transport', label: '🚌 Transport' },
  { value: 'food', label: '🍽️ Food & Drinks' },
  { value: 'tickets', label: '🎟️ Tickets & Entry' },
  { value: 'accommodation', label: '🏨 Accommodation' },
  { value: 'shopping', label: '🛍️ Shopping' },
  { value: 'other', label: '📦 Other' },
];

const paymentSourceOptions = [
  { value: 'group_fund', label: 'Group Fund (paid from collected cash)' },
  { value: 'personal', label: 'Personally Paid (by a member)' },
];

const splitMethodOptions = [
  { value: 'equal', label: 'Equal Split' },
  { value: 'custom_amount', label: 'Custom Amounts (৳)' },
  { value: 'custom_percentage', label: 'Custom Percentages (%)' },
];

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  members: TripMember[];
  /** When set (Group Member), a personal expense can only be paid by them. */
  restrictedMemberId?: string | null;
  onSuccess: (expense: Expense) => void;
}

export function AddExpenseModal({
  isOpen,
  onClose,
  tripId,
  members,
  restrictedMemberId,
  onSuccess,
}: AddExpenseModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [splitPreview, setSplitPreview] = useState<Map<string, number>>(new Map());

  const activeMembers = members.filter(m => m.status === 'active');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: 'food',
      payment_source: 'group_fund',
      split_method: 'equal',
      occurred_at: new Date().toISOString().slice(0, 16),
      selected_member_ids: activeMembers.map(m => m.id),
      custom_splits: [],
    },
  });

  const watchedAmount = watch('amount');
  const watchedSplitMethod = watch('split_method');
  const watchedSelectedIds = watch('selected_member_ids');
  const watchedPaymentSource = watch('payment_source');
  const watchedCustomSplits = watch('custom_splits');

  // Auto-calculate split preview
  useEffect(() => {
    const amount = Number(watchedAmount);
    if (!amount || amount <= 0 || !watchedSelectedIds?.length) {
      setSplitPreview(new Map());
      return;
    }
    try {
      if (watchedSplitMethod === 'equal') {
        setSplitPreview(equalSplit(amount, watchedSelectedIds));
      } else if (watchedSplitMethod === 'custom_percentage') {
        const pctMap = new Map<string, number>();
        (watchedCustomSplits || []).forEach((s: { member_id?: string; percentage?: number }) => {
          if (s.member_id && s.percentage != null) {
            pctMap.set(s.member_id, s.percentage);
          }
        });
        if (pctMap.size === watchedSelectedIds.length) {
          try { setSplitPreview(percentageSplit(amount, pctMap)); } catch { setSplitPreview(new Map()); }
        }
      } else if (watchedSplitMethod === 'custom_amount') {
        const amtMap = new Map<string, number>();
        (watchedCustomSplits || []).forEach((s: { member_id?: string; amount?: number }) => {
          if (s.member_id && s.amount != null) {
            amtMap.set(s.member_id, s.amount);
          }
        });
        setSplitPreview(amtMap);
      }
    } catch { setSplitPreview(new Map()); }
  }, [watchedAmount, watchedSplitMethod, watchedSelectedIds, watchedCustomSplits]);

  // Update custom_splits when members change
  useEffect(() => {
    if (watchedSplitMethod !== 'equal') {
      const splits = (watchedSelectedIds || []).map((id: string) => ({
        member_id: id,
        amount: undefined,
        percentage: undefined,
      }));
      setValue('custom_splits', splits);
    }
  }, [watchedSelectedIds, watchedSplitMethod, setValue]);

  const handleClose = useCallback(() => {
    reset();
    setSubmitError(null);
    setReceiptFile(null);
    setSplitPreview(new Map());
    onClose();
  }, [reset, onClose]);

  const toggleMember = (memberId: string) => {
    const current = watchedSelectedIds || [];
    if (current.includes(memberId)) {
      setValue('selected_member_ids', current.filter((id: string) => id !== memberId));
    } else {
      setValue('selected_member_ids', [...current, memberId]);
    }
  };

  const selectAllMembers = () => {
    setValue('selected_member_ids', activeMembers.map(m => m.id));
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setSubmitError(null);
    try {
      const expense = await addExpense(tripId, {
        title: data.title,
        category: data.category as ExpenseCategory,
        amount: data.amount,
        payment_source: data.payment_source as PaymentSource,
        payer_member_id: data.payment_source === 'personal' ? data.payer_member_id : undefined,
        occurred_at: new Date(data.occurred_at).toISOString(),
        description: data.description,
        receipt_file: receiptFile || undefined,
        split_method: data.split_method as SplitMethod,
        selected_member_ids: data.selected_member_ids,
        custom_splits: data.custom_splits?.map((s: { member_id: string; amount?: number; percentage?: number }) => ({
          member_id: s.member_id,
          amount: s.amount,
          percentage: s.percentage,
        })),
      });
      toast.success(`Expense "৳${data.amount.toLocaleString()}" recorded!`);
      reset();
      setReceiptFile(null);
      setSplitPreview(new Map());
      onSuccess(expense);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record expense');
    }
  };

  // Calculate split total for validation display
  const splitTotal = Array.from(splitPreview.values()).reduce((s, a) => s + a, 0);
  const amount = Number(watchedAmount);
  const splitOk = amount > 0 && splitTotal === amount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Expense"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            form="expense-form"
            type="submit"
            variant="danger"
            loading={isSubmitting}
            leftIcon={<ShoppingBag size={15} />}
          >
            Record Expense
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {submitError && <Alert variant="danger">{submitError}</Alert>}

        <Input
          label="Expense Title"
          placeholder="Bus fare, hotel, lunch..."
          error={errors.title?.message}
          required
          {...register('title')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Category"
            options={categoryOptions}
            error={errors.category?.message}
            required
            {...register('category')}
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
                placeholder="1200"
                {...register('amount')}
              />
            </div>
            {errors.amount && <p className="text-sm text-red-600 mt-1">{errors.amount.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Payment Source"
            options={paymentSourceOptions}
            error={errors.payment_source?.message}
            required
            {...register('payment_source')}
          />
          <Input
            label="Date & Time"
            type="datetime-local"
            error={errors.occurred_at?.message}
            required
            {...register('occurred_at')}
          />
        </div>

        {watchedPaymentSource === 'personal' && (
          <Select
            label="Who Paid?"
            options={activeMembers
              .filter(m => !restrictedMemberId || m.id === restrictedMemberId)
              .map(m => ({ value: m.id, label: m.name }))}
            placeholder="Select payer..."
            error={errors.payer_member_id?.message}
            required
            {...register('payer_member_id')}
          />
        )}

        {/* Payment Source Info */}
        <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
          watchedPaymentSource === 'group_fund' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
        }`}>
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          {watchedPaymentSource === 'group_fund'
            ? 'This will decrease the group fund balance.'
            : 'The payer will be credited, and the expense will be allocated to selected members. Group fund is not affected.'}
        </div>

        {/* Member Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">
              Split Among <span className="text-red-500">*</span>
            </label>
            <button type="button" onClick={selectAllMembers} className="text-xs text-blue-600 hover:underline">
              Select all
            </button>
          </div>
          <Controller
            control={control}
            name="selected_member_ids"
            render={() => (
              <div className="flex flex-wrap gap-2">
                {activeMembers.map(member => {
                  const selected = (watchedSelectedIds || []).includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {member.name}
                      {selected && splitPreview.has(member.id) && (
                        <span className="text-xs opacity-80">
                          ৳{(splitPreview.get(member.id) || 0).toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          />
          {errors.selected_member_ids && (
            <p className="text-sm text-red-600 mt-1">{errors.selected_member_ids.message}</p>
          )}
        </div>

        {/* Split Method */}
        <Select
          label="Split Method"
          options={splitMethodOptions}
          error={errors.split_method?.message}
          {...register('split_method')}
        />

        {/* Custom Split Fields */}
        {watchedSplitMethod !== 'equal' && (watchedSelectedIds || []).length > 0 && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              {watchedSplitMethod === 'custom_amount' ? 'Set amount for each member' : 'Set percentage for each member'}
            </p>
            {(watchedSelectedIds || []).map((memberId: string, idx: number) => {
              const member = activeMembers.find(m => m.id === memberId);
              if (!member) return null;
              return (
                <div key={memberId} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-24 flex-shrink-0 truncate">{member.name}</span>
                  <div className="relative flex-1">
                    {watchedSplitMethod === 'custom_amount' ? (
                      <>
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="form-input pl-6 text-sm py-1.5"
                          placeholder="0"
                          {...register(`custom_splits.${idx}.amount`)}
                        />
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="form-input pr-8 text-sm py-1.5"
                          placeholder="0"
                          {...register(`custom_splits.${idx}.percentage`)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </>
                    )}
                    <input type="hidden" value={memberId} {...register(`custom_splits.${idx}.member_id`)} />
                  </div>
                  {splitPreview.has(memberId) && (
                    <span className="text-xs text-slate-500 w-20 text-right flex-shrink-0">
                      = ৳{(splitPreview.get(memberId) || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Split Validation */}
            {amount > 0 && (
              <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                splitOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                <span>Total allocated: ৳{splitTotal.toLocaleString()}</span>
                <span>Expense: ৳{amount.toLocaleString()}</span>
                {!splitOk && <Badge variant="danger">Mismatch: ৳{Math.abs(splitTotal - amount)}</Badge>}
                {splitOk && <Badge variant="success">✓ Balanced</Badge>}
              </div>
            )}
          </div>
        )}

        {/* Equal split preview */}
        {watchedSplitMethod === 'equal' && splitPreview.size > 0 && amount > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium text-slate-600 mb-2">Equal split preview:</p>
            {Array.from(splitPreview.entries()).map(([id, amt]) => {
              const member = activeMembers.find(m => m.id === id);
              return (
                <div key={id} className="flex justify-between text-slate-600">
                  <span>{member?.name}</span>
                  <span className="font-medium">৳{amt.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}

        <Textarea
          label="Description"
          placeholder="Additional details..."
          {...register('description')}
          rows={2}
        />

        {/* Receipt upload */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Receipt Image (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            onChange={e => setReceiptFile(e.target.files?.[0] || null)}
          />
          {receiptFile && <p className="text-xs text-slate-500 mt-1">Selected: {receiptFile.name}</p>}
        </div>
      </form>
    </Modal>
  );
}

// ─── Expense Card ─────────────────────────────────────────────────────────────

interface ExpenseCardProps {
  expense: Expense;
  onVoid: (id: string) => void;
  isAdmin: boolean;
}

const categoryEmoji: Record<ExpenseCategory, string> = {
  transport: '🚌', food: '🍽️', tickets: '🎟️',
  accommodation: '🏨', shopping: '🛍️', other: '📦',
};

export function ExpenseCard({ expense: e, onVoid, isAdmin }: ExpenseCardProps) {
  const [showAllocations, setShowAllocations] = useState(false);

  return (
    <div className={`p-4 rounded-xl border ${e.status === 'void' ? 'opacity-50 bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0 text-base">
            {categoryEmoji[e.category]}
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{e.title}</p>
            <p className="text-xs text-slate-500">
              {e.payment_source === 'group_fund' ? '👥 Group Fund' : `👤 ${e.payer_member?.name ?? 'Personal'}`}
              {' · '}
              {new Date(e.occurred_at).toLocaleDateString('en-BD', { day: 'numeric', month: 'short' })}
            </p>
            {e.description && (
              <p className="text-xs text-slate-600 mt-0.5 italic">{e.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${e.status === 'void' ? 'text-slate-400 line-through' : 'amount-negative'}`}>
            -৳{e.amount.toLocaleString()}
          </span>
          {e.status === 'void' && <span className="badge bg-red-100 text-red-600 text-xs">Void</span>}
          {e.status === 'valid' && isAdmin && (
            <button
              onClick={() => onVoid(e.id)}
              className="btn btn-ghost btn-sm p-1 text-xs text-slate-400 hover:text-red-500"
              title="Void this expense"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Allocations */}
      {e.allocations && e.allocations.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowAllocations(!showAllocations)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showAllocations ? 'Hide' : 'Show'} split ({e.allocations.length} members)
          </button>
          {showAllocations && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {e.allocations.map((a: NonNullable<Expense['allocations']>[number]) => (
                <div key={a.id} className="flex justify-between text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">
                  <span>{a.member?.name ?? '—'}</span>
                  <span className="font-medium">৳{a.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
