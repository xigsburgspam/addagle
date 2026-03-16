import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  onConfirm: () => void;
}

export default function ConfirmationScreen({ onConfirm }: Props) {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full bg-neutral-900 border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Age Verification</h1>
            <p className="text-neutral-400 leading-relaxed">
              BlinkMeet connects you with random strangers for 15-second video chats. 
              You must be 18 years or older to use this service.
            </p>
          </div>

          <div className="bg-neutral-950/50 rounded-xl p-4 border border-white/5 text-sm text-neutral-300 text-left w-full space-y-3">
            <p className="font-medium text-white">Community Guidelines:</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>No nudity or sexually explicit content</li>
              <li>No harassment, bullying, or hate speech</li>
              <li>No illegal activities or violence</li>
            </ul>
          </div>

          <div className="w-full space-y-3 pt-4">
            <button
              onClick={onConfirm}
              className="w-full py-4 bg-white text-black hover:bg-neutral-200 rounded-xl font-semibold transition-colors shadow-lg shadow-white/10"
            >
              I am 18 or older, enter BlinkMeet
            </button>
            <a
              href="https://google.com"
              className="block w-full py-4 bg-neutral-800 text-white hover:bg-neutral-700 rounded-xl font-medium transition-colors border border-white/10"
            >
              I am under 18, leave site
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
