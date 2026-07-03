import React, { useState } from "react";
import { FileText, ShieldAlert, Sparkles, Scale } from "lucide-react";

type Tab = "terms" | "privacy" | "refunds";

export const LegalView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("terms");

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold font-display text-white">Legal Agreements & Disclaimers</h1>
        <p className="text-gray-400 text-xs">Read our standard legal operations policies governing users, wallet escrow holds, and commission mechanics.</p>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-gray-800 self-center justify-center space-x-1 p-1 bg-[#111625] rounded-xl max-w-md mx-auto">
        <button
          onClick={() => setActiveTab("terms")}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "terms" ? "bg-cyan-500 text-[#0c0f17]" : "text-gray-400 hover:text-white"
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Terms of Use</span>
        </button>
        <button
          onClick={() => setActiveTab("privacy")}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "privacy" ? "bg-cyan-500 text-[#0c0f17]" : "text-gray-400 hover:text-white"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Privacy Policy</span>
        </button>
        <button
          onClick={() => setActiveTab("refunds")}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "refunds" ? "bg-cyan-500 text-[#0c0f17]" : "text-gray-400 hover:text-white"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Refunding & Disputes</span>
        </button>
      </div>

      {/* Tabs Content */}
      <div className="bg-[#111625] border border-gray-800 rounded-3xl p-6 sm:p-10 space-y-6 text-xs text-gray-300 leading-relaxed shadow-xl">
        {activeTab === "terms" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <h2 className="text-lg font-bold font-display text-white">1. Master Service Terms of Use</h2>
              <span className="text-[10px] font-mono text-gray-500">Effective: June 2026</span>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-100">1.1 Agreement to Terms</h3>
              <p>
                By creating a client or clipper account on the QUOR platform, you explicitly consent to be legally bound by these conditions. If you do not accept these criteria, you are strictly prohibited from using the platform interface.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">1.2 Wallet escrow structures & guarantee</h3>
              <p>
                When long-form creators establish an active video clipping campaign with a selected CPM rate, the full target budget is escrow-locked inside their platform wallet automatically. This guarantees that clipper editors who successfully generate organic views on platform short-form assets will always be credited with their respective earnings without payment risk from the creator side.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">1.3 Clipper KYC Verification requirement</h3>
              <p>
                Only clippers who complete Aadhaar/PAN upload and match their legal name with a valid UPI payment ID can request withdrawals. This is a crucial legal criteria to counter financial system abuse, duplicate accounts, and systemic bot spam campaigns.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">1.4 Platform Commission split (80% / 20%)</h3>
              <p>
                The Platform operates as a mediator service and retains exactly 20% of every calculated view payout generated from active creator budgets. This fee is automatically deducted relative to accumulated views on approved clip urls.
              </p>
            </div>
          </div>
        )}

        {activeTab === "privacy" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <h2 className="text-lg font-bold font-display text-white">2. User Privacy & Information Security Policy</h2>
              <span className="text-[10px] font-mono text-gray-500">Effective: June 2026</span>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-100">2.1 Information We Collect</h3>
              <p>
                We collect personal registration metrics (Names, email addresses, passwords) alongside professional user social media profiles (YouTube Channels, Instagram handles). For clippers aiming to withdraw money, we also collect KYC details (Aadhaar or PAN numbers, UPI handles) which are stored behind strong platform server firewalls.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">2.2 KYC Document Storage Policy</h3>
              <p>
                Your KYC uploads are processed strictly for verification compliance. Documents are isolated in secure binary folders. Our team never discloses, trades, or leverages your verification assets for other secondary marketing campaigns.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">2.3 Third Party APIs Integration</h3>
              <p>
                We query public engagement statistics utilizing YouTube Data API v3 and public Instagram Reels endpoint paths. By linking short-form video clip URLs to QUOR campaigns, you concede to third-party tracking metrics necessary to facilitate matching earning disbursements.
              </p>
            </div>
          </div>
        )}

        {activeTab === "refunds" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <h2 className="text-lg font-bold font-display text-white">3. Refund, Dispute Claims & Escrow Policy</h2>
              <span className="text-[10px] font-mono text-gray-500">Effective: June 2026</span>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-100">3.1 Campaign Budget Refunds</h3>
              <p>
                Creators can delete or pause a campaign at any time. When a campaign is deleted or completed with remaining unspent escrow funds, those funds are instantly returned into the Creator's active wallet balance available for withdrawal or secondary campaigns.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">3.2 KYC Rejection Payout Hold</h3>
              <p>
                If a clipper's profile is suspicious or has KYC rejected due to mismatched name on PAN/Aadhaar or invalid UPI identifiers, all wallet payouts and view-tracking accumulation features will be on immediate hold pending manual developer contact.
              </p>

              <h3 className="text-sm font-semibold text-gray-100">3.3 Bot Velocity Disputes</h3>
              <p>
                If an approved link generates abnormally high view counts inside a short duration, QUOR's Bot Protection metrics will flag the submission as a potential fraud hazard. The Creator maintains the right to open a formal platform dispute. In case of developer investigation, if bots are verified, the clip will be rejected and the spend refunded to creator's budget.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#2a2517]/30 border border-amber-900/40 p-4 rounded-2xl flex items-start space-x-3 text-amber-300">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-xs">Agreement Guarantee</p>
          <p className="text-[10px] text-amber-400/80 leading-relaxed">
            By creating or maintaining matching active roles in our clipping ecosystem, both parties automatically consent to structural terms verified by the platform.
          </p>
        </div>
      </div>
    </div>
  );
};
