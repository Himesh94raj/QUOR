import React from "react";
import { Hammer, CircleDollarSign, ShieldCheck, Flame, Cpu, TrendingUp } from "lucide-react";

export const AboutView: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-16">
      {/* Hero section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold font-display bg-gradient-to-r from-cyan-400 via-indigo-200 to-white bg-clip-text text-transparent">
          The Decoupled Attention Engine
        </h1>
        <p className="max-w-2xl mx-auto text-gray-400 text-sm sm:text-base">
          QUOR is a self-governing two-sided marketplace designed to bridge the structural gap between brands and creators for each other growth.
        </p>
      </div>

      {/* Grid of mechanics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-cyan-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-cyan-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Cpu className="w-6 h-6 text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold font-display text-white mb-2">1. Decentralised Editing</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Creators set transparent CPM reward campaigns. Hundreds of verified remote clippers edit, refine, and optimize long-form videos into micro-content.
          </p>
        </div>

        <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-indigo-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold font-display text-white mb-2">2. Viral Post & Tag</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Clippers post clips as Instagram Reels or YouTube or X or facebook. They submit their public links back to QUOR to track view metrics automatically.
          </p>
        </div>

        <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-purple-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-purple-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <CircleDollarSign className="w-6 h-6 text-purple-400" />
          </div>
          <h3 className="text-lg font-bold font-display text-white mb-2">3. Direct CPM Payouts</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Every 1,000 views tracked earns verified money. Earnings scale dynamically with view velocity. Withdraw instantly to your verified UPI handle.
          </p>
        </div>
      </div>

      {/* Transparent Fees structure */}
      <div className="bg-gradient-to-r from-[#0d152c] to-[#0e1017] rounded-3xl p-8 border border-gray-800/80 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="space-y-3 max-w-lg">
          <span className="text-[10px] uppercase font-mono bg-cyan-900/40 text-cyan-400 px-2.5 py-1 rounded-full font-bold">
            COMMISSION SPLIT ENGINE
          </span>
          <h2 className="text-2xl font-extrabold font-display text-white">
            Transparent 20% Platform Fee
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            We align long-term interests. Creators buy clicks at set prices. The platform retains a 20% commission on accumulated payouts to run secure servers, track API metrics, and execute dispute claims. Clippers keep a direct 80% split of earned CPM.
          </p>
        </div>
        <div className="bg-slate-950/80 p-6 rounded-2xl border border-gray-800/60 min-w-[240px] text-center space-y-4">
          <div className="text-4xl font-black font-display text-cyan-400">80% / 20%</div>
          <div className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">Clipper Share / Platform Comm</div>
          <div className="text-xs text-indigo-300 font-medium">No hidden fees or monthly retainers.</div>
        </div>
      </div>

      {/* Safety & KYC info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-xl font-bold font-display text-white flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Fraud Protection & Bot Guard</span>
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            QUOR actively monitors sudden spike anomalies in link engagement. If high velocity spikes match malicious bot patterns or coordinate view groups, our system automatically pauses the view count updates and triggers an manual developer dispute.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold font-display text-white flex items-center space-x-2">
            <Hammer className="w-5 h-5 text-cyan-400" />
            <span>Strict Human KYC Rules</span>
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            To prevent platform exploitation, multiple submissions from duplicate IP accounts, or fake bank handles, all clippers must upload PAN/Aadhaar details and link a valid UPI ID registered under their matching legal name for quick payout approval.
          </p>
        </div>
      </div>
    </div>
  );
};
