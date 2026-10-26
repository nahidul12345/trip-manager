import { createContext, useContext, useState, type ReactNode } from 'react';
import { getSavedLang, LANG_KEY, t, type DictKey, type Lang } from '../lib/i18n';

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; tr: (k: DictKey) => string };
const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getSavedLang());
  function setLang(l: Lang) {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }
  return <Ctx.Provider value={{ lang, setLang, tr: (k) => t(lang, k) }}>{children}</Ctx.Provider>;
}
export function useLang(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLang must be used inside LangProvider');
  return v;
}
