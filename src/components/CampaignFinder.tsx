import React, { useState, useEffect } from "react";
import { Campaign, ClipperProfile } from "../types";
import { API_BASE } from "../config";
import { Search, SlidersHorizontal, Eye, DollarSign, Calendar, Flame, AlertCircle, Sparkles, Send, CheckCircle, Clock, ExternalLink, Calculator, User, Download } from "lucide-react";

interface CampaignFinderProps {
  userId: string;
  clipperProfile: ClipperProfile | null;
  authToken: string;
  setRoute: (route: string) => void;
}

export const CampaignFinder: React.FC<CampaignFinderProps> = ({
  userId,
  clipperProfile,
  authToken,
  setRoute
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchText, setSearchText] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // all, ugc, clipping, both
  const [sortBy, setSortBy] = useState<string>("cpm-high"); // cpm-high, deadline, budget

  // Link submission overlay state
  const [submittingCampaignId, setSubmittingCampaignId] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Campaign Detail View state
  const [selectedCampaignForDetails, setSelectedCampaignForDetails] = useState<Campaign | null>(null);
  const [estimateViews, setEstimateViews] = useState<string>("50000");

  const handleDownloadIcon = async (url: string, title: string) => {
    try {
      if (url.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_icon.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      const res = await fetch(url, { referrerPolicy: "no-referrer" });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_icon.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  const renderPlatformBadges = (platformStr: string) => {
    if (!platformStr) return null;
    const p = platformStr.toLowerCase();
    const list: string[] = [];
    if (p === "both") {
      list.push("YouTube Shorts", "Instagram Reels");
    } else if (p === "all") {
      list.push("YouTube Shorts", "Instagram Reels", "Facebook", "X (Twitter)");
    } else {
      if (p.includes("youtube") || p.includes("shorts")) list.push("YouTube Shorts");
      if (p.includes("instagram") || p.includes("reels")) list.push("Instagram Reels");
      if (p.includes("facebook")) list.push("Facebook");
      if (p.includes("twitter") || p.includes("x")) list.push("X (Twitter)");
      
      if (list.length === 0) {
        list.push(platformStr);
      }
    }
    return (
      <>
        {list.map((plat, idx) => (
          <span key={idx} className="text-[8.5px] font-bold font-mono text-cyan-400 bg-gray-950/85 border border-cyan-500/30 px-1.5 py-0.5 rounded shadow-sm">
            {plat}
          </span>
        ))}
      </>
    );
  };
  const [subSuccess, setSubSuccess] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/campaigns`);
      if (!res.ok) throw new Error("Failed to load active campaigns");
      const data = await res.json();
      setCampaigns(data);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleApply = (campaignId: string) => {
    if (!clipperProfile || clipperProfile.kycStatus !== "Verified") {
      setSubError("KYC Verification Required! You cannot apply/submit clips until your Aadhaar/PAN status is 'Verified' by the Administrator.");
      setSubmittingCampaignId(campaignId);
      return;
    }
    setSubError(null);
    setSubSuccess(null);
    setClipUrl("");
    setSubmittingCampaignId(campaignId);
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingCampaignId || !clipUrl) return;

    try {
      setSubmitting(true);
      setSubError(null);
      setSubSuccess(null);

      const res = await fetch(`${API_BASE}/api/campaigns/${submittingCampaignId}/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ submittedUrl: clipUrl })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to make clip submission");
      }

      setSubSuccess("Your clip has been successfully applied to the campaign. You can track its approval status under your Submissions dashboard tab!");
      setClipUrl("");
      setTimeout(() => {
        setSubmittingCampaignId(null);
        setSubSuccess(null);
      }, 3500);
    } catch (err: any) {
      setSubError(err?.message || "Could not submit your clip URL.");
    } finally {
      setSubmitting(false);
    }
  };

  // Process filters
  const filteredCampaigns = campaigns
    .filter(c => c.status === "Active")
    .filter(c => {
      const matchSearch = c.title.toLowerCase().includes(searchText.toLowerCase()) || 
                          c.instructions.toLowerCase().includes(searchText.toLowerCase()) ||
                          c.creatorName.toLowerCase().includes(searchText.toLowerCase());
      const matchPlatform = platformFilter === "all" || 
                            c.platform === "all" || 
                            c.platform === "both" ||
                            c.platform.toLowerCase().includes(platformFilter.toLowerCase()) ||
                            (platformFilter === "youtube" && c.platform.toLowerCase().includes("shorts")) ||
                            (platformFilter === "instagram" && c.platform.toLowerCase().includes("reels"));
      const cType = c.campaignType || "clipping";
      const matchType = typeFilter === "all" || 
                        cType === typeFilter || 
                        (typeFilter === "clipping" && (cType === "clipping" || cType === "both")) ||
                        (typeFilter === "ugc" && (cType === "ugc" || cType === "both"));
      return matchSearch && matchPlatform && matchType;
    })
    .sort((a, b) => {
      if (sortBy === "cpm-high") return b.cpm - a.cpm;
      if (sortBy === "budget") return (b.budget - b.spent) - (a.budget - a.spent);
      if (sortBy === "deadline") return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return 0;
    });

  return (
    <div className="space-y-8">
      {/* Campaign finder Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black font-display text-white">Active Clipping Campaigns</h2>
          <p className="text-gray-400 text-xs">Browse premium long-form campaigns currently funded and open for submissions.</p>
        </div>

        {/* KYC Notification badge for ease */}
        {clipperProfile && clipperProfile.kycStatus !== "Verified" && (
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-xl px-4 py-2.5 flex items-start space-x-2.5 max-w-sm">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-300">
              <span className="font-bold">KYC Action Pending</span>: Link your PAN/Aadhaar in your <strong className="cursor-pointer hover:underline text-white" onClick={() => setRoute("/dashboard/clipper/profile")}>Profile tab</strong> to pass fraud check before applying!
            </div>
          </div>
        )}
      </div>

      {/* Filtering Bar */}
      <div className="bg-[#111625] border border-gray-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
        {/* Search Search */}
        <div className="relative w-full md:w-auto md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search campaigns, instructions, niches, creators..." 
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full bg-[#181f33] border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap w-full md:w-auto items-center gap-3">
          {/* Platform Filtering */}
          <div className="flex items-center space-x-2 bg-[#181f33] border border-gray-800 px-3 py-1.5 rounded-xl text-xs text-gray-300">
            <span className="text-gray-500 font-mono">Platform:</span>
            <select 
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="bg-transparent font-medium text-white focus:outline-none"
            >
              <option value="all" className="bg-[#181f33]">All Platforms</option>
              <option value="youtube" className="bg-[#181f33]">YouTube Shorts</option>
              <option value="instagram" className="bg-[#181f33]">Instagram Reels</option>
              <option value="facebook" className="bg-[#181f33]">Facebook Reels</option>
              <option value="twitter" className="bg-[#181f33]">X (Twitter)</option>
            </select>
          </div>

          {/* Format Filtering */}
          <div className="flex items-center space-x-2 bg-[#181f33] border border-gray-800 px-3 py-1.5 rounded-xl text-xs text-gray-300">
            <span className="text-gray-500 font-mono">Format:</span>
            <select 
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-transparent font-medium text-white focus:outline-none"
            >
              <option value="all" className="bg-[#181f33]">All Formats</option>
              <option value="clipping" className="bg-[#181f33]">Clippers Only</option>
              <option value="ugc" className="bg-[#181f33]">UGC Only</option>
              <option value="both" className="bg-[#181f33]">Both (UGC & Clip)</option>
            </select>
          </div>

          {/* Sort Selection */}
          <div className="flex items-center space-x-2 bg-[#181f33] border border-gray-800 px-3 py-1.5 rounded-xl text-xs text-gray-300">
            <span className="text-gray-500 font-mono">Sort By:</span>
            <select 
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-transparent font-medium text-white focus:outline-none"
            >
              <option value="cpm-high" className="bg-[#181f33]">Highest CPM Rate</option>
              <option value="budget" className="bg-[#181f33]">Highest Budget</option>
              <option value="deadline" className="bg-[#181f33]">Closing Deadline</option>
            </select>
          </div>

          <button 
            onClick={() => { setSearchText(""); setPlatformFilter("all"); setSortBy("cpm-high"); }}
            className="text-[11px] font-semibold text-gray-400 hover:text-white px-2 py-1 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Campaigns Listing */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></div>
          <span className="text-xs text-gray-500 font-mono">Querying live campaigns...</span>
        </div>
      ) : error ? (
        <div className="bg-red-950/20 border border-red-900/60 p-6 rounded-2xl text-center space-y-2">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={fetchCampaigns} className="bg-red-900 text-white text-xs px-4 py-1.5 rounded-lg">Retry</button>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="bg-[#111625] border border-gray-800 py-16 text-center rounded-3xl space-y-3">
          <p className="text-xs text-gray-400">No active campaigns match your selected search criteria.</p>
          <span className="text-[11px] text-gray-600 block font-mono">Tip: Try removing active platform limits or search string.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map(camp => {
            const budgetRemaining = camp.budget - camp.spent;
            const percentageUsed = Math.min((camp.spent / camp.budget) * 100, 100);

            return (
              <div 
                key={camp.id}
                onClick={() => {
                  setSelectedCampaignForDetails(camp);
                  setEstimateViews("50000");
                }}
                className="bg-[#111625] border border-gray-800 hover:border-cyan-500/40 rounded-2xl p-5 flex flex-col justify-between hover:shadow-xl hover:-translate-y-0.5 transition-all group cursor-pointer"
              >
                {/* Creator Header */}
                <div className="space-y-3">
                  {/* Campaign thumbnail / picture banner */}
                  <div className="relative h-32 w-full rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                    <img 
                      src={camp.iconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&auto=format&fit=crop&q=80"} 
                      alt={camp.title} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent"></div>
                    
                    {/* Badges layered over banner */}
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[85%]">
                      {renderPlatformBadges(camp.platform)}
                      <span className="text-[8.5px] font-bold font-mono text-amber-400 bg-gray-950/85 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase shadow-sm">
                        {camp.campaignType === "both" ? "Both" : camp.campaignType === "ugc" ? "UGC" : "Clipers"}
                      </span>
                    </div>

                    <div className="absolute bottom-2 right-2 bg-gray-950/75 border border-gray-800 text-[9px] text-gray-300 font-mono px-1.5 py-0.5 rounded-md flex items-center space-x-1 shadow-sm">
                      <Clock className="w-2.5 h-2.5 text-cyan-400" />
                      <span>{camp.deadline}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold font-display text-white group-hover:text-cyan-400 transition-colors line-clamp-1 mt-1">{camp.title}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">By <strong className="text-gray-200 font-medium">{camp.creatorName}</strong></p>
                  </div>

                  {/* Budget Slider */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-gray-500">Left: ₹{budgetRemaining.toLocaleString("en-IN")}</span>
                      <span className="text-gray-400 font-bold font-semibold">Total: ₹{camp.budget.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="w-full h-1 bg-[#182033] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ width: `${percentageUsed}%` }}></div>
                    </div>
                  </div>

                  {/* CPM Card */}
                  <div className="grid grid-cols-2 gap-3 bg-[#171e2e] p-3 rounded-xl border border-gray-800/80 my-3">
                    <div className="text-center">
                      <span className="text-[9px] block text-gray-500 uppercase font-mono tracking-wider">CREATOR CPM</span>
                      <strong className="text-white text-sm font-black font-display">₹{camp.cpm}</strong>
                    </div>
                    <div className="text-center border-l border-gray-800">
                      <span className="text-[9px] block text-cyan-400 uppercase font-mono tracking-wider">YOU EARN (80%)</span>
                      <strong className="text-cyan-400 text-sm font-black font-display">₹{Math.floor(camp.cpm * 0.8)}</strong>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">Instructions (Click to expand):</p>
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed bg-[#141b2c] p-2 rounded-lg mt-1 border border-gray-800/40">{camp.instructions}</p>
                  </div>
                </div>

                {/* Submitting Actions */}
                <div className="pt-4 mt-4 border-t border-gray-800/80 flex items-center justify-between gap-3">
                  <div className="text-[10px] text-gray-500 font-mono font-medium">
                    Min Duration: <strong className="text-gray-300 font-bold">{camp.minDuration}s</strong>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCampaignForDetails(camp);
                        setEstimateViews("50000");
                      }}
                      className="bg-[#182030] hover:bg-[#1e273a] border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white text-[11px] font-bold font-mono px-2.5 py-1.5 rounded-lg transition-all"
                    >
                      Details
                    </button>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApply(camp.id);
                      }}
                      className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] text-[11px] font-bold font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all active:scale-95"
                    >
                      Submit Clip
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline submission modal overlay */}
      {submittingCampaignId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111625] border border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-gray-950 to-[#121c2d] p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display text-white">Apply & Submit Clip Link</h3>
                <p className="text-xs text-gray-400">Provide your public Short or Reel url to verify views.</p>
              </div>
              <button 
                onClick={() => setSubmittingCampaignId(null)}
                className="text-gray-400 hover:text-white font-bold px-3 py-1 bg-gray-900 rounded-lg text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {clipperProfile && clipperProfile.kycStatus === "Verified" ? (
                <form onSubmit={handleApplySubmit} className="space-y-4">
                  {subSuccess ? (
                    <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl space-y-2 text-center text-emerald-300">
                      <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 animate-bounce" />
                      <p className="text-xs font-medium">{subSuccess}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">PUBLIC CLIP LINK (INSTAGRAM REEL / YOUTUBE SHORT)</label>
                        <input 
                          type="url" 
                          required
                          value={clipUrl}
                          onChange={e => setClipUrl(e.target.value)}
                          placeholder="https://youtube.com/shorts/... OR https://instagram.com/reels/..."
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                        <span className="text-[10px] text-gray-500 block leading-tight">Must be a valid active public link. Our automated indexer fetches active stats every 24 hours. Limit 1 active submission per campaign.</span>
                      </div>

                      {subError && (
                        <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-400 font-medium">
                          {subError}
                        </div>
                      )}

                      <div className="flex justify-end gap-3 pt-2">
                        <button 
                          type="button"
                          onClick={() => setSubmittingCampaignId(null)}
                          className="bg-gray-800 hover:bg-gray-700 text-xs text-white px-4 py-2 rounded-xl"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          disabled={submitting}
                          className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] text-xs font-bold font-mono uppercase px-5 py-2 rounded-xl transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                        >
                          {submitting ? (
                            <>
                              <div className="w-3 h-3 border-2 border-[#0c0f17] border-t-transparent rounded-full animate-spin"></div>
                              <span>Verifying URL...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Submit Clip Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              ) : (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-12 h-12 bg-amber-950 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6 text-amber-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">KYC VERIFICATION REQUIRED</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                    Under QUOR fraud protection criteria, only editors who have uploaded standard legal identification documents and matched real settlement details can submit clips to campaigns.
                  </p>
                  <div className="p-3 bg-amber-950/20 border border-amber-900/50 rounded-xl text-amber-300 text-[10px] font-mono">
                    CURRENT STATE: {clipperProfile ? clipperProfile.kycStatus : "Unconfigured Profile"}
                  </div>
                  <div className="flex justify-center gap-3 pt-2">
                    <button 
                      onClick={() => setSubmittingCampaignId(null)}
                      className="bg-gray-800 hover:bg-gray-700 text-xs text-white px-4 py-2 rounded-xl"
                    >
                      Close Overlay
                    </button>
                    <button 
                      onClick={() => { setSubmittingCampaignId(null); setRoute("/dashboard/clipper/profile"); }}
                      className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] text-xs font-bold font-mono px-4 py-2 rounded-xl"
                    >
                      Go to Profile KYC
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Details Modal Overlay */}
      {selectedCampaignForDetails && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#111625] border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            {/* Modal Cover Image Banner */}
            <div className="relative h-44 w-full bg-gray-900 border-b border-gray-800">
              <img 
                src={selectedCampaignForDetails.iconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80"} 
                alt={selectedCampaignForDetails.title} 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111625] via-black/45 to-transparent"></div>
              
              <button 
                onClick={() => handleDownloadIcon(selectedCampaignForDetails.iconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80", selectedCampaignForDetails.title)}
                className="absolute top-4 left-4 text-cyan-400 hover:text-white font-bold px-3 py-1.5 bg-gray-900/85 hover:bg-[#122238] border border-cyan-500/25 backdrop-blur rounded-xl text-xs transition duration-200 cursor-pointer z-20 flex items-center space-x-1.5 shadow-md shadow-black/30"
                title="Download Campaign Icon"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Icon</span>
              </button>

              <button 
                onClick={() => setSelectedCampaignForDetails(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white font-bold p-2 bg-gray-900/85 hover:bg-gray-950 backdrop-blur rounded-full text-xs transition duration-200 cursor-pointer z-20"
              >
                ✕
              </button>

              {/* Badges */}
              <div className="absolute bottom-4 left-6 right-6 flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2">
                  {renderPlatformBadges(selectedCampaignForDetails.platform)}
                  <span className="text-[10px] font-bold font-mono text-amber-400 bg-gray-950/85 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase shadow-sm">
                    {selectedCampaignForDetails.campaignType === "both" ? "Both" : selectedCampaignForDetails.campaignType === "ugc" ? "UGC" : "Clipers"}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/35 px-2 py-0.5 rounded-md shadow-sm">
                  Active & Funded
                </span>
              </div>
            </div>

            {/* Modal Body Info */}
            <div className="p-6 md:p-8 space-y-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
              {/* Title & Creator */}
              <div className="border-b border-gray-800/60 pb-4">
                <h3 className="text-xl font-black font-display text-white leading-tight">{selectedCampaignForDetails.title}</h3>
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mt-2.5 text-xs text-gray-400">
                  <span className="flex items-center space-x-1">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Created by <strong className="text-gray-200 font-bold">{selectedCampaignForDetails.creatorName}</strong></span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Closing Date: <strong className="text-white font-semibold">{selectedCampaignForDetails.deadline}</strong></span>
                  </span>
                </div>
              </div>

              {/* Escrow Budget Metrics & Progress */}
              <div className="space-y-3 bg-[#161d2e]/45 border border-gray-800/80 rounded-2xl p-4.5 shadow-inner">
                <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">💰 ESCROW BUDGET STATUS & RATES</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-1">
                  <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                    <span className="text-[9px] text-gray-500 block font-mono">TOTAL ESCROWED</span>
                    <strong className="text-white text-base font-black font-display">₹{selectedCampaignForDetails.budget.toLocaleString("en-IN")}</strong>
                  </div>
                  <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-855">
                    <span className="text-[9px] text-gray-500 block font-mono font-medium">PAID OUT</span>
                    <strong className="text-emerald-400 text-base font-black font-display">₹{selectedCampaignForDetails.spent.toLocaleString("en-IN")}</strong>
                  </div>
                  <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-855">
                    <span className="text-[9px] text-gray-500 block font-mono">REMAINING POOL</span>
                    <strong className="text-cyan-400 text-base font-black font-display">₹{(selectedCampaignForDetails.budget - selectedCampaignForDetails.spent).toLocaleString("en-IN")}</strong>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>Pool exhaust rate</span>
                    <span className="text-cyan-400 font-bold">{Math.round((selectedCampaignForDetails.spent / selectedCampaignForDetails.budget) * 100)}% active</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#121824] border border-gray-850 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-500" 
                      style={{ width: `${Math.min((selectedCampaignForDetails.spent / selectedCampaignForDetails.budget) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Instructions and Description guidelines */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">📋 COMPLETE CREATIVE BRIEF & GUIDELINES</h4>
                <div className="bg-[#131926] border border-gray-850 rounded-2xl p-5 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedCampaignForDetails.instructions}
                </div>
              </div>

              {/* Source Target Material URL Link */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">🔗 SOURCE MATERIAL FOR CLIPPING</h4>
                <div className="bg-[#121824] border border-gray-850 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-mono bg-cyan-950/50 text-cyan-400 px-2 py-0.5 rounded border border-cyan-900/40 uppercase">High Definition Original Link</span>
                    <p className="text-[11px] text-gray-400 font-mono truncate max-w-full mt-1.5">{selectedCampaignForDetails.sourceVideoUrl}</p>
                  </div>
                  <a 
                    href={selectedCampaignForDetails.sourceVideoUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="bg-[#172133] hover:bg-cyan-500/10 hover:text-cyan-400 border border-gray-800 text-gray-200 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 flex items-center space-x-1.5 shrink-0 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Open Material</span>
                  </a>
                </div>
              </div>

              {/* Interactive Earnings Calculator */}
              <div className="space-y-3 bg-[#111625] border border-gray-800 hover:border-cyan-500/20 p-4.5 rounded-2xl transition duration-300 shadow">
                <div className="flex items-center space-x-2">
                  <Calculator className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">📊 INTERACTIVE CLIP EARNINGS ESTIMATOR</h4>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Estimate your revenue split! Under QUOR guidelines, you receive a direct 80% payout of this creator's campaign CPM pool.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-gray-400 uppercase">ANTICIPATED VIEWS</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        min="1"
                        step="1000"
                        value={estimateViews}
                        onChange={(e) => setEstimateViews(e.target.value)}
                        className="w-full bg-[#181f33] border border-gray-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none"
                        placeholder="e.g. 50000"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-gray-500 uppercase">VIEWS</span>
                    </div>
                  </div>

                  <div className="bg-[#1a253b]/50 p-3 rounded-xl border border-cyan-900/10 flex items-center justify-between">
                    <div>
                      <span className="text-[8.5px] font-mono text-cyan-400/85 block leading-none">YOUR PAYOUT (80%)</span>
                      <span className="text-gray-500 text-[8px] font-mono block mt-1 leading-none">After 20% commission</span>
                    </div>
                    <div className="text-right">
                      <strong className="text-white text-base font-black font-display font-mono block text-cyan-400">
                        ₹{Math.floor((Number(estimateViews || "0") / 1000) * selectedCampaignForDetails.cpm * 0.80).toLocaleString("en-IN")}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirement Details */}
              <div className="grid grid-cols-2 gap-3.5 text-xs pb-1">
                <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850 flex justify-between items-center">
                  <span className="text-gray-500 font-mono text-[9px] uppercase">Min Clip Count / Length</span>
                  <strong className="text-white font-bold font-display">{selectedCampaignForDetails.minDuration} seconds</strong>
                </div>
                <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850 flex justify-between items-center">
                  <span className="text-gray-500 font-mono text-[9px] uppercase">CPM Rate Pool</span>
                  <strong className="text-cyan-400 font-black font-display">₹{selectedCampaignForDetails.cpm} / 1K</strong>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="bg-gradient-to-r from-gray-950 to-[#121c2d] px-6 py-4.5 border-t border-gray-800 flex items-center justify-between flex-wrap gap-3">
              <span className="text-[10px] text-gray-500 font-mono max-w-[280px] leading-tight">
                Funds are dynamically escrowed with automated audit checks.
              </span>
              
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setSelectedCampaignForDetails(null)}
                  className="bg-gray-800 hover:bg-gray-750 border border-gray-700 text-xs text-white px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Close Brief
                </button>
                <button 
                  onClick={() => {
                    const campaignId = selectedCampaignForDetails.id;
                    setSelectedCampaignForDetails(null);
                    handleApply(campaignId);
                  }}
                  className="bg-cyan-500 hover:bg-cyan-400 text-gray-950 text-xs font-bold font-mono uppercase tracking-wider px-5 py-2 rounded-xl transition duration-200 cursor-pointer"
                >
                  Apply & Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
