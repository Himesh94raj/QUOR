import React, { useState } from "react";
import { ClipperProfile, PayoutRequest } from "../types";
import { API_BASE } from "../config";
import { CircleDollarSign, CheckCircle2, ChevronRight, CornerDownRight, Settings, AlertCircle, RefreshCw } from "lucide-react";

interface WithdrawModalProps {
  clipperProfile: ClipperProfile | null;
  totalEarned: number;
  totalWithdrawn: number;
  pendingWithdrawal: number;
  authToken: string;
  onSuccess: () => Promise<void>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  clipperProfile,
  totalEarned,
  totalWithdrawn,
  pendingWithdrawal,
  authToken,
  onSuccess
}) => {
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const availableBalance = Math.max(totalEarned - totalWithdrawn - pendingWithdrawal, 0);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const withdrawAmount = Number(amount);

    if (!clipperProfile || !clipperProfile.upiId) {
      setErr("Settlement Error: Please update and link your valid registered UPI Handle inside the Profile tab first!");
      return;
    }

    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount < 500) {
      setErr("Threshold Limit: Minimum allowed platform withdrawal amount is ₹500.");
      return;
    }

    if (withdrawAmount > availableBalance) {
      setErr(`Insufficient funds. Your total withdrawable available balance is ₹${availableBalance.toFixed(2)}.`);
      return;
    }

    try {
      setLoading(true);
      setErr(null);
      setSuccess(null);

      const res = await fetch(`${API_BASE}/api/clipper/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ amount: withdrawAmount })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit payout withdrawal request");
      }

      setSuccess(`Success! Withdrawal request of ₹${withdrawAmount} registered safely. Settlement will be credited to UPI: ${clipperProfile.upiId} shortly upon Admin approval.`);
      setAmount("");
      await onSuccess();
    } catch (error: any) {
      setErr(error?.message || "Could not execute withdrawal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111625] border border-gray-800 rounded-3xl p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-950 flex items-center justify-center">
          <CircleDollarSign className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-base font-bold font-display text-white">Settlements & Withdrawals</h3>
          <p className="text-gray-400 text-xs">Request instant payout of your verified clipping view commission.</p>
        </div>
      </div>

      {/* Grid of settlement summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#151c30] p-4 rounded-xl border border-gray-800/80">
          <span className="text-[10px] text-gray-400 block font-mono uppercase">LIFETIME EARNINGS</span>
          <strong className="text-lg font-black text-white font-display">₹{totalEarned.toFixed(2)}</strong>
          <span className="text-[9px] text-gray-500 block leading-tight font-mono mt-0.5">80% Net Share split</span>
        </div>

        <div className="bg-[#151c30] p-4 rounded-xl border border-gray-800/80">
          <span className="text-[10px] text-gray-400 block font-mono uppercase">WITHDRAWN EARNINGS</span>
          <strong className="text-lg font-black text-gray-400 font-display">₹{totalWithdrawn.toFixed(2)}</strong>
          <span className="text-[9px] text-gray-500 block leading-tight font-mono mt-0.5">Processing / Settled</span>
        </div>

        <div className="bg-[#19243d] p-4 rounded-xl border border-cyan-900/30">
          <span className="text-[10px] text-cyan-400 block font-mono uppercase">AVAILABLE BALANCE</span>
          <strong className="text-lg font-black text-cyan-400 font-display">₹{availableBalance.toFixed(2)}</strong>
          <span className="text-[9px] text-cyan-500 block leading-tight font-mono mt-0.5">Withdrawable split</span>
        </div>
      </div>

      {/* UPI Info status */}
      <div className="bg-[#131a2c]/60 p-4 rounded-2xl border border-gray-850/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-mono block">CONNECTED UPI ADDRESS:</span>
          {clipperProfile && clipperProfile.upiId ? (
            <span className="text-xs font-mono text-white bg-gray-950 px-2.5 py-1 rounded border border-gray-800">{clipperProfile.upiId}</span>
          ) : (
            <span className="text-xs text-rose-400 font-mono flex items-center space-x-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>No active UPI handle linked!</span>
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 max-w-xs leading-normal">
          Payouts are processed instantly to your configured UPI address via GPay, Paytm, or PhonePe.
        </div>
      </div>

      {/* Withdrawal Form */}
      {availableBalance >= 500 ? (
        <form onSubmit={handleWithdraw} className="bg-[#141a2a]/40 p-4 rounded-2xl border border-gray-800/60 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-gray-400 block uppercase tracking-wider">WITHDRAW INR AMOUNT (₹)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -track-y-1/2 -translate-y-1/2 text-gray-500 font-display text-sm font-bold">₹</span>
              <input 
                type="number"
                min="500"
                step="1"
                max={Math.floor(availableBalance)}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Minimum 500"
                className="w-full bg-[#181f33] border border-gray-800 rounded-xl pl-8 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {err && (
            <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400 font-medium leading-normal">
              {err}
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-xs text-emerald-300 font-medium leading-relaxed">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 text-white text-xs font-bold font-mono uppercase tracking-wider py-3 rounded-xl transition-all flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing UPI Settlement Request...</span>
              </>
            ) : (
              <>
                <span>Execute UPI Settlement</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      ) : (
        <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-2xl text-amber-300 flex items-start space-x-3 text-xs leading-relaxed">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="font-bold text-white uppercase tracking-wider">Withdrawal Threshold Locked</h4>
            <p className="text-[11px] text-amber-300/80">
              You haven't accumulated the minimum required settlement amount of <strong className="text-white">₹500</strong> yet. Continue submitting public clip URLs and wait for automated view tracking updates to increase your available earnings!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
