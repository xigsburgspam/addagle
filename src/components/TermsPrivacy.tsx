import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, FileText } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export const TermsPrivacy: React.FC<{ type: 'terms' | 'privacy' }> = ({ type }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const content = type === 'terms' ? {
    title: t.termsTitle,
    sections: [
      {
        title: '1. Acceptance of Terms',
        text: 'By accessing or using Gupto, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service.'
      },
      {
        title: '2. Eligibility',
        text: 'You must be at least 18 years old to use Gupto. By using the service, you represent and warrant that you are of legal age.'
      },
      {
        title: '3. Prohibited Content',
        text: 'You are strictly prohibited from sharing or broadcasting: 18+ content, nudity, violence, harassment, bullying, or any illegal material. Violation results in a permanent ban.'
      },
      {
        title: '4. User Conduct',
        text: 'You agree to treat other users with respect. Gupto is a moderated environment, and admins have the right to terminate any session.'
      },
      {
        title: '5. Termination',
        text: 'We reserve the right to terminate or suspend your access to Gupto at any time, without prior notice, for conduct that we believe violates these Terms.'
      }
    ]
  } : {
    title: t.privacyTitle,
    sections: [
      {
        title: '1. Data Collection',
        text: 'We do not store chat logs or video recordings. We collect minimal data required for authentication (Google account info) and moderation.'
      },
      {
        title: '2. Real-time Moderation',
        text: 'To ensure safety, we use real-time monitoring. This data is ephemeral and is not stored after the session ends unless a report is filed.'
      },
      {
        title: '3. Data Security',
        text: 'We use industry-standard encryption and security protocols to protect your data. All connections are ephemeral and designed with privacy as the top priority.'
      },
      {
        title: '4. Cookies',
        text: 'We use cookies to maintain your session and security preferences. You can manage cookie settings in your browser.'
      },
      {
        title: '5. Security',
        text: 'All video connections are end-to-end encrypted via WebRTC. We take reasonable measures to protect your information.'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 sm:p-12">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-12 group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest">{t.backToHome}</span>
        </button>

        <div className="flex items-center gap-4 mb-12">
          <div className="w-16 h-16 rounded-[24px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            {type === 'terms' ? <FileText className="w-8 h-8 text-emerald-500" /> : <Shield className="w-8 h-8 text-emerald-500" />}
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase italic">{content.title}</h1>
        </div>

        <div className="space-y-12">
          {content.sections.map((section, idx) => (
            <div key={idx} className="space-y-4">
              <h2 className="text-xl font-black uppercase tracking-tight italic text-emerald-500">{section.title}</h2>
              <p className="text-neutral-400 leading-relaxed font-medium">{section.text}</p>
            </div>
          ))}
        </div>

        <footer className="mt-20 pt-12 border-t border-neutral-900 text-center">
          <p className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest">{t.copyright}</p>
        </footer>
      </div>
    </div>
  );
};
