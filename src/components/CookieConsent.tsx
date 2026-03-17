import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cookie, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const accepted = localStorage.getItem('gupto_cookies_accepted');
    if (!accepted) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('gupto_cookies_accepted', 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-6 right-6 z-[200] flex justify-center pointer-events-none"
        >
          <div className="max-w-xl w-full bg-neutral-900 border border-neutral-800 rounded-[32px] p-6 shadow-2xl pointer-events-auto flex flex-col sm:flex-row items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Cookie className="w-6 h-6 text-emerald-500" />
            </div>
            
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-sm font-black uppercase tracking-widest  mb-1">{t.cookieTitle}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{t.cookieDesc}</p>
            </div>

            <button
              onClick={handleAccept}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap"
            >
              {t.accept}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
