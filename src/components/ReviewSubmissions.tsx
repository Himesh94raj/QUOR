import React, { useState } from "react";
import { Submission } from "../types";
import { Check, X, ShieldAlert, FileMinus, ExternalLink, HelpCircle, Eye, Youtube, Instagram, CheckCircle, RefreshCw } from "lucide-react";

interface ReviewSubmissionsProps {
  submissions: Submission[];
  onReview: (submissionId: string, status: "Approved" | "Rejected", feedback: string) => Promise<void>;
}

export const ReviewSubmissions: React.FC<ReviewSubmissionsProps> = ({
  submissions,
  onReview
}) => {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"Approved" | "Rejected" | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const startReview = (id: string, status: "Approved" | "Rejected") => {
    setReviewingId(id);
    setDecision(status);
    setFeedbackText(status === "Approved" ? "Excellent edit! Captions and transitions are outstanding." : "The clip quality does not match our guidelines. Missing required subtitles.");
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingId || !decision) return;
    try {
      setLoading(true);
      await onReview(reviewingId, decision, feedbackText);
      setReviewingId(null);
      setDecision(null);
      setFeedbackText("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract YouTube short image thumbnail or Instagram placeholder
  const getThumbnail = (url: string) => {
    const youtubeMatch = url.match(/(?:shorts\/|v=)([^&?/]+)/);
    if (youtubeMatch && youtubeMatch[1]) {
      return `https://img.youtube.com/vi/${youtubeMatch[1]}/hqdefault.jpg`;
    }
    // Fallback beautiful gradients representing social cards
    if (url.toLowerCase().includes("instagram.com")) {
      return "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300&auto=format&fit=crop&q=80"; // Instagram-purple-ish
    }
    return "https://images.unsplash.com/photo-1626379953822-baec19c3bbcd?w=300&auto=format&fit=crop&q=80"; // Video standard cover
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-black font-display text-white">Review Clipper Submissions</h3>
        <p className="text-xs text-gray-400">Review, preview, and approve editing clips submittal requests to track views.</p>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-[#111625] border border-gray-800 text-center py-12 rounded-2xl">
          <p className="text-xs text-gray-500">No submissions have been registered yet for this campaign.</p>
          <span className="text-[10px] text-gray-600 block font-mono mt-1">Clippers will see your instructions and post links once live.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {submissions.map(sub => {
            const isYT = sub.submittedUrl.toLowerCase().includes("youtube.com") || sub.submittedUrl.toLowerCase().includes("youtu.be");
            
            return (
              <div 
                key={sub.id}
                className="bg-[#111625] border border-gray-800 rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                {/* Thumbnail Preview Area */}
                <div className="relative aspect-video bg-black w-full overflow-hidden group">
                  <img 
                    src={getThumbnail(sub.submittedUrl)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1626379953822-baec19c3bbcd?w=300&auto=format&fit=crop&q=80";
                    }}
                    alt="oEmbed preview"
                    className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute top-2.5 left-2.5 bg-black/75 rounded-md p-1">
                    {isYT ? (
                      <Youtube className="w-4 h-4 text-red-500" />
                    ) : (
                      <Instagram className="w-4 h-4 text-pink-500" />
                    )}
                  </div>
                  {/* Overlay play button */}
                  <a 
                    href={sub.submittedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="bg-cyan-500 text-black px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1">
                      <span>Launch Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  </a>
                </div>

                {/* Sub Metadata Card */}
                <div className="p-4 space-y-3">
                  <div>
                    <span className="text-[10px] font-mono text-gray-500">CLIPPER AUTHOR:</span>
                    <p className="text-xs font-bold text-white mt-0.5">{sub.clipperName}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono text-gray-500 block">SUBMITTED URL:</span>
                    <a 
                      href={sub.submittedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline hover:text-cyan-300 text-[11px] truncate block mt-0.5"
                    >
                      {sub.submittedUrl}
                    </a>
                  </div>

                  {sub.status === "Pending" ? (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        onClick={() => startReview(sub.id, "Approved")}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => startReview(sub.id, "Rejected")}
                        className="flex-1 bg-rose-950/40 border border-rose-900 text-rose-300 hover:bg-rose-950/20 py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-mono">STATUS STATE:</span>
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full font-mono ${
                        sub.status === "Approved" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"
                      }`}>
                        {sub.status}
                      </span>
                    </div>
                  )}

                  {sub.feedback && (
                    <div className="bg-[#182033] p-2 rounded-lg text-[10px] text-gray-400 leading-normal border border-gray-800/40">
                      <strong className="text-gray-300 font-bold">Feedback: </strong> {sub.feedback}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* review action prompt overlay dialog */}
      {reviewingId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111625] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  Confirm Decision: <span className={decision === "Approved" ? "text-emerald-400" : "text-rose-400"}>{decision}</span>
                </h4>
                <p className="text-xs text-gray-400">Provide an optional feedback response back to the clipper for guidelines correction.</p>
              </div>

              <form onSubmit={submitReview} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">FEEDBACK MESSAGE</label>
                  <textarea 
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    rows={3}
                    placeholder="Provide a reason..."
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => { setReviewingId(null); setDecision(null); }}
                    className="bg-gray-800 text-white text-xs px-4 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className={`text-xs font-bold py-2 px-5 rounded-xl transition-all font-mono uppercase cursor-pointer ${
                      decision === "Approved" ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-rose-600 hover:bg-rose-500 text-white"
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center space-x-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Processing...</span>
                      </span>
                    ) : (
                      <span>Complete Review</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
