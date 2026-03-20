// Embeddable content used in both page and popup
export const TermsPrivacyContent: React.FC<{ type: 'terms' | 'privacy' }> = ({ type }) => {
  return (
    <div className="space-y-3 pb-4">
      {type === 'terms' ? (
        <>
          <Section title="1. Acceptance of Terms">
            <p>By accessing or using Gupto ("the Service"), you confirm that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, you must discontinue use immediately. We reserve the right to update these Terms at any time.</p>
          </Section>
          <Section title="2. Eligibility — 18+ Only">
            <p><strong className="text-white">You must be at least 18 years old</strong> to use Gupto. By using the Service, you represent that you are of legal age and that your use complies with all applicable laws.</p>
          </Section>
          <Section title="3. Prohibited Content & Conduct">
            <p>The following are <strong className="text-red-400">strictly prohibited</strong> and result in an immediate permanent ban: sexually explicit content, nudity, violence, harassment, hate speech, solicitation, scamming, impersonation, sharing others' personal data, bots or automated tools, and any content that violates applicable law.</p>
          </Section>
          <Section title="4. Moderation & Enforcement">
            <p>Gupto uses active moderation. Our team may monitor sessions, terminate calls, issue temporary (6-hour) or permanent bans, and act on user reports. All enforcement decisions are at Gupto's sole discretion.</p>
          </Section>
          <Section title="5. Token System">
            <p>New accounts receive 100 free tokens. Video calls cost 7 tokens, custom chat rooms cost 4 tokens, and text chat topups cost 1 token per 50 characters. Tokens have no monetary value and are non-refundable.</p>
          </Section>
          <Section title="6. Referral Programme">
            <p>Users may share invite links. Referral bonuses are reviewed and gifted manually by admins. Abuse of the referral system (fake accounts, self-referrals) results in disqualification and potential ban.</p>
          </Section>
          <Section title="7. Intellectual Property">
            <p>All content on Gupto — design, code, logo, branding — is the exclusive property of Gupto. You may not copy or redistribute any part without explicit written permission.</p>
          </Section>
          <Section title="8. Disclaimers & Liability">
            <p>Gupto is provided "as is" without warranty. To the maximum extent permitted by law, Gupto shall not be liable for any direct, indirect, or consequential damages arising from your use of the Service.</p>
          </Section>
          <Section title="9. Termination">
            <p>We may suspend or terminate your access at any time, with or without cause. Your tokens and account data are forfeited upon termination for policy violations.</p>
          </Section>
          <Section title="10. Governing Law">
            <p>These Terms are governed by applicable laws. Disputes shall be subject to the exclusive jurisdiction of the relevant courts.</p>
          </Section>
          <Section title="11. Contact">
            <p>Questions? Reach us at <a href="https://www.facebook.com/guptochat/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">facebook.com/guptochat</a></p>
          </Section>
        </>
      ) : (
        <>
          <Section title="1. Our Privacy Commitment">
            <p>Privacy is a core design principle at Gupto. We built the platform to minimise data collection and maximise anonymity. This policy explains exactly what we do and do not collect.</p>
          </Section>
          <Section title="2. What We Collect">
            <p><strong className="text-white">From Google Sign-In:</strong> email address, display name, profile photo, unique Firebase UID.</p>
            <p><strong className="text-white">Usage data:</strong> token balance, referral count, seen announcement IDs, chosen display name, block status.</p>
            <p><strong className="text-white">Moderation data:</strong> reports filed by/against you, block status and expiry.</p>
          </Section>
          <Section title="3. What We Do NOT Collect">
            <p>We <strong className="text-red-400">never</strong> store: video or audio recordings, chat message content, IP addresses for tracking, device fingerprints, or advertising identifiers.</p>
          </Section>
          <Section title="4. Video & Audio">
            <p>All video and audio streams go directly between you and your chat partner's device — they do not pass through or get stored on our servers.</p>
          </Section>
          <Section title="5. Text Chat">
            <p>Messages are relayed in real-time and are <strong className="text-white">never stored</strong>. Once a session ends, all messages are permanently gone.</p>
          </Section>
          <Section title="6. How We Use Your Data">
            <p>Your data is used solely for: authentication, enforcing community guidelines, operating the token system, delivering announcements, and preventing abuse. We do not sell or share your data.</p>
          </Section>
          <Section title="7. Data Storage & Security">
            <p>Account data is stored in a secure cloud database with industry-standard encryption at rest and in transit. Strict security rules ensure users can only access their own data.</p>
          </Section>
          <Section title="8. Google Sign-In">
            <p>We receive only your basic profile (email, name, photo). We do not access your Gmail, Drive, or other Google services. You can revoke access anytime from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Account settings</a>.</p>
          </Section>
          <Section title="9. Children's Privacy">
            <p>Gupto is strictly 18+. We do not knowingly collect data from anyone under 18. Accounts found to belong to minors are immediately deleted.</p>
          </Section>
          <Section title="10. Your Rights">
            <p>You have the right to access, delete, correct, or export your data. Contact us via Facebook to exercise these rights.</p>
          </Section>
          <Section title="11. Contact">
            <p>Privacy questions? <a href="https://www.facebook.com/guptochat/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">facebook.com/guptochat</a></p>
          </Section>
        </>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, ChevronDown, ChevronUp } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-neutral-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 bg-neutral-900/60 hover:bg-neutral-900 transition-colors text-left"
      >
        <span className="text-sm font-black uppercase tracking-widest text-emerald-400">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />}
      </button>
      {open && (
        <div className="px-6 py-5 bg-neutral-950/50 text-neutral-400 text-sm leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
};

export const TermsPrivacy: React.FC<{ type: 'terms' | 'privacy' }> = ({ type }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-900 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
        </button>
        <div className="h-4 w-px bg-neutral-800" />
        <div className="flex items-center gap-2">
          {type === 'terms'
            ? <FileText className="w-4 h-4 text-emerald-500" />
            : <Shield className="w-4 h-4 text-emerald-500" />}
          <span className="text-sm font-black uppercase tracking-widest">
            {type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </span>
        </div>
        <span className="ml-auto text-[10px] text-neutral-600 font-mono">Last updated: March 2026</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-4">
            Gupto — Secure Random Chat
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-tight mb-3">
            {type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </h1>
          <p className="text-neutral-500 text-sm leading-relaxed">
            {type === 'terms'
              ? 'Please read these terms carefully before using Gupto. By using the platform you agree to everything below.'
              : 'We believe privacy is a right. Here is exactly what we collect, what we don\'t, and how we protect you.'}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-3">
          {type === 'terms' ? (
            <>
              <Section title="1. Acceptance of Terms">
                <p>By accessing or using Gupto ("the Service", "we", "us"), you confirm that you have read, understood, and agree to be bound by these Terms of Service and all applicable laws. If you do not agree with any part of these terms, you must discontinue use of the Service immediately.</p>
                <p>We reserve the right to update these Terms at any time. Continued use after changes constitutes acceptance of the new terms.</p>
              </Section>

              <Section title="2. Eligibility & Age Requirement">
                <p><strong className="text-white">You must be at least 18 years old</strong> to use Gupto. By using the Service, you represent and warrant that:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>You are 18 years of age or older</li>
                  <li>You have the legal capacity to enter into this agreement</li>
                  <li>Your use complies with all applicable local, national, and international laws</li>
                </ul>
                <p>We actively enforce age restrictions and will terminate accounts of users found to be underage.</p>
              </Section>

              <Section title="3. Prohibited Content & Conduct">
                <p>The following are <strong className="text-red-400">strictly prohibited</strong> and will result in an immediate permanent ban:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Sharing, displaying, or requesting sexually explicit or pornographic content</li>
                  <li>Nudity, partial nudity, or suggestive behaviour directed at minors</li>
                  <li>Violence, graphic content, threats, or incitement to harm</li>
                  <li>Harassment, bullying, hate speech, or discriminatory language</li>
                  <li>Solicitation, scamming, or fraudulent activity</li>
                  <li>Sharing personal information of others without consent</li>
                  <li>Impersonation of any person or entity</li>
                  <li>Use of bots, scripts, or automated tools</li>
                  <li>Any content that violates applicable law</li>
                </ul>
              </Section>

              <Section title="4. Moderation & Enforcement">
                <p>Gupto operates with active human and automated moderation. Our moderation team may:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Monitor live sessions for policy violations</li>
                  <li>Immediately terminate sessions in progress</li>
                  <li>Issue temporary bans (6 hours) or permanent bans</li>
                  <li>Review and act upon user reports within 24 hours</li>
                </ul>
                <p>All enforcement decisions are at Gupto's sole discretion and are generally final.</p>
              </Section>

              <Section title="5. Token System">
                <p>Gupto uses a token-based system to access premium features:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>New accounts receive 100 free tokens upon registration</li>
                  <li>Video calls cost 7 tokens per call</li>
                  <li>Custom chat rooms cost 4 tokens per session</li>
                  <li>Tokens can be purchased via WhatsApp or earned through referrals</li>
                  <li>Tokens have no monetary value and are non-refundable</li>
                  <li>We reserve the right to adjust token costs at any time</li>
                </ul>
              </Section>

              <Section title="6. Referral Programme">
                <p>Users may share invite links to earn bonus tokens. When someone registers using your invite link:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>The referral is recorded and reviewed by our admin team</li>
                  <li>Both the invitor and invited user may receive a token bonus at admin discretion</li>
                  <li>Abuse of the referral system (fake accounts, self-referrals) results in disqualification and potential ban</li>
                </ul>
              </Section>

              <Section title="7. Intellectual Property">
                <p>All content on Gupto — including but not limited to design, code, logo, and branding — is the exclusive property of Gupto and protected by applicable intellectual property laws. You may not copy, reproduce, or distribute any part of the Service without explicit written permission.</p>
              </Section>

              <Section title="8. Disclaimers & Limitation of Liability">
                <p>Gupto is provided "as is" without warranty of any kind. We do not guarantee uninterrupted or error-free service. To the maximum extent permitted by law, Gupto shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of the Service.</p>
              </Section>

              <Section title="9. Termination">
                <p>We may suspend or terminate your access at any time, with or without cause, with or without notice. Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination shall survive, including ownership, warranty disclaimers, and limitation of liability.</p>
              </Section>

              <Section title="10. Governing Law">
                <p>These Terms are governed by and construed in accordance with applicable laws. Any disputes arising in connection with these Terms shall be subject to the exclusive jurisdiction of the relevant courts.</p>
              </Section>

              <Section title="11. Contact">
                <p>For any questions regarding these Terms, please reach out to us via:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Facebook: <a href="https://www.facebook.com/guptochat/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">facebook.com/guptochat</a></li>
                </ul>
              </Section>
            </>
          ) : (
            <>
              <Section title="1. Our Privacy Commitment">
                <p>At Gupto, privacy is a core design principle — not an afterthought. We have built the platform to minimise data collection and maximise user anonymity. This policy explains exactly what we do and do not collect.</p>
              </Section>

              <Section title="2. What We Collect">
                <p><strong className="text-white">Account Information (via Google Sign-In):</strong></p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Your Google account email address</li>
                  <li>Your Google display name and profile photo</li>
                  <li>A unique user ID generated by Firebase Authentication</li>
                </ul>
                <p className="mt-2"><strong className="text-white">Usage Data:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Token balance and transaction history (purchases, usage)</li>
                  <li>Number of referrals made</li>
                  <li>Announcements you have viewed (stored as a list of IDs)</li>
                  <li>Your chosen display name (if saved)</li>
                </ul>
                <p className="mt-2"><strong className="text-white">Moderation Data:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Reports filed against you or by you, including stated reason and timestamp</li>
                  <li>Block status and, if temporarily blocked, the expiry timestamp</li>
                </ul>
              </Section>

              <Section title="3. What We Do NOT Collect">
                <p>We want to be explicit about what Gupto <strong className="text-red-400">never</strong> stores:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Video or audio recordings of any session</li>
                  <li>Chat message content (messages are relayed peer-to-peer and not persisted)</li>
                  <li>IP addresses for tracking purposes</li>
                  <li>Device fingerprints or advertising identifiers</li>
                  <li>Browsing history or behaviour outside of Gupto</li>
                </ul>
              </Section>

              <Section title="4. Video & Audio">
                <p>All video and audio streams are transmitted directly between your device and your chat partner's device — they do not pass through or get stored on our servers. Connection relay infrastructure is used only to establish the link and does not record any content.</p>
              </Section>

              <Section title="5. Text Chat">
                <p>Text messages are relayed in real-time via our servers and are <strong className="text-white">not stored anywhere</strong>. Once a chat session ends, all messages are permanently lost. We do not have access to your conversation history.</p>
              </Section>

              <Section title="6. How We Use Your Data">
                <p>The data we collect is used solely for:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Authenticating your identity and maintaining your session</li>
                  <li>Enforcing community guidelines and processing reports</li>
                  <li>Operating the token system (balance, purchases, usage)</li>
                  <li>Delivering platform announcements</li>
                  <li>Preventing abuse, fraud, and policy violations</li>
                </ul>
                <p>We do not sell, rent, or share your personal data with third parties for marketing or commercial purposes.</p>
              </Section>

              <Section title="7. Data Storage & Security">
                <p>Your account data is stored in a secure cloud database with industry-standard encryption at rest and in transit.</p>
                <p>Access is governed by strict security rules — users can only read and write their own data. Admin access is limited to a single verified admin account.</p>
              </Section>

              <Section title="8. Authentication (Google Sign-In)">
                <p>We use Google Sign-In for authentication. We receive only the basic profile information you grant (email, name, photo). We do not receive your password or access to your other Google services. You can revoke access at any time from your Google Account settings.</p>
              </Section>

              <Section title="9. Cookies & Local Storage">
                <p>Gupto uses browser local storage and session storage minimally — only to preserve your preferences (such as display name and language) and to facilitate the authentication session. We do not use tracking cookies or third-party advertising cookies.</p>
              </Section>

              <Section title="10. Children's Privacy">
                <p>Gupto is strictly for users aged 18 and over. We do not knowingly collect personal information from anyone under 18. If we become aware that a user is under 18, we will immediately delete their account and associated data. If you believe a minor is using the platform, please report it through our Facebook page.</p>
              </Section>

              <Section title="11. Your Rights">
                <p>You have the right to:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li><strong className="text-white">Access:</strong> Request a copy of the data we hold about you</li>
                  <li><strong className="text-white">Deletion:</strong> Request deletion of your account and all associated data</li>
                  <li><strong className="text-white">Correction:</strong> Update inaccurate information in your profile</li>
                  <li><strong className="text-white">Portability:</strong> Receive your data in a machine-readable format</li>
                </ul>
                <p>To exercise these rights, contact us via Facebook.</p>
              </Section>

              <Section title="12. Changes to This Policy">
                <p>We may update this Privacy Policy periodically. We will notify users of significant changes via an in-app announcement. The "Last updated" date at the top of this page reflects the most recent revision. Continued use of Gupto after changes constitutes acceptance of the updated policy.</p>
              </Section>

              <Section title="13. Contact">
                <p>For privacy concerns, data requests, or questions about this policy:</p>
                <ul className="list-disc list-inside space-y-1 text-neutral-500">
                  <li>Facebook: <a href="https://www.facebook.com/guptochat/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">facebook.com/guptochat</a></li>
                </ul>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest">© 2026 Gupto Protocol. All rights reserved.</p>
          <div className="flex gap-6">
            {type === 'terms'
              ? <a href="/privacy" className="text-neutral-600 hover:text-emerald-400 transition-colors text-[10px] font-bold uppercase tracking-widest">Privacy Policy</a>
              : <a href="/terms" className="text-neutral-600 hover:text-emerald-400 transition-colors text-[10px] font-bold uppercase tracking-widest">Terms of Service</a>}
            <a href="https://www.facebook.com/guptochat/" target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-blue-400 transition-colors text-[10px] font-bold uppercase tracking-widest">Facebook</a>
          </div>
        </div>
      </div>
    </div>
  );
};
