import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Button } from './ui';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { lang, setLang, tr } = useLang();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="bg-white border-b border-slate-200 no-print">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-slate-900 no-underline">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Wallet size={18} /></span>
            {tr('appTitle')}
          </Link>
          <div className="flex items-center gap-2">
            <select
              aria-label="Language"
              className="form-input !w-auto !py-2 text-sm"
              value={lang}
              onChange={(e) => setLang(e.target.value as 'bn' | 'en')}
            >
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
            {user && (
              <Button size="sm" variant="danger" onClick={async () => { await signOut(); navigate('/login'); }}>
                {tr('logout')}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
