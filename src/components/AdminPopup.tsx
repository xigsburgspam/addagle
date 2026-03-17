import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, GraduationCap, Facebook, ShieldCheck, Zap } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

interface AdminPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPopup: React.FC<AdminPopupProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Popup Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-neutral-900/40 border border-emerald-500/30 rounded-[40px] overflow-hidden backdrop-blur-2xl shadow-[0_0_50px_rgba(16,185,129,0.1)]"
          >
            {/* Animated Glow Border */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-emerald-500/20 opacity-50" />
            </div>

            {/* Header */}
            <div className="relative p-8 pb-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.adminInfo}</h2>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-emerald-500/60">Authorized Access</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors group"
              >
                <X className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" />
              </button>
            </div>

            {/* Body */}
            <div className="relative p-8 space-y-8">
              {/* Profile Section */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-[32px] bg-neutral-800 border border-emerald-500/20 flex items-center justify-center overflow-hidden">
                    <img 
                      src="https://scontent.fcgp36-1.fna.fbcdn.net/v/t39.30808-6/624566653_826780590405701_6900053212918682551_n.jpg?stp=dst-jpg_p526x296_tt6&_nc_cat=102&ccb=1-7&_nc_sid=7b2446&_nc_eui2=AeE8M-MHPViRExKrrTNgBtfRkZJ_gbWL7u-Rkn-BtYvu76F223k1gSXOPxXfoWerFoxCev9J2VAIuPg4um87HhWc&_nc_ohc=WORlPWuGld0Q7kNvwFxzfwP&_nc_oc=AdnlJG5kuO-bR5LQs5zXrt9BqHX1kEPF5kYDG-YKnGg2ETElK8J4s3lmSu66eC7kTgc&_nc_zt=23&_nc_ht=scontent.fcgp36-1.fna&_nc_gid=mwgAGdAl65NP1IpCmYxyYg&_nc_ss=8&oh=00_AfzWEf-B5-wkDfWJi2JtvaJhmXPOBOotg9CqJAsWlrGbZw&oe=69BEF275" 
                      alt={t.adminName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Zap className="w-4 h-4 text-black" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white  tracking-tight">{t.adminName}</h3>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.4em] mt-1">{t.adminRole}</p>
                </div>
              </div>

              {/* Info Grid */}
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex gap-4 items-start">
                  <GraduationCap className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />
                  <p className="text-xs font-medium text-neutral-300 leading-relaxed">
                    {t.adminEducation}
                  </p>
                </div>

                <a
                  href="https://facebook.com/xigsburg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex gap-4 items-center hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all group"
                >
                  <Facebook className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                    {t.adminFacebook}
                  </span>
                </a>
              </div>

              {/* Footer Decoration */}
              <div className="pt-4 flex items-center justify-between border-t border-white/5">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-4 h-1 rounded-full bg-emerald-500/20" />
                  ))}
                </div>
                <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Protocol v2.5.0</span>
              </div>
            </div>

            {/* Action Button */}
            <div className="p-8 pt-0">
              <button
                onClick={onClose}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20"
              >
                {t.close}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
