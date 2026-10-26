import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Wallet, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Button, Alert } from '../components/ui';
import { isSupabaseConfigured } from '../lib/supabase';

type Form = { email: string; password: string };

export function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const { lang, setLang, tr } = useLang();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>();

  if (loading) return null;
  if (user) return <Navigate to="/role" replace />;

  async function onSubmit(data: Form) {
    setAuthError(null);
    try {
      if (mode === 'login') await signIn(data.email, data.password);
      else await signUp(data.email, data.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      if (message.includes('Invalid login credentials')) setAuthError('Incorrect email or password. Please try again.');
      else if (message.includes('Email not confirmed')) setAuthError('Please check your email and confirm your account before signing in.');
      else setAuthError(message);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Wallet size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{tr('appTitle')}</h1>
          <p className="text-blue-200/70 text-sm mt-1">{tr('heroSubtitle')}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="flex justify-end mb-4">
            <select className="form-input !w-auto !py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value as 'bn' | 'en')}>
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-6">{tr('signinTitle')}</h2>
          {!isSupabaseConfigured && (
            <div className="mb-5"><Alert variant="warning">Supabase is not configured yet. Copy <code>.env.example</code> to <code>.env</code>, fill in your publishable key, then run <code>sql/01_setup.sql</code> and <code>sql/02_full_tables.sql</code> in Supabase SQL Editor.</Alert></div>
          )}
          {authError && <div className="mb-5"><Alert variant="danger">{authError}</Alert></div>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">Email address <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Mail size={16} /></span>
                <input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="form-input pl-9" {...register('email', { required: 'Please enter a valid email address' })} />
              </div>
              {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">{tr('password')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Lock size={16} /></span>
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="form-input pl-9 pr-10" {...register('password', { required: true, minLength: { value: 6, message: 'Password must be at least 6 characters' } })} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
            </div>
            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
              {mode === 'login' ? tr('login') : tr('signup')}
            </Button>
          </form>
          <p className="text-sm text-slate-600 mt-4 text-center">
            {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
            <button type="button" className="text-blue-600 font-semibold bg-transparent border-0 cursor-pointer p-0" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? tr('signup') : tr('login')}
            </button>
          </p>
          <p className="text-sm text-slate-500 mt-3">{tr('loginDesc')}</p>
        </div>
        <p className="text-center text-xs text-blue-200/50 mt-6">Bangladesh Taka (৳) · Asia/Dhaka timezone</p>
      </div>
    </div>
  );
}
