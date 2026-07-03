import React from "react";
import { QuorLogo } from "./QuorLogo";

interface FooterProps {
  setRoute: (route: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setRoute }) => {
  return (
    <footer className="bg-[#07090f] border-t border-gray-800 text-gray-500 text-xs py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo Brand column */}
          <div className="md:col-span-2 space-y-4">
            <div onClick={() => setRoute("/")} className="flex items-center space-x-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center p-1 shadow-md group-hover:border-cyan-500/50 transition-colors">
                <QuorLogo size={20} className="group-hover:scale-110 transition-transform duration-250" />
              </div>
              <span className="text-lg font-bold font-display uppercase tracking-widest text-[#f3f4f6]">
                QUOR
              </span>
            </div>
            <p className="max-w-sm text-gray-400 text-xs leading-relaxed">
              QUOR is India's leading decentralised video clipping marketplace. We connect elite video editors and micro-influencers directly with long-form creators to drive organic views on Instagram Reels and YouTube Shorts.
            </p>
            <p className="text-[10px] text-gray-600 font-mono">
              All transactions are secured transparently via our automated 20% platform commission model.
            </p>
          </div>

          {/* Links column */}
          <div>
            <h3 className="text-gray-300 font-semibold uppercase tracking-wider text-[11px] mb-4">Marketplace</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setRoute("/auth/signup")} className="hover:text-cyan-400 transition-colors text-left">
                  Apply as Clipper
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/auth/signup")} className="hover:text-cyan-400 transition-colors text-left">
                  Hire Elite Clippers
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/")} className="hover:text-cyan-400 transition-colors text-left">
                  Explore Active Campaigns
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/about")} className="hover:text-cyan-400 transition-colors text-left">
                  Platform Mechanics
                </button>
              </li>
            </ul>
          </div>

          {/* Legal columns */}
          <div>
            <h3 className="text-gray-300 font-semibold uppercase tracking-wider text-[11px] mb-4">Legal & Support</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setRoute("/legal")} className="hover:text-cyan-400 transition-colors text-left">
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/legal")} className="hover:text-cyan-400 transition-colors text-left">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/legal")} className="hover:text-cyan-400 transition-colors text-left">
                  Refund & Dispute Policy
                </button>
              </li>
              <li>
                <button onClick={() => setRoute("/contact")} className="hover:text-cyan-400 transition-colors text-left">
                  Contact Support Helpline
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-900 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between text-gray-600 text-[11px]">
          <p>© {new Date().getFullYear()} QUOR Marketplace. All Rights Reserved. Made for modern content creators.</p>
          <div className="flex space-x-6 mt-4 sm:mt-0 font-mono text-[10px]">
            <span>SYSTEM_STATUS: ONLINE</span>
            <span>SECURE_256_BIT_SSL_GATEWAY</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
