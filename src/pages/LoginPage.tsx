import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wallet, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Input, Button, Alert } from '../components/ui/index';
import { isSupabaseConfigured } from '../lib/supabase';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (data: LoginForm) => {
    setAuthError(null);
    try {
      await signIn(data.email, data.password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      if (message.includes('Invalid login credentials')) {
        setAuthError('Incorrect email or password. Please try again.');
      } else if (message.includes('Email not confirmed')) {
        setAuthError('Please check your email and confirm your account before signing in.');
      } else {
        setAuthError(message);
      }
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Wallet size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Trip Expense Manager</h1>
          <p className="text-blue-200/70 text-sm mt-1">Manage your group trip finances</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Sign in to your account</h2>

          {!isSupabaseConfigured && (
            <div className="mb-5">
              <Alert variant="warning" title="Supabase Not Configured">
                Please set up your Supabase credentials in <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">.env</code> (copy from <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">.env.example</code>) and run the database migration <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">supabase/migrations/001_initial_schema.sql</code>.
              </Alert>
            </div>
          )}

          {authError && (
            <div className="mb-5">
              <Alert variant="danger">{authError}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label="Email address"
              type="email"
              id="email"
              autoComplete="email"
              placeholder="you@example.com"
              leftIcon={<Mail size={16} />}
              error={errors.email?.message}
              required
              {...register('email')}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Lock size={16} />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`form-input pl-9 pr-10 ${errors.password ? 'error' : ''}`}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              loading={isSubmitting}
            >
              Sign in
            </Button>
          </form>

          {/* Instructions */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              New administrator setup
            </p>
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
              <li>Go to your Supabase project dashboard</li>
              <li>Navigate to Authentication → Users</li>
              <li>Click <strong>"Add user"</strong> and create an account</li>
              <li>Return here and sign in with those credentials</li>
            </ol>
          </div>
        </div>

        <p className="text-center text-xs text-blue-200/50 mt-6">
          Bangladesh Taka (৳) · Asia/Dhaka timezone
        </p>
      </div>
    </div>
  );
}
