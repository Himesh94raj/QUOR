import React, { useState } from "react";
import { Mail, Phone, MapPin, Send, CheckCircle } from "lucide-react";
import { API_BASE } from "../config";

export const ContactView: React.FC = () => {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit. Please try again.");
      }
      setTicketNumber(data.ticketId);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 bg-[#111625] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Contact info panel */}
        <div className="bg-gradient-to-b from-[#131b31] to-[#0d1222] p-8 lg:p-12 space-y-8 text-gray-300">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold font-display text-white">Get in Touch</h2>
            <p className="text-xs text-gray-400">
              Have questions regarding payments, dispute payouts, view updates, or bulk enterprise creator contracts? Send our developer team an inquiry.
            </p>
          </div>

          <div className="space-y-6 text-xs text-gray-300">
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-950/60 flex items-center justify-center">
                <Mail className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="font-medium text-gray-400">Email Address</p>
                <p className="text-white mt-0.5">quorsupport@gmail.com</p>
              </div>
            </div>

            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-950/60 flex items-center justify-center">
                <Phone className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="font-medium text-gray-400">Hotline Number</p>
                <p className="text-white mt-0.5">+91 9142375006</p>
              </div>
            </div>

            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-950/60 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="font-medium text-gray-400">Headquarters Address</p>
                <p className="text-white mt-0.5">A Block Sector-63, Noida</p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-800/60 text-[10px] text-gray-500 font-mono">
            <span>RESPONSE_METRIC: &lt; 4 HOURS</span>
          </div>
        </div>

        {/* Contact Form panel */}
        <div className="lg:col-span-2 p-8 lg:p-12">
          {submitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-8 animate-fade-in">
              <div className="w-16 h-16 bg-emerald-950/80 border border-emerald-500/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold font-display text-white">Inquiry Received Successfully</h3>
              <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
                Thank you for contacting QUOR. Support ticket <strong className="text-cyan-400 font-mono font-bold">#{ticketNumber || "QUR-UNKNOWN"}</strong> has been logged and synchronized to Supabase. Our matching team will respond back to {formData.email} shortly.
              </p>
              <button 
                onClick={() => { setSubmitted(false); setFormData({ name: "", email: "", subject: "", message: "" }); }}
                className="mt-4 bg-[#171e2e] hover:bg-gray-800 border border-gray-800 text-white text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer font-semibold font-mono"
              >
                SEND ANOTHER RESPONSE
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-white">Direct Message Support Desk</h3>
                <p className="text-xs text-gray-400">Please provide precise context below to help speed up evaluation.</p>
              </div>

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-mono font-medium">
                  ERROR: {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400">Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter your name"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@domain.com"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400">Inquiry Subject</label>
                <input 
                  type="text" 
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Campaign Dispute, Payout Delay, etc."
                  className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400">Detailed Message Text</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  placeholder="How can we help you solve your platform issue?"
                  className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 text-white text-xs font-bold font-mono uppercase tracking-wider py-3 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>SUBMITTING TICKET...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Secure Ticket</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
