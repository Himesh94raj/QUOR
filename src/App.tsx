import React, { useState, useEffect } from "react";
import { 
  User, ClipperProfile, CreatorProfile, Campaign, Submission, 
  WalletTransaction, PayoutRequest, UserRole, KYCStatus, CampaignStatus, CampaignPlatform 
} from "./types";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { AboutView } from "./components/AboutView";
import { ContactView } from "./components/ContactView";
import { LegalView } from "./components/LegalView";
import { CampaignFinder } from "./components/CampaignFinder";
import { ReviewSubmissions } from "./components/ReviewSubmissions";
import { WithdrawModal } from "./components/WithdrawModal";
import { API_BASE } from "./config";

import { 
  Film, Award, Users, CheckSquare, Wallet, Play, Plus, Clock, Eye, Sparkles, 
  Trash2, RefreshCw, AlertCircle, CheckCircle, ArrowRight, ShieldCheck, 
  ChevronRight, ArrowUpRight, Ban, EyeOff, Check, XCircle
} from "lucide-react";

export default function App() {
  // Session States
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [clipperProfile, setClipperProfile] = useState<ClipperProfile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  
  // App routing
  const [currentRoute, setCurrentRoute] = useState<string>("/");

  // Shared statistics on Landing page
  const [platformStats, setPlatformStats] = useState<any>(null);

  // Global Toast Alert
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Deposit funding modal state
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [depositAmount, setDepositAmount] = useState<string>("5000");
  const [depositing, setDepositing] = useState<boolean>(false);

  const getPlatformLabel = (platformStr: string) => {
    if (!platformStr) return "All Platforms";
    const p = platformStr.toLowerCase();
    if (p === "both") return "YouTube Shorts & Instagram Reels";
    if (p === "all") return "YouTube, Instagram, Facebook, X (Twitter)";
    
    const selected: string[] = [];
    if (p.includes("youtube") || p.includes("shorts")) selected.push("YouTube Shorts");
    if (p.includes("instagram") || p.includes("reels")) selected.push("Instagram Reels");
    if (p.includes("facebook")) selected.push("Facebook");
    if (p.includes("twitter") || p.includes("x")) selected.push("X (Twitter)");
    
    if (selected.length === 0) return platformStr;
    return selected.join(" & ");
  };

  const getPlatformBadgeText = (platformStr: string) => {
    if (!platformStr) return "All Platforms";
    const p = platformStr.toLowerCase();
    if (p === "both") return "YouTube & IG";
    if (p === "all") return "All Platforms";
    
    const selected: string[] = [];
    if (p.includes("youtube") || p.includes("shorts")) selected.push("YouTube");
    if (p.includes("instagram") || p.includes("reels")) selected.push("IG");
    if (p.includes("facebook")) selected.push("Facebook");
    if (p.includes("twitter") || p.includes("x")) selected.push("X (Twitter)");
    
    if (selected.length === 0) return platformStr;
    return selected.join(", ");
  };

  // Creator campaign creation state
  const [campTitle, setCampTitle] = useState("");
  const [campVideoUrl, setCampVideoUrl] = useState("");
  const [campCpm, setCampCpm] = useState("200");
  const [campBudget, setCampBudget] = useState("5000");
  const [campInstructions, setCampInstructions] = useState("");
  const [campPlatform, setCampPlatform] = useState<CampaignPlatform>("both");
  const [campMinDuration, setCampMinDuration] = useState("15");
  const [campDeadline, setCampDeadline] = useState("2026-07-31");
  const [campLoading, setCampLoading] = useState(false);
  const [campIconUrl, setCampIconUrl] = useState("https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&auto=format&fit=crop&q=80");
  const [campContentType, setCampContentType] = useState<"clipping" | "ugc" | "both">("clipping");
  const [customFileStatus, setCustomFileStatus] = useState("");

  // Active Selected Campaign detail (Creator view)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignSubmissions, setCampaignSubmissions] = useState<Submission[]>([]);

  // Clipper Dynamic Analytics & submission trackers
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [myWithdrawals, setMyWithdrawals] = useState<PayoutRequest[]>([]);
  const [walletTxLogs, setWalletTxLogs] = useState<WalletTransaction[]>([]);

  // Profile forms
  const [clipperUpi, setClipperUpi] = useState("");
  const [clipperInsta, setClipperInsta] = useState("");
  const [clipperYt, setClipperYt] = useState("");
  const [clipperAadhaar, setClipperAadhaar] = useState("");
  const [clipperPan, setClipperPan] = useState("");
  const [clipperDocUrl, setClipperDocUrl] = useState("https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500&auto=format&fit=crop&q=60");
  const [clipperUpdating, setClipperUpdating] = useState(false);

  const [creatorChannel, setCreatorChannel] = useState("");
  const [creatorUpdating, setCreatorUpdating] = useState(false);

  // Admin Master State List
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminCampaigns, setAdminCampaigns] = useState<Campaign[]>([]);
  const [adminSubmissions, setAdminSubmissions] = useState<Submission[]>([]);
  const [adminPayoutList, setAdminPayoutList] = useState<PayoutRequest[]>([]);
  const [adminKycProfiles, setAdminKycProfiles] = useState<Record<string, ClipperProfile>>({});
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
  const [suspendStatus, setSuspendStatus] = useState<"active" | "suspended" | "banned">("suspended");
  const [suspendDuration, setSuspendDuration] = useState<string>("7");
  const [suspendReason, setSuspendReason] = useState<string>("");

  useEffect(() => {
    if (selectedUserForDetails) {
      setSuspendStatus(selectedUserForDetails.status === "banned" ? "banned" : selectedUserForDetails.status === "suspended" ? "suspended" : "active");
      setSuspendReason(selectedUserForDetails.statusReason || "");
      setSuspendDuration("7");
    }
  }, [selectedUserForDetails]);

  // Sync session metrics from browser LocalStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("quor_user");
    const savedToken = localStorage.getItem("quor_token");
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setAuthToken(savedToken);
    }
    fetchPlatformStats();

    // Listen to hash address transformations
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1) || "/";
      setCurrentRoute(hash);
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Whenever user session triggers, cache and preload profiles
  useEffect(() => {
    if (user) {
      localStorage.setItem("quor_user", JSON.stringify(user));
      localStorage.setItem("quor_token", user.id);
      setAuthToken(user.id);
      loadUserProfile();
      
      // Auto routing deep locks
      if (currentRoute === "/auth/login" || currentRoute === "/auth/signup") {
        if (user.role === "admin" && user.isOwnerAdmin) setRoute("/admin");
        else if (user.role === "creator") setRoute("/dashboard/creator");
        else setRoute("/dashboard/clipper");
      }
    } else {
      localStorage.removeItem("quor_user");
      localStorage.removeItem("quor_token");
      setAuthToken("");
      setClipperProfile(null);
      setCreatorProfile(null);
    }
  }, [user]);

  // Admin Route Security Guard
  useEffect(() => {
    if (currentRoute.startsWith("/admin")) {
      if (!user) {
        showToast("Please log in first to access the administrator panel.", "error");
        setRoute("/");
      } else if (user.role !== "admin" || !user.isOwnerAdmin) {
        showToast("Access Denied. Only the designated Owner Administrator can access the Admin Dashboard.", "error");
        setRoute("/");
      }
    }
  }, [currentRoute, user]);

  // Hook into Route state changes explicitly to sync view panels
  const setRoute = (path: string) => {
    window.location.hash = path;
    setCurrentRoute(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const fetchPlatformStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/platform/stats`);
      if (res.ok) {
        const stats = await res.json();
        setPlatformStats(stats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;
    try {
      if (user.role === "clipper") {
        const res = await fetch(`${API_BASE}/api/clipper/profile`, {
          headers: { Authorization: `Bearer ${user.id}` }
        });
        if (res.ok) {
          const data = await res.json();
          setClipperProfile(data.profile);
          // Set inputs
          setClipperUpi(data.profile.upiId || "");
          setClipperInsta(data.profile.instagramHandle || "");
          setClipperYt(data.profile.youtubeHandle || "");
          setClipperAadhaar(data.profile.kycAadhaar || "");
          setClipperPan(data.profile.kycPan || "");
          setClipperDocUrl(data.profile.kycDocUrl || "");
        }
        fetchClipperStats();
      } else if (user.role === "creator") {
        const res = await fetch(`${API_BASE}/api/creator/profile`, {
          headers: { Authorization: `Bearer ${user.id}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCreatorProfile(data.profile);
          setCreatorChannel(data.profile.channelUrl || "");
        }
        fetchCreatorCampaigns();
      } else if (user.role === "admin") {
        loadAdminQueue();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Clipper Stats fetcher
  const fetchClipperStats = async () => {
    if (!user || user.role !== "clipper") return;
    try {
      // Get my submissions
      const subRes = await fetch(`${API_BASE}/api/submissions/my`, {
        headers: { Authorization: `Bearer ${user.id}` }
      });
      if (subRes.ok) {
        const subs = await subRes.json();
        setMySubmissions(subs);
      }

      // Get payouts
      const payRes = await fetch(`${API_BASE}/api/clipper/payouts`, {
        headers: { Authorization: `Bearer ${user.id}` }
      });
      if (payRes.ok) {
        const pays = await payRes.json();
        setMyWithdrawals(pays);
      }

      // Get transaction history
      const txRes = await fetch(`${API_BASE}/api/wallet/history`, {
        headers: { Authorization: `Bearer ${user.id}` }
      });
      if (txRes.ok) {
        const txs = await txRes.json();
        setWalletTxLogs(txs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Creator Stats fetcher
  const [creatorCampaigns, setCreatorCampaigns] = useState<Campaign[]>([]);
  const fetchCreatorCampaigns = async () => {
    if (!user || user.role !== "creator") return;
    try {
      const res = await fetch(`${API_BASE}/api/campaigns`);
      if (res.ok) {
        const list: Campaign[] = await res.json();
        setCreatorCampaigns(list.filter(c => c.creatorId === user.id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // View individual creator campaign details
  const viewCampaignDetail = async (camp: Campaign) => {
    try {
      setSelectedCampaign(camp);
      const res = await fetch(`${API_BASE}/api/campaigns/${camp.id}/submissions`, {
        headers: { Authorization: `Bearer ${user?.id}` }
      });
      if (res.ok) {
        setCampaignSubmissions(await res.json());
      }
      setRoute(`/dashboard/creator/campaigns/${camp.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  // Deposit simulation trigger
  const handleDepositFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== "creator") return;
    try {
      setDepositing(true);
      const res = await fetch(`${API_BASE}/api/creator/wallet/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.id}`
        },
        body: JSON.stringify({ amount: Number(depositAmount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deposit failed");
      
      setCreatorProfile(prev => prev ? { ...prev, walletBalance: data.balance } : null);
      showToast(`Success! Deposited ₹${depositAmount} securely into escrow wallet.`, "success");
      setShowDepositModal(false);
      fetchPlatformStats();
    } catch (err: any) {
      showToast(err?.message || "Deposit transaction rejected.", "error");
    } finally {
      setDepositing(false);
    }
  };

  // Launch fresh Campaign creator form
  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== "creator") return;
    try {
      setCampLoading(true);
      const res = await fetch(`${API_BASE}/api/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.id}`
        },
        body: JSON.stringify({
          title: campTitle,
          sourceVideoUrl: campVideoUrl,
          cpm: Number(campCpm),
          budget: Number(campBudget),
          instructions: campInstructions,
          platform: campPlatform,
          minDuration: Number(campMinDuration),
          deadline: campDeadline,
          iconUrl: campIconUrl,
          campaignType: campContentType
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Campaign launch failed");

      showToast("Campaign launched! Budget has been safely locked in platform escrow.", "success");
      
      // Reset campaign form inputs
      setCampTitle("");
      setCampVideoUrl("");
      setCampInstructions("");
      setCampIconUrl("https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&auto=format&fit=crop&q=80");
      setCampContentType("clipping");
      
      loadUserProfile(); // refresh creator wallet balance
      setRoute("/dashboard/creator/campaigns");
      fetchPlatformStats();
    } catch (err: any) {
      showToast(err?.message || "Launch failed.", "error");
    } finally {
      setCampLoading(false);
    }
  };



  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCustomFileStatus(`Analyzing: ${file.name} (${Math.round(file.size / 1024)} KB)...`);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCampIconUrl(event.target.result as string);
        setCustomFileStatus(`Uploaded file: ${file.name}`);
        showToast("System file loaded successfully!", "success");
      }
    };
    reader.onerror = () => {
      setCustomFileStatus("Failed to process attachment.");
      showToast("File upload failed.", "error");
    };
    reader.readAsDataURL(file);
  };

  // Delete/Pause Creator Campaign
  const handleDeleteCampaign = async (campId: string) => {
    if (!window.confirm("Are you sure you want to stop and delete this campaign? Unused escrow funds will be refunded into your creator wallet.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user?.id}` }
      });
      if (res.ok) {
        showToast("Campaign closed. Unspent escrow refunded to your profile balance.", "success");
        loadUserProfile();
        fetchCreatorCampaigns();
        setRoute("/dashboard/creator/campaigns");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Approve/Reject Submission from Clipper (Clipper submission review)
  const handleReviewSubmission = async (submissionId: string, status: "Approved" | "Rejected", feedback: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/submissions/${submissionId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({ status, feedback })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review submission failed");

      showToast(`Submission has been successfully ${status}!`, "success");
      
      // Update local state arrays
      setCampaignSubmissions(prev => 
        prev.map(s => s.id === submissionId ? { ...s, status, feedback, approvedAt: new Date().toISOString() } : s)
      );
      fetchPlatformStats();
    } catch (err: any) {
      showToast(err?.message || "Review action failed.", "error");
    }
  };

  // Clipper profile, UPI, KYC submission
  const handleUpdateClipperProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setClipperUpdating(true);
      const res = await fetch(`${API_BASE}/api/clipper/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({
          upiId: clipperUpi,
          instagramHandle: clipperInsta,
          youtubeHandle: clipperYt,
          kycAadhaar: clipperAadhaar,
          kycPan: clipperPan,
          kycDocUrl: clipperDocUrl
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setClipperProfile(data.profile);
      showToast("Profile metrics logged. KYC submitted for Admin evaluation.", "success");
      fetchPlatformStats();
    } catch (err: any) {
      showToast(err?.message || "Could not log clipper details.", "error");
    } finally {
      setClipperUpdating(false);
    }
  };

  // Creator channel update
  const handleUpdateCreatorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatorUpdating(true);
      const res = await fetch(`${API_BASE}/api/creator/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({ channelUrl: creatorChannel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreatorProfile(data.profile);
      showToast("Creator channel link verified.", "success");
    } catch (err: any) {
      showToast(err?.message || "Could not save details.", "error");
    } finally {
      setCreatorUpdating(false);
    }
  };

  // ADMIN QUEUE LOADING
  const loadAdminQueue = async () => {
    if (!user || user.role !== "admin") return;
    try {
      setAdminLoading(true);
      // Stats
      fetchPlatformStats();

      // Users
      const usersRes = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${user.id}` }
      });
      if (usersRes.ok) setAdminUsers(await usersRes.json());

      // Campaigns (All)
      const campRes = await fetch(`${API_BASE}/api/campaigns`);
      if (campRes.ok) setAdminCampaigns(await campRes.json());

      // Payout Requests
      const payRes = await fetch(`${API_BASE}/api/clipper/payouts`, {
        headers: { Authorization: `Bearer ${user.id}` }
      });
      if (payRes.ok) setAdminPayoutList(await payRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setAdminLoading(false);
    }
  };

  // Admin: Approve/Reject KYC profile
  const handleAdminKycAction = async (userId: string, status: KYCStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showToast(`Clipper KYC verification marked as ${status}.`, "success");
        loadAdminQueue();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Admin: Process/Settle Clipper Payout
  const handleAdminPayoutAction = async (payoutId: string, status: "Completed" | "Failed") => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/payouts/${payoutId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showToast(`UPI Payout request status updated to: ${status}`, "success");
        loadAdminQueue();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [updatingUserStatus, setUpdatingUserStatus] = useState<boolean>(false);
  const handleUpdateUserStatus = async (userId: string, newStatus: "active" | "suspended" | "banned", durationDays: string | number, reason: string) => {
    try {
      setUpdatingUserStatus(true);
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.id}`
        },
        body: JSON.stringify({ status: newStatus, durationDays, reason })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to update user status", "error");
        return;
      }
      showToast(data.message || "User status updated successfully!", "success");
      loadAdminQueue();
      if (selectedUserForDetails && selectedUserForDetails.id === userId) {
        setSelectedUserForDetails({
          ...selectedUserForDetails,
          status: newStatus === "active" ? "active" : (durationDays === "permanent" ? "banned" : newStatus),
          statusReason: reason,
          statusUntil: newStatus === "suspended" && durationDays !== "permanent" 
            ? new Date(Date.now() + Number(durationDays) * 86400000).toISOString() 
            : null
        });
      }
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    } finally {
      setUpdatingUserStatus(false);
    }
  };

  // CRON VIEWS RUNNER SIMULATOR (extremely interactive)
  const triggerSimulateCronViews = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cron/track-views`, { method: "POST" });
      const data = await res.json();
      showToast(`Dynamic Views Tracker: ${data.message} ${data.updatedClipsCount > 0 ? `Registered new views split across ${data.updatedClipsCount} clips!` : 'Pending active verified submissions.'}`, "success");
      
      // Reload stats
      fetchPlatformStats();
      if (user?.role === "clipper") fetchClipperStats();
      if (user?.role === "creator") {
        fetchCreatorCampaigns();
        if (selectedCampaign) {
          viewCampaignDetail(selectedCampaign);
        }
      }
    } catch (e) {
      showToast("View tracking simulation error.", "error");
    }
  };

  // Simple Auth Handlers
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPass, setSignupPass] = useState("");
  const [signupRole, setSignupRole] = useState<UserRole>("clipper");
  const [signupErr, setSignupErr] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginErr("");
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login Failed");
      
      setUser(data);
      showToast(`Welcome back, ${data.name}!`, "success");
    } catch (error: any) {
      setLoginErr(error?.message || "Invalid credentials.");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSignupErr("");
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: signupName, 
          email: signupEmail, 
          password: signupPass, 
          role: signupRole 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup Failed");
      
      // Auto login
      setUser({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: new Date().toISOString()
      });
      showToast("Registration successful!", "success");
    } catch (error: any) {
      setSignupErr(error?.message || "Could not register account.");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setRoute("/");
    showToast("Signed out successfully.", "success");
  };

  // Helper to extract clean youtube embed URL from long form link
  const makeEmbedUrl = (url: string) => {
    const youtubeMatch = url.match(/(?:shorts\/|v=)([^&?/]+)/);
    if (youtubeMatch && youtubeMatch[1]) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    return "";
  };

  // CALCULATE CLIPPER BALANCES
  const clipperApprovedSubs = mySubmissions.filter(s => s.status === "Approved");
  let totalClipperEarned = 0;
  clipperApprovedSubs.forEach(sub => {
    // We fetch related campaign CPM dynamically or mock 200 base
    totalClipperEarned += (sub.views / 1000) * (200 * 0.8); // fallback ₹160 net CPM if no campaign mapped
  });
  const totalClipperWithdrawn = myWithdrawals.filter(p => p.status === "Completed").reduce((sum, p) => sum + p.amount, 0);
  const clipperPendingWithdrawing = myWithdrawals.filter(p => p.status === "Processing").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="min-h-screen bg-[#080b13] flex flex-col justify-between">
      {/* Toast Alert Header */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[100] p-4 rounded-2xl flex items-center space-x-3 shadow-2xl transition-all animate-slide-up border ${
          toast.type === "success" 
            ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300" 
            : "bg-rose-950/90 border-rose-500/30 text-rose-300"
        }`}>
          {toast.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Primary Navigation bar */}
      <Navbar 
        user={user} 
        creatorProfile={creatorProfile}
        currentRoute={currentRoute} 
        setRoute={setRoute} 
        onLogout={handleLogout}
        onOpenDeposit={() => setShowDepositModal(true)}
      />


      {/* MAIN LAYOUT GATEWAY */}
      <main className="flex-grow py-8 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ROUTE 1: Landing Page */}
        {currentRoute === "/" && (
          <div className="space-y-24 py-6">
            {/* Landing Hero Column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center space-x-2 bg-[#121a30] border border-cyan-500/20 px-3.5 py-1.5 rounded-full">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-bold text-cyan-300 tracking-wider uppercase font-mono">Bypass Traditional agencies</span>
                </div>

                <h1 className="text-4xl sm:text-6xl font-black font-display text-white leading-tight">
                  Clip videos.<br />
                  <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-indigo-600 bg-clip-text text-transparent">Get paid per view.</span>
                </h1>

                <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-xl">
                  QUOR connects video creators and brands with viral clippers and ugc creators. Turn your low performing marketing into viral senstation all over the social media. Get paid in standard CPM models verified via automated API check logs.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button 
                    onClick={() => setRoute("/auth/signup")}
                    className="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 text-white font-bold text-xs sm:text-sm px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-cyan-500/10 flex items-center space-x-2"
                  >
                    <span>Get Started as Clipper</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setRoute("/auth/signup")}
                    className="bg-[#172033] hover:bg-[#202c46] border border-gray-800 text-white font-bold text-xs sm:text-sm px-6 py-3.5 rounded-xl transition-all"
                  >
                    Hire Clippers
                  </button>
                </div>

                {/* Micro social proofs */}
                <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-900 font-mono text-[11px] text-gray-500">
                  <div>
                    <strong className="text-white text-base block font-sans font-black">₹{platformStats ? platformStats.totalSpend.toLocaleString("en-IN") : "₹3,42,000"}</strong>
                    Volume Disbursed
                  </div>
                  <div>
                    <strong className="text-white text-base block font-sans font-black">{(platformStats ? platformStats.totalViews : 1420102).toLocaleString()}</strong>
                    Total Organic Views
                  </div>
                  <div>
                    <strong className="text-white text-base block font-sans font-black">80% Split</strong>
                    Net Edit Commission
                  </div>
                </div>
              </div>

              {/* Graphical representation mock */}
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl blur-3xl"></div>
                <div className="relative bg-[#101524] border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-3.5 h-3.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-mono font-bold text-gray-400">QUOR_MATCHER_SYS v1.1</span>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono">LIVE ENGAGEMENT LEDGER</span>
                  </div>

                  {/* Simulated campaign cards */}
                  <div className="space-y-4">
                    <div className="bg-[#182035] border border-cyan-500/30 rounded-2xl p-4 flex items-center justify-between">
                      <div className="space-y-1 max-w-[200px]">
                        <span className="text-[9px] font-bold text-cyan-400 uppercase font-mono">Apna College Hook Tutorial</span>
                        <h4 className="text-xs font-bold text-white truncate">React 19 ActionStates Tutorial Clips</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 block">CPM Split</span>
                        <strong className="text-emerald-400 text-sm font-black font-mono">₹160/1k</strong>
                      </div>
                    </div>

                    <div className="bg-[#131929] border border-gray-850 rounded-2xl p-4 flex items-center justify-between opacity-80">
                      <div className="space-y-1 max-w-[200px]">
                        <span className="text-[9px] font-bold text-gray-400 uppercase font-mono">Hassan Tech Show</span>
                        <h4 className="text-xs font-bold text-white truncate">Ultimate 2026 AI Roadmap Video Clips</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 block">CPM Split</span>
                        <strong className="text-emerald-400 text-sm font-black font-mono">₹200/1k</strong>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0b0e18] p-4 rounded-xl text-center border border-gray-900/60 font-mono text-[11px] text-gray-500">
                    💡 View Tracking automations queries directly verify views count to payout UPI instantly.
                  </div>
                </div>
              </div>
            </div>

            {/* Platform USP Bento Grid */}
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-white">How it Works</h2>
                <p className="text-gray-400 max-w-sm mx-auto text-xs">A two-sided marketplace designed to bridge brands with clippers .</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-cyan-500/20 transition-all space-y-4">
                  <div className="w-10 h-10 bg-cyan-950 rounded-xl flex items-center justify-center text-cyan-400">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">1. Creators Set Active Budgets</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Creators place there contents and brands links and define guidelines alongside target CPM rewards. Budgets are lock guaranteed in escrow upfront of campaign launch.
                  </p>
                </div>

                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/20 transition-all space-y-4">
                  <div className="w-10 h-10 bg-indigo-950 rounded-xl flex items-center justify-center text-indigo-400">
                    <Film className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">2. Clippers Edit & Post</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Clipper editors apply edit cuts, add engaging subtitles and tags, post them on IG Reels or YouTube ,X,facebook and submit public URLs to track.
                  </p>
                </div>

                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 hover:border-purple-500/20 transition-all space-y-4">
                  <div className="w-10 h-10 bg-purple-950 rounded-xl flex items-center justify-center text-purple-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">3. Automate UPI payouts</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Once approved, view statistics fetch counts directly. Every block of 1000 views translates into instant ledger cash redeemable straight to UPI address.
                  </p>
                </div>
              </div>
            </div>

            {/* Testimonials */}
            <div className="space-y-8">
              <h3 className="text-xl sm:text-2xl font-black font-display text-center text-white">Used by India's Top Creators & Editors</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-[#111625] p-5 rounded-2xl border border-gray-800 space-y-4">
                  <p className="text-xs text-gray-300 italic leading-relaxed">
                    "Managing a group of 15 editors was a bookkeeping nightmare. With QUOR's locked campaign escrow budget, I only pay when clips generate real views. My Shorts have grown 3x!"
                  </p>
                  <div>
                    <strong className="text-xs text-white block">Aditya Sanyal</strong>
                    <span className="text-[10px] text-gray-500">Tech & Design Youtuber (180k subs)</span>
                  </div>
                </div>

                <div className="bg-[#111625] p-5 rounded-2xl border border-gray-800 space-y-4">
                  <p className="text-xs text-gray-300 italic leading-relaxed">
                    "As a student editor, QUOR is a literal lifesaver. I get access to clean clips of premium channels without copyright claims. Earned ₹4,500 in my very first week!"
                  </p>
                  <div>
                    <strong className="text-xs text-white block">Siddharth Deshmukh</strong>
                    <span className="text-[10px] text-gray-500">Freelance Video Editor, Pune</span>
                  </div>
                </div>

                <div className="bg-[#111625] p-5 rounded-2xl border border-gray-800 space-y-4">
                  <p className="text-xs text-gray-300 italic leading-relaxed">
                    "The Aadhaar and real UPI requirement keeps bots completely out. Everything is incredibly honest and tracking view velocity matches active analytics properly."
                  </p>
                  <div>
                    <strong className="text-xs text-white block">Tanvi Shah</strong>
                    <span className="text-[10px] text-gray-500">FinTech Content Creator</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQS */}
            <div className="max-w-4xl mx-auto space-y-6">
              <h3 className="text-xl sm:text-2xl font-black font-display text-center text-white">Frequently Asked Questions</h3>
              <div className="space-y-4 bg-[#111625] p-6 sm:p-8 rounded-3xl border border-gray-800">
                <div className="space-y-1.5 border-b border-gray-800 pb-4">
                  <h4 className="text-xs sm:text-sm font-bold text-white">Is QUOR's view tracking process secure?</h4>
                  <p className="text-xs text-gray-400">Yes. We verify public links using matching YouTube Data API v3 and Instagram Graph statistics. We verify actual organic additions during regular ticks.</p>
                </div>
                <div className="space-y-1.5 border-b border-gray-800 pb-4 pt-2">
                  <h4 className="text-xs sm:text-sm font-bold text-white">What is the minimum withdrawal amount for clippers?</h4>
                  <p className="text-xs text-gray-400">Clippers can request settled withdraw to their saved PhonePe/GPay handles once available cash balance passes ₹500.</p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <h4 className="text-xs sm:text-sm font-bold text-white">Does QUOR collect high setup fees?</h4>
                  <p className="text-xs text-gray-400">No. Creators launch campaigns completely for free. The platform only takes exactly a 20% platform share only upon actual view payout disbursements.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 2: About Page */}
        {currentRoute === "/about" && <AboutView />}

        {/* ROUTE 3: Contact */}
        {currentRoute === "/contact" && <ContactView />}

        {/* ROUTE 4: Legal */}
        {currentRoute === "/legal" && <LegalView />}

        {/* ROUTE 5: Login */}
        {currentRoute === "/auth/login" && (
          <div className="max-w-md mx-auto py-12 space-y-6">
            <div className="bg-[#111625] border border-gray-800 rounded-3xl p-8 space-y-6 shadow-2xl">
              <div className="space-y-2 text-center">
                <h2 className="text-2xl font-bold font-display text-white">Welcome back to QUOR</h2>
                <p className="text-xs text-gray-400">Enter your credentials to enter your clipping dashboard hub.</p>
              </div>

              {loginErr && (
                <div className="p-3.5 bg-rose-950/20 border border-rose-900/60 rounded-xl text-xs text-rose-400 font-semibold leading-normal">
                  {loginErr}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">Email address</label>
                  <input 
                    type="email" 
                    required
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">Password Secure PIN</label>
                  <input 
                    type="password" 
                    required
                    value={loginPass}
                    onChange={e => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                >
                  Log In
                </button>
              </form>

              <div className="border-t border-gray-900 pt-4 text-center text-xs text-gray-500">
                Don't have an active account?{" "}
                <button 
                  onClick={() => setRoute("/auth/signup")}
                  className="text-cyan-400 hover:underline hover:text-cyan-300 font-semibold cursor-pointer"
                >
                  Create free Account
                </button>
              </div>
            </div>

            {/* Fast Seed login helpers */}
            <div className="bg-[#172033]/60 p-4 rounded-2xl border border-gray-800 text-xs space-y-3">
              <p className="font-bold text-white font-mono text-[10px] uppercase">⚡ FAST PRE-LOADED LOGIN TEST SEEDS:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-400">
                <div 
                  onClick={() => { setLoginEmail("samir@editor.com"); setLoginPass("password123"); }}
                  className="p-2 bg-[#0c0f17] rounded-xl border border-gray-850 hover:border-cyan-500/40 cursor-pointer text-left"
                >
                  <strong className="text-cyan-400 block text-[10px] uppercase font-mono">1. LOGIN AS CLIPPER Samir</strong>
                  Email: <span className="text-white">samir@editor.com</span><br/>
                  Pass: <span className="text-white">password123</span>
                </div>
                
                <div 
                  onClick={() => { setLoginEmail("hassan@tech.io"); setLoginPass("password123"); }}
                  className="p-2 bg-[#0c0f17] rounded-xl border border-gray-850 hover:border-cyan-500/40 cursor-pointer text-left"
                >
                  <strong className="text-indigo-400 block text-[10px] uppercase font-mono">2. LOGIN AS CREATOR Hassan</strong>
                  Email: <span className="text-white">hassan@tech.io</span><br/>
                  Pass: <span className="text-white">password123</span>
                </div>

                <div 
                  onClick={() => { setLoginEmail(""); setLoginPass(""); }}
                  className="p-2 bg-[#0c0f17] rounded-xl border border-gray-850 hover:border-cyan-500/40 cursor-pointer text-left sm:col-span-2"
                >
                  <strong className="text-red-400 block text-[10px] uppercase font-mono">3. LOGIN AS QUOR ADMIN</strong>
                  Email: <span className="text-white">Configured OWNER_EMAIL</span><br/>
                  Pass: <span className="text-white">password123 (or admin)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 6: Sign Up */}
        {currentRoute === "/auth/signup" && (
          <div className="max-w-md mx-auto py-12">
            <div className="bg-[#111625] border border-gray-800 rounded-3xl p-8 space-y-6 shadow-2xl">
              <div className="space-y-2 text-center">
                <h2 className="text-2xl font-bold font-display text-white">Create QUOR Account</h2>
                <p className="text-xs text-gray-400">Choose your appropriate role and link details.</p>
              </div>

              {signupErr && (
                <div className="p-3.5 bg-rose-950/20 border border-rose-900/60 rounded-xl text-xs text-rose-400 font-semibold leading-normal">
                  {signupErr}
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                {/* Role Switch */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">I AM REGISTERING AS:</label>
                  <div className="grid grid-cols-2 gap-3 p-1 bg-[#181f33] rounded-xl border border-gray-850">
                    <button
                      type="button"
                      onClick={() => setSignupRole("clipper")}
                      className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                        signupRole === "clipper" ? "bg-cyan-500 text-[#0c0f17]" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      I am a Clipper (Editor)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole("creator")}
                      className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                        signupRole === "creator" ? "bg-cyan-500 text-[#0c0f17]" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      I am a Creator (Channel)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">Full Legal Name</label>
                  <input 
                    type="text" 
                    required
                    value={signupName}
                    onChange={e => setSignupName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">Email API address</label>
                  <input 
                    type="email" 
                    required
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">Create Password Secure PIN</label>
                  <input 
                    type="password" 
                    required
                    value={signupPass}
                    onChange={e => setSignupPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                >
                  Join QUOR Marketplace
                </button>
              </form>

              <div className="border-t border-gray-900 pt-4 text-center text-xs text-gray-500">
                Already registered?{" "}
                <button 
                  onClick={() => setRoute("/auth/login")}
                  className="text-cyan-400 hover:underline hover:text-cyan-300 font-semibold cursor-pointer"
                >
                  Sign In instead
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 7: PROTECTED - Clipper Dashboard Home */}
        {currentRoute.startsWith("/dashboard/clipper") && user?.role === "clipper" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar navigation tabs */}
            <div className="space-y-3">
              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-4 text-center space-y-3">
                <div className="w-12 h-12 bg-gradient-to-tr from-cyan-400 to-indigo-500 rounded-full mx-auto flex items-center justify-center font-bold font-display text-white text-base">
                  {user.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{user.name}</h4>
                  <span className="text-[10px] font-mono text-gray-500 block">ROLE: CLIPPER CHANNELS</span>
                </div>

                {clipperProfile && (
                  <div className={`text-[10px] font-bold uppercase py-1 rounded-md text-center font-mono ${
                    clipperProfile.kycStatus === "Verified" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30" : "bg-amber-950/40 text-amber-400 border border-amber-900/30"
                  }`}>
                    KYC: {clipperProfile.kycStatus}
                  </div>
                )}
              </div>

              {/* Sidebar Tabs */}
              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-2.5 flex flex-col space-y-1 text-xs">
                <button 
                  onClick={() => setRoute("/dashboard/clipper")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/clipper" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Overview & Earnings
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/clipper/campaigns")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/clipper/campaigns" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Discover campaigns
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/clipper/submissions")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/clipper/submissions" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  My Submissions ({mySubmissions.length})
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/clipper/earnings")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/clipper/earnings" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Withdrawal Settlements
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/clipper/profile")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/clipper/profile" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Profile & Aadhaar KYC
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3 space-y-8">
              
              {/* SUBTAB 1: Overview */}
              {currentRoute === "/dashboard/clipper" && (
                <div className="space-y-8">
                  {/* General Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">LIFETIME EARNED</span>
                      <strong className="text-xl font-black text-white font-display">₹{totalClipperEarned.toFixed(2)}</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">SETTLED IN GATEWAY</span>
                      <strong className="text-xl font-black text-gray-400 font-display">₹{totalClipperWithdrawn.toFixed(2)}</strong>
                    </div>

                    <div className="bg-[#1d273d] border border-cyan-500/20 rounded-2xl p-5">
                      <span className="text-[10px] text-cyan-400 font-mono block">REDEEMABLE CASH</span>
                      <strong className="text-cl font-black text-cyan-400 font-display">₹{(totalClipperEarned - totalClipperWithdrawn - clipperPendingWithdrawing).toFixed(2)}</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">TOTAL VIEWS RECORDED</span>
                      <strong className="text-xl font-black text-white font-display">
                        {mySubmissions.filter(s => s.status === 'Approved').reduce((acc, curr) => acc + curr.views, 0).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Highlights and Quick Guidelines */}
                  <div className="bg-gradient-to-r from-gray-950 to-[#121c2e] border border-cyan-500/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-white">How do view increments log?</h4>
                      <p className="text-xs text-gray-400 leading-relaxed max-w-lg">
                        Once you link active Reels and Shorts URLs and creators approve them, view trackers calculate CPM payouts automatically. Run the "Simulate Views Tracker Cron" simulator button at the top to accelerate dummy metrics and log earnings.
                      </p>
                    </div>
                    <button 
                      onClick={() => setRoute("/dashboard/clipper/campaigns")}
                      className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] font-bold text-xs px-5 py-2.5 rounded-xl font-mono uppercase tracking-wider"
                    >
                      Start clipping
                    </button>
                  </div>

                  {/* Short Submissions List */}
                  <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Submissions Active ledger</h3>
                    {mySubmissions.length === 0 ? (
                      <p className="text-xs text-gray-500">You haven't submitted any clips yet. Join campaigns to begin!</p>
                    ) : (
                      <div className="divide-y divide-gray-850 space-y-4">
                        {mySubmissions.slice(0, 3).map(sub => (
                          <div key={sub.id} className="pt-4 first:pt-0 flex items-center justify-between text-xs">
                            <div className="space-y-1 max-w-sm">
                              <p className="font-bold text-white truncate">{sub.campaignTitle}</p>
                              <a href={sub.submittedUrl} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline">{sub.submittedUrl}</a>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-mono text-gray-400">Views: <strong className="text-white font-black">{sub.views.toLocaleString()}</strong></span>
                              <span className={`block text-[9px] uppercase font-bold py-0.5 px-2 rounded mt-1 ${
                                sub.status === "Approved" ? "bg-emerald-950 text-emerald-400" : sub.status === "Rejected" ? "bg-red-950 text-red-400" : "bg-gray-800 text-gray-400"
                              }`}>{sub.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUBTAB 2: Campaign Discovery */}
              {currentRoute === "/dashboard/clipper/campaigns" && (
                <CampaignFinder 
                  userId={user.id} 
                  clipperProfile={clipperProfile} 
                  authToken={authToken}
                  setRoute={setRoute}
                />
              )}

              {/* SUBTAB 3: Submissions Queue */}
              {currentRoute === "/dashboard/clipper/submissions" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white">My Video Clips Queue</h2>
                    <p className="text-xs text-gray-400">Ledger details of all video clippings submitted across the QUOR network.</p>
                  </div>

                  {mySubmissions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-xs">No active submissions logged.</p>
                      <button onClick={() => setRoute("/dashboard/clipper/campaigns")} className="mt-4 bg-cyan-500 text-[#0c0f17] text-xs px-4 py-2 rounded-xl">Discover campaigns</button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-850 text-gray-500 uppercase font-mono text-[9px] tracking-wider">
                            <th className="py-3 px-4">Campaign Title</th>
                            <th className="py-3 px-4">Submitted Clip url</th>
                            <th className="py-3 px-4 text-center">Checked status</th>
                            <th className="py-3 px-4 text-right">Views count</th>
                            <th className="py-3 px-4 text-right">Earning share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-850">
                          {mySubmissions.map(sub => {
                            // CPM calculation representing ₹160 net share if campaign CPM is standard 200
                            const subEarned = (sub.views / 1000) * (200 * 0.8);
                            return (
                              <tr key={sub.id} className="hover:bg-slate-900/30">
                                <td className="py-4 px-4 font-bold text-white max-w-[160px] truncate">{sub.campaignTitle}</td>
                                <td className="py-4 px-4 max-w-[200px] truncate">
                                  <a href={sub.submittedUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{sub.submittedUrl}</a>
                                </td>
                                <td className="py-4 px-4 text-center">
                                  <span className={`inline-block text-[9px] uppercase font-bold py-0.5 px-2.5 rounded-full font-mono ${
                                    sub.status === "Approved" ? "bg-emerald-950 text-emerald-400" : sub.status === "Rejected" ? "bg-red-950 text-red-400" : "bg-gray-800 text-gray-400"
                                  }`}>{sub.status}</span>
                                  {sub.feedback && <span className="block text-[9px] text-gray-500 mt-1 max-w-[140px] truncate">{sub.feedback}</span>}
                                </td>
                                <td className="py-4 px-4 text-right font-mono text-gray-300 font-bold">{sub.views.toLocaleString()}</td>
                                <td className="py-4 px-4 text-right font-mono text-emerald-400 font-bold">₹{subEarned.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 4: Withdrawal Settlements */}
              {currentRoute === "/dashboard/clipper/earnings" && (
                <div className="space-y-8">
                  <WithdrawModal 
                    clipperProfile={clipperProfile}
                    totalEarned={totalClipperEarned}
                    totalWithdrawn={totalClipperWithdrawn}
                    pendingWithdrawal={clipperPendingWithdrawing}
                    authToken={authToken}
                    onSuccess={async () => {
                      await loadUserProfile();
                      fetchClipperStats();
                    }}
                  />

                  {/* Payout History queue */}
                  <div className="bg-[#111625] border border-gray-800 rounded-3xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">UPI Disbursements History</h3>
                    {myWithdrawals.length === 0 ? (
                      <p className="text-xs text-gray-500">No disbursements recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto text-xs">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-gray-850 text-gray-500 text-[9px] uppercase font-mono font-bold py-2">
                              <th className="py-2.5">Date</th>
                              <th className="py-2.5 text-center">UPI Address ID</th>
                              <th className="py-2.5 text-right">Amount (₹)</th>
                              <th className="py-2.5 text-right">Checked State</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-850">
                            {myWithdrawals.map(p => (
                              <tr key={p.id}>
                                <td className="py-3 text-gray-400">{p.createdAt.substring(0, 10)}</td>
                                <td className="py-3 text-center font-mono">{p.upiId}</td>
                                <td className="py-3 text-right font-bold text-white">₹{p.amount}</td>
                                <td className="py-3 text-right">
                                  <span className={`inline-block py-0.5 px-2.5 rounded font-mono text-[9px] uppercase font-bold ${
                                    p.status === "Completed" ? "bg-emerald-950 text-emerald-400" : p.status === "Failed" ? "bg-red-950 text-red-400" : "bg-gray-800 text-gray-400"
                                  }`}>{p.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUBTAB 5: Profile & KYC */}
              {currentRoute === "/dashboard/clipper/profile" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-8">
                  <div>
                    <h3 className="text-lg font-bold font-display text-white">Clipper Onboarding Profile</h3>
                    <p className="text-xs text-gray-400">Complete Aadhaar verification files and save settlements credentials safely.</p>
                  </div>

                  <form onSubmit={handleUpdateClipperProfile} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 block uppercase">PhonePe / Paytm UPI ID (FOR PAYOUTS)</label>
                        <input 
                          type="text" 
                          required
                          value={clipperUpi}
                          onChange={e => setClipperUpi(e.target.value)}
                          placeholder="yourname@okaxis"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 block uppercase">Instagram Handle</label>
                        <input 
                          type="text"
                          required
                          value={clipperInsta}
                          onChange={e => setClipperInsta(e.target.value)}
                          placeholder="@sam_reels"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 block uppercase">YouTube Clips Channel</label>
                        <input 
                          type="text" 
                          required
                          value={clipperYt}
                          onChange={e => setClipperYt(e.target.value)}
                          placeholder="Your Channels link/handle"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 block uppercase">PAN card Number</label>
                        <input 
                          type="text" 
                          required
                          value={clipperPan}
                          onChange={e => setClipperPan(e.target.value.toUpperCase())}
                          placeholder="ABCDE1234F"
                          maxLength={10}
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono text-gray-400 block">12-DIGIT AADHAAR ID NUMBER</label>
                        <input 
                          type="text" 
                          required
                          value={clipperAadhaar}
                          onChange={e => setClipperAadhaar(e.target.value)}
                          placeholder="4567 8901 2345"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      {/* Mock File Upload for KYC document */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono text-gray-400 block uppercase">Photo of Aadhaar / PAN card upload (KYC Document)</label>
                        <div className="border border-dashed border-gray-800 bg-[#161d2d] rounded-2xl p-6 text-center space-y-2">
                          <p className="text-[11px] text-gray-400">Drag and drop or click here to upload Aadhaar card copy (Supported: Jpeg, Png up to 5MB)</p>
                          <span className="text-[10px] text-cyan-400 font-mono block">MOCK_COMPLETED_SUCCESSFULLY: aadhaar_card_doc.png (Dummy selected)</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={clipperUpdating}
                      className="bg-cyan-500 hover:bg-cyan-400 font-bold text-xs font-mono uppercase tracking-wider py-3 px-8 rounded-xl transition-all cursor-pointer text-[#0c0f17]"
                    >
                      {clipperUpdating ? "Updating Verification Details..." : "Save details & submit KYC"}
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ROUTE 8: PROTECTED - Creator Dashboard Home */}
        {currentRoute.startsWith("/dashboard/creator") && user?.role === "creator" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar navigation tabs */}
            <div className="space-y-3">
              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-4 text-center space-y-3">
                <div className="w-12 h-12 bg-gradient-to-tr from-cyan-400 to-indigo-500 rounded-full mx-auto flex items-center justify-center font-bold font-display text-white text-base">
                  {user.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{user.name}</h4>
                  <span className="text-[10px] font-mono text-gray-500 block">ROLE: CONTENT CREATOR</span>
                </div>

                <div className="bg-[#131d2c]/60 p-2.5 rounded-xl border border-cyan-550/10 text-center space-y-1">
                  <span className="text-[9px] font-mono text-cyan-400 block tracking-wider uppercase">Escrow Wallet</span>
                  <strong className="text-white text-xs block">₹{creatorProfile ? creatorProfile.walletBalance.toLocaleString("en-IN") : "0"}</strong>
                  <button 
                    onClick={() => setShowDepositModal(true)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-1 px-3 rounded-full text-[9px] font-mono tracking-wide mt-1.5 cursor-pointer"
                  >
                    + Add Funds
                  </button>
                </div>
              </div>

              {/* Sidebar Tabs */}
              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-2.5 flex flex-col space-y-1 text-xs">
                <button 
                  onClick={() => setRoute("/dashboard/creator")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/creator" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Overview Statistics
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/creator/campaigns")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute.startsWith("/dashboard/creator/campaigns") ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Manage campaigns ({creatorCampaigns.length})
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/creator/campaigns/new")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/creator/campaigns/new" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Launch Campaign
                </button>
                <button 
                  onClick={() => setRoute("/dashboard/creator/profile")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/dashboard/creator/profile" ? "bg-[#1d273d] text-cyan-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Creator channel url
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3 space-y-8">
              
              {/* SUBTAB 1: Overview */}
              {currentRoute === "/dashboard/creator" && (
                <div className="space-y-8">
                  {/* General Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">TOTAL CAMPAIGNS</span>
                      <strong className="text-xl font-black text-white font-display">{creatorCampaigns.length} Active / Ended</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">TOTAL OUTFLOW SPENT</span>
                      <strong className="text-xl font-black text-white font-display">₹{creatorCampaigns.reduce((sum, c) => sum + c.spent, 0).toLocaleString("en-IN")}</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">ACTIVE ESCROW WALLET</span>
                      <strong className="text-xl font-black text-white font-display">₹{creatorProfile ? creatorProfile.walletBalance.toLocaleString("en-IN") : "0"}</strong>
                    </div>
                  </div>

                  {/* Creator explanation banner */}
                  <div className="bg-gradient-to-r from-[#0d1630] to-[#121c2c] border border-cyan-500/10 p-6 rounded-2xl">
                    <h3 className="text-sm font-bold text-white mb-2">Escrow Wallet Protection Mechanics</h3>
                    <p className="text-xs text-gray-400 leading-normal max-w-2xl">
                      To lock guarantees for video clipping editors, launching a campaign blocks the matching total budget upfront from your creator wallet. If you pause or delete your campaign, all remaining unused budget returns instantly to your account wallet.
                    </p>
                  </div>

                  {/* Campaigns Overview */}
                  <div className="bg-[#111625] border border-gray-800 rounded-3xl p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">My Active and Closed Campaigns</h4>
                      <button 
                        onClick={() => setRoute("/dashboard/creator/campaigns/new")}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-[10px] font-mono tracking-wider px-3.5 py-1 rounded-md uppercase"
                      >
                        + Launch Camp
                      </button>
                    </div>

                    {creatorCampaigns.length === 0 ? (
                      <p className="text-xs text-gray-500">You haven't launched any clipping campaigns yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-850 space-y-4">
                        {creatorCampaigns.map(camp => (
                          <div 
                            key={camp.id} 
                            onClick={() => viewCampaignDetail(camp)}
                            className="pt-4 first:pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-900/10 p-2 rounded-xl transition-colors group"
                          >
                            <div className="flex items-center space-x-3">
                              <img 
                                src={camp.iconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=150&auto=format&fit=crop&q=60"} 
                                alt="" 
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover bg-gray-900 border border-gray-800 shrink-0"
                              />
                              <div>
                                <strong className="text-xs group-hover:text-cyan-400 transition-colors text-white block">{camp.title}</strong>
                                <span className="text-[10px] text-gray-500 block font-mono">
                                  CPM: ₹{camp.cpm} | Platform: {getPlatformLabel(camp.platform)} | Type: {camp.campaignType === "both" ? "Both" : camp.campaignType === "ugc" ? "UGC" : "Clipers"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-6 text-right">
                              <div>
                                <span className="text-[10px] text-gray-500 block">Spent</span>
                                <strong className="text-xs text-white font-mono">₹{camp.spent.toLocaleString()} / ₹{camp.budget.toLocaleString()}</strong>
                              </div>
                              <div className="text-[10px] font-bold uppercase rounded px-2.5 py-0.5 font-mono bg-cyan-900/40 text-cyan-400">
                                {camp.status}
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUBTAB 2: Manage Campaigns */}
              {currentRoute === "/dashboard/creator/campaigns" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white">Campaign Management ledger</h2>
                    <p className="text-xs text-gray-400">Select any campaign row below to review clipper link submissions and handle pending payouts.</p>
                  </div>

                  {creatorCampaigns.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-xs">No campaigns available to monitor.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {creatorCampaigns.map(camp => (
                        <div key={camp.id} className="bg-[#151b2a] border border-gray-850 p-5 rounded-2xl space-y-4">
                          <div className="flex items-start space-x-4">
                            <img 
                              src={camp.iconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=150&auto=format&fit=crop&q=80"} 
                              alt="" 
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover bg-gray-900 border border-gray-800 shrink-0 mt-0.5"
                            />
                            <div className="flex-1">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-bold text-white font-display">{camp.title}</h4>
                                  <p className="text-[11px] text-gray-400 mt-0.5">Source target URL: <a href={camp.sourceVideoUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-mono break-all inline-block truncate max-w-xs sm:max-w-md">{camp.sourceVideoUrl}</a></p>
                                  <div className="flex items-center space-x-2 mt-2">
                                    <span className="text-[9px] font-bold font-mono text-cyan-400 bg-cyan-950/45 border border-cyan-800/30 px-2 py-0.5 rounded uppercase">
                                      Platform: {getPlatformLabel(camp.platform)}
                                    </span>
                                    <span className="text-[9px] font-bold font-mono text-amber-400 bg-amber-950/45 border border-amber-800/30 px-2 py-0.5 rounded uppercase">
                                      Content: {camp.campaignType === "both" ? "Both" : camp.campaignType === "ugc" ? "UGC" : "Clipers"}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded border border-cyan-800/40 capitalize self-start sm:self-center">
                                  {camp.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 text-xs border-y border-gray-850 py-3">
                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-mono">Total Budget</span>
                              <strong className="text-white">₹{camp.budget.toLocaleString()}</strong>
                            </div>
                            
                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-mono">Disbursed Spend</span>
                              <strong className="text-white">₹{camp.spent.toLocaleString()}</strong>
                            </div>

                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-mono">CPM Rate Setting</span>
                              <strong className="text-[#06b6d4]">₹{camp.cpm}</strong>
                            </div>

                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-mono">Ending deadline</span>
                              <strong className="text-white font-mono">{camp.deadline}</strong>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-gray-500 leading-none">Min clip duration is <strong className="text-gray-300">{camp.minDuration} seconds</strong></span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => viewCampaignDetail(camp)}
                                className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] text-[10px] font-bold font-mono uppercase px-3 py-1.5 rounded-lg cursor-pointer"
                              >
                                Review Submissions
                              </button>
                              <button
                                onClick={() => handleDeleteCampaign(camp.id)}
                                className="bg-rose-950/40 border border-rose-950 text-rose-300 hover:bg-rose-950/20 text-[10px] font-bold font-mono uppercase px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete / Refund</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 2 - ID DETAILS: Inside a specific Campaign detail + Submissions reviewer */}
              {currentRoute.startsWith("/dashboard/creator/campaigns/") && selectedCampaign && (
                <div className="space-y-8">
                  {/* Back button */}
                  <button 
                    onClick={() => { setSelectedCampaign(null); setRoute("/dashboard/creator/campaigns"); }}
                    className="text-gray-400 hover:text-white text-xs font-semibold flex items-center space-x-1"
                  >
                    <span>← Back to Campaigns list</span>
                  </button>

                  <div className="bg-[#111625] border border-gray-800 rounded-3xl p-6 space-y-6">
                    <div className="border-b border-gray-850 pb-4">
                      <span className="text-[10px] text-cyan-400 font-mono block">ACTIVE CAMPAIGN ANALYSIS</span>
                      <h2 className="text-xl font-bold font-display text-white">{selectedCampaign.title}</h2>
                    </div>

                    {/* oEmbed YouTube Embed section */}
                    {makeEmbedUrl(selectedCampaign.sourceVideoUrl) && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono tracking-wider text-gray-500 uppercase">Interactive Video Player (Verified oEmbed):</span>
                        <div className="aspect-video w-full rounded-2xl border border-gray-800 overflow-hidden bg-black max-w-2xl">
                          <iframe 
                            src={makeEmbedUrl(selectedCampaign.sourceVideoUrl)} 
                            title="source player video"
                            className="w-full h-full"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <ReviewSubmissions 
                    submissions={campaignSubmissions}
                    onReview={handleReviewSubmission}
                  />
                </div>
              )}

              {/* SUBTAB 3: Launch Campaign form */}
              {currentRoute === "/dashboard/creator/campaigns/new" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold font-display text-white">Create New Video Clipping Campaign</h3>
                    <p className="text-xs text-gray-400">Lock budget escrow secure upfront to guarantee clippers payment.</p>
                  </div>

                  <form onSubmit={handleLaunchCampaign} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase">CAMPAIGN TITLE HEADER</label>
                        <input 
                          type="text" 
                          required
                          value={campTitle}
                          onChange={e => setCampTitle(e.target.value)}
                          placeholder="e.g., Hooks React 19 ActionStates Tutorial Clips"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase">SOURCE LONG-FORM VIDEO URL (YOUTUBE LINK ONLY)</label>
                        <input 
                          type="url" 
                          required
                          value={campVideoUrl}
                          onChange={e => setCampVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=road123"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 uppercase font-bold text-cyan-300">CPM RATE (₹ / 1,000 VIEWS)</label>
                        <input 
                          type="number" 
                          required
                          min="50"
                          max="1000"
                          value={campCpm}
                          onChange={e => setCampCpm(e.target.value)}
                          placeholder="e.g., 200"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                        <span className="text-[10px] text-gray-500 block">Typical ranges occur between ₹100 - ₹300 per 1k views. Platform takes 20% commission on view payouts.</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 uppercase">TOTAL ESCROW CAMPAIGN BUDGET (₹)</label>
                        <input 
                          type="number" 
                          required
                          min="1000"
                          value={campBudget}
                          onChange={e => setCampBudget(e.target.value)}
                          placeholder="e.g., 5000"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                        />
                        <span className="text-[10px] text-gray-500 block">Funds will be blocked upfront. Unspent funds instantly return if campaign is paused or deleted.</span>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider">TARGET DISTRIBUTION PLATFORMS (Select one or more)</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (campPlatform === "all") {
                                setCampPlatform("youtube");
                              } else {
                                setCampPlatform("all");
                              }
                            }}
                            className="text-[9.5px] font-mono tracking-tight font-black text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded cursor-pointer"
                          >
                            {campPlatform === "all" ? "Clear / Select One" : "✨ Select All of them"}
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {[
                            { id: "youtube", label: "📹 YouTube Shorts" },
                            { id: "instagram", label: "📸 Instagram Reels" },
                            { id: "facebook", label: "👥 Facebook Reels" },
                            { id: "twitter", label: "🐦 X (Twitter)" }
                          ].map(plat => {
                            const activePlatforms = campPlatform === "both" 
                              ? ["youtube", "instagram"] 
                              : campPlatform === "all" 
                                ? ["youtube", "instagram", "facebook", "twitter"]
                                : (campPlatform || "").split(",").filter(Boolean);
                            const isSelected = activePlatforms.includes(plat.id);
                            
                            return (
                              <button
                                key={plat.id}
                                type="button"
                                onClick={() => {
                                  let nextPlats = [...activePlatforms];
                                  if (isSelected) {
                                    if (nextPlats.length > 1) {
                                      nextPlats = nextPlats.filter(p => p !== plat.id);
                                    }
                                  } else {
                                    nextPlats.push(plat.id);
                                  }
                                  
                                  if (nextPlats.length === 4) {
                                    setCampPlatform("all");
                                  } else if (nextPlats.length === 2 && nextPlats.includes("youtube") && nextPlats.includes("instagram")) {
                                    setCampPlatform("both");
                                  } else {
                                    setCampPlatform(nextPlats.join(","));
                                  }
                                }}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer ${isSelected ? "bg-[#16253c]/80 border-cyan-400 shadow shadow-cyan-500/10" : "bg-[#131a29]/60 border-gray-850 hover:border-gray-800"}`}
                              >
                                <span className={`text-[11px] font-bold ${isSelected ? "text-cyan-400" : "text-gray-300"}`}>{plat.label}</span>
                                <div className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] font-black ${isSelected ? "bg-cyan-500 border-cyan-400 text-gray-950" : "border-gray-700 bg-transparent text-transparent"}`}>
                                  ✓
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 uppercase font-bold text-cyan-300">REQUESTED CONTENT TYPE</label>
                        <select 
                          value={campContentType}
                          onChange={e => setCampContentType(e.target.value as "clipping" | "ugc" | "both")}
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        >
                          <option value="clipping">Clipers</option>
                          <option value="ugc">UGC (User-Generated Clip/Review/Reaction)</option>
                          <option value="both">Both</option>
                        </select>
                      </div>

                      <div className="space-y-3 sm:col-span-2 bg-[#121824] border border-gray-800/80 rounded-2xl p-3.5 shadow-inner">
                        <div className="flex items-center justify-between border-b border-gray-800/60 pb-2">
                          <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase">🖼️ CAMPAIGN ICON</h4>
                          <span className="text-[9px] text-gray-500 font-mono">Provide Custom Icon Only</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-1 items-center">
                          {/* Left Column: Action Button to Upload File (cols-6) */}
                          <div className="sm:col-span-6 space-y-1.5 animate-fadeIn">
                            <label className="text-[8.5px] font-mono text-gray-400 uppercase block">Upload Local Image</label>
                            <div className="relative">
                              <input 
                                type="file" 
                                accept="image/*"
                                onChange={handleLocalFileUpload}
                                id="campaign-system-file"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              />
                              <button
                                type="button"
                                className="w-full bg-[#182133] hover:bg-[#1e2a42] border border-gray-800 hover:border-cyan-500/55 rounded-xl py-2 px-3 text-[11px] font-semibold text-gray-200 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Upload File</span>
                              </button>
                            </div>
                            {customFileStatus && (
                              <div className="bg-[#18233b]/70 border border-cyan-900/30 px-2 py-1 rounded-lg flex items-center justify-between text-[9px] font-mono text-cyan-300 mt-1">
                                <span className="truncate max-w-[120px]">{customFileStatus}</span>
                                <span className="text-[8px] text-emerald-400 font-bold bg-[#0d1f1c] px-1 rounded">READY</span>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Custom Image URL Text Input (cols-6) */}
                          <div className="sm:col-span-6 space-y-1.5">
                            <label className="text-[8.5px] font-mono text-gray-400 uppercase block">Or Paste Image URL</label>
                            <input 
                              type="text" 
                              value={campIconUrl}
                              onChange={e => {
                                setCampIconUrl(e.target.value);
                                setCustomFileStatus("");
                              }}
                              placeholder="https://example.com/logo.png"
                              className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Unified Real-time Mini Campaign Card Preview */}
                        <div className="bg-[#141d2f]/70 border border-gray-800/60 p-2 rounded-xl flex items-center space-x-3 mt-1.5">
                          <div className="w-10 h-8 rounded-lg overflow-hidden bg-gray-900 shrink-0 border border-gray-800 relative">
                            <img 
                              src={campIconUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&auto=format&fit=crop&q=80"} 
                              alt="" 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-[10px] font-bold text-white truncate leading-none">
                              {campTitle || "Untethered Campaign Title"}
                            </h5>
                            <div className="flex space-x-2 text-[8px] text-gray-500 font-mono mt-0.5 leading-none">
                              <span>Platforms: {getPlatformBadgeText(campPlatform)}</span>
                              <span>•</span>
                              <span>Type: {campContentType === "both" ? "Both" : campContentType === "ugc" ? "UGC" : "Clipers"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 uppercase">MINIMUM CLIP DURATION (SECONDS)</label>
                        <input 
                          type="number" 
                          min="10"
                          max="120"
                          required
                          value={campMinDuration}
                          onChange={e => setCampMinDuration(e.target.value)}
                          placeholder="e.g., 15"
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-400 uppercase">CAMPAIGN END DEADLINE</label>
                        <input 
                          type="date" 
                          required
                          value={campDeadline}
                          onChange={e => setCampDeadline(e.target.value)}
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase block">Clipping Guidelines & instructions</label>
                        <textarea 
                          required
                          rows={4}
                          value={campInstructions}
                          onChange={e => setCampInstructions(e.target.value)}
                          placeholder="Explain typography styles, transitions, minimum duration expectations, or captions guidelines..."
                          className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                        ></textarea>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={campLoading}
                      className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 text-[#0c0f17] font-bold text-xs font-mono uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                    >
                      {campLoading ? "Processing Budget Locks..." : "Launch Campaign & block escrow"}
                    </button>
                  </form>
                </div>
              )}

              {/* SUBTAB 4: Profile */}
              {currentRoute === "/dashboard/creator/profile" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold font-display text-white">Creator Channel verified info</h3>
                    <p className="text-xs text-gray-400">Manage links to verify primary platforms channel content.</p>
                  </div>

                  <form onSubmit={handleUpdateCreatorProfile} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-gray-400 uppercase block">YouTube / Instagram Channel URL</label>
                      <input 
                        type="url" 
                        required
                        value={creatorChannel}
                        onChange={e => setCreatorChannel(e.target.value)}
                        placeholder="https://youtube.com/c/HassanTechShow"
                        className="w-full bg-[#171e2e] border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={creatorUpdating}
                      className="bg-cyan-500 hover:bg-cyan-400 font-bold text-[#0c0f17] text-xs font-mono uppercase tracking-wider py-2.5 px-6 rounded-lg cursor-pointer"
                    >
                      {creatorUpdating ? "Saving..." : "Save creator profile"}
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ROUTE 9: PROTECTED - ADMIN PANEL MASTER CONTROL */}
        {currentRoute.startsWith("/admin") && user?.role === "admin" && user?.isOwnerAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Admin Header / Sidebar switcher */}
            <div className="space-y-3">
              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-4 text-center space-y-3">
                <span className="text-[9px] uppercase font-mono bg-red-950 text-red-400 px-2.5 py-0.5 rounded-full border border-red-900/40">
                  SYSTEM_ROOT_ADMIN
                </span>
                <h4 className="text-xs font-bold font-display text-white">{user.name}</h4>
                <p className="text-[10px] text-gray-500 font-mono truncate">{user.email}</p>
              </div>

              <div className="bg-[#111625] border border-gray-800 rounded-2xl p-2.5 flex flex-col space-y-1 text-xs">
                <button 
                  onClick={() => setRoute("/admin")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/admin" ? "bg-rose-950/30 text-rose-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Stats Ledger
                </button>
                <button 
                  onClick={() => setRoute("/admin/users")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/admin/users" ? "bg-rose-950/30 text-rose-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Review Users ({adminUsers.length})
                </button>
                <button 
                  onClick={() => setRoute("/admin/kyc")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/admin/kyc" ? "bg-rose-950/30 text-rose-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  KYC Queue ({platformStats?.pendingKycCount || 0})
                </button>
                <button 
                  onClick={() => setRoute("/admin/campaigns")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/admin/campaigns" ? "bg-rose-950/30 text-rose-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  All Campaigns ({adminCampaigns.length})
                </button>
                <button 
                  onClick={() => setRoute("/admin/payouts")}
                  className={`text-left px-4 py-2.5 rounded-xl font-semibold transition-all ${
                    currentRoute === "/admin/payouts" ? "bg-rose-950/30 text-rose-400 font-bold" : "text-gray-400 hover:bg-[#151c2d] hover:text-white"
                  }`}
                >
                  Settlement Queue ({platformStats?.pendingPayoutsCount || 0})
                </button>
              </div>
            </div>

            {/* Admin Action Main Panels */}
            <div className="lg:col-span-3 space-y-8">
              
              {/* SUBTAB 1: Overall stats and Platform Earnings info */}
              {currentRoute === "/admin" && (
                <div className="space-y-8">
                  {/* Grid of stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">TOTAL PLATFORM GROSS</span>
                      <strong className="text-xl font-black text-white font-display">₹{platformStats ? platformStats.totalSpend.toLocaleString("en-IN") : "0"}</strong>
                    </div>

                    <div className="bg-rose-950/20 border border-rose-900/30 rounded-2xl p-5">
                      <span className="text-[10px] text-rose-400 font-mono block">20% ADMIN REVENUE</span>
                      <strong className="text-xl font-black text-rose-400 font-display">₹{platformStats ? platformStats.platformEarnings.toLocaleString("en-IN") : "0"}</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">PENDING KYC CLIPPERS</span>
                      <strong className="text-xl font-black text-amber-400 font-display">{platformStats?.pendingKycCount || 0} Queue</strong>
                    </div>

                    <div className="bg-[#111625] border border-gray-800 rounded-2xl p-5">
                      <span className="text-[10px] text-gray-500 font-mono block">PENDING WITHDRAWALS</span>
                      <strong className="text-xl font-black text-emerald-400 font-display">{platformStats?.pendingPayoutsCount || 0} Request</strong>
                    </div>
                  </div>

                  {/* Master stats explanation */}
                  <div className="bg-[#181116]/40 border border-rose-900/10 p-6 rounded-2xl space-y-2">
                    <h3 className="text-sm font-bold text-white uppercase font-mono text-rose-400 flex items-center space-x-2">
                      <span>Platform Commission Split Ledger System</span>
                    </h3>
                    <p className="text-xs text-gray-400 leading-normal max-w-2xl">
                      Each CPM view calculated logs automatically transfers 80% to the respective clipper's pending available pool. The matching remaining 20% commission split is captured as Admin net platform revenue.
                    </p>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: Users Management view */}
              {currentRoute === "/admin/users" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white font-mono uppercase">User Management ledger</h2>
                    <p className="text-xs text-gray-400">Total list of content clippers, creators and admins linked inside the QUOR ecosystem.</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-850 text-gray-500 text-[10px] uppercase font-mono font-bold">
                          <th className="py-3 px-4">User Name ID</th>
                          <th className="py-3 px-4">Email profile</th>
                          <th className="py-3 px-4 text-center">Assigned Role</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-center">Registration date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-850">
                        {adminUsers.map(u => (
                          <tr 
                            key={u.id}
                            onClick={() => setSelectedUserForDetails(u)}
                            className="hover:bg-[#182033]/40 transition-colors cursor-pointer group"
                          >
                            <td className="py-3.5 px-4 font-bold text-white group-hover:text-cyan-400 transition-colors">{u.name}</td>
                            <td className="py-3.5 px-4 font-mono text-gray-400">{u.email}</td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="text-[10px] uppercase font-mono font-bold bg-cyan-950/45 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded">
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${
                                u.status === "banned" ? "bg-rose-500/15 text-rose-400 border-rose-500/30 font-black animate-pulse" :
                                u.status === "suspended" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              }`}>
                                {u.status || "active"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center text-gray-400 font-mono text-[11px]">{u.createdAt?.substring(0, 10)}</td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUserForDetails(u);
                                }}
                                className="bg-cyan-500 hover:bg-cyan-400 text-gray-950 text-[10px] font-black font-mono uppercase tracking-wider px-2.5 py-1 rounded shadow transition-all duration-150"
                              >
                                View Details/Stats
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: KYC Queue */}
              {currentRoute === "/admin/kyc" && (
                <div className="bg-[#111625] border border-gray-800 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white font-mono uppercase">Clipper Aadhaar / PAN Verification queue</h2>
                    <p className="text-xs text-gray-400">Ensure security. Review pan credentials and documents, then confirm clipper permissions.</p>
                  </div>

                  {/* Filter clippers with profiles */}
                  <div className="space-y-4">
                    {adminUsers.filter(u => u.role === "clipper").map(u => {
                      return (
                        <div key={u.id} className="bg-[#161c2c] border border-gray-850 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start gap-4">
                          <div className="space-y-3">
                            <div>
                              <strong className="text-sm font-bold text-white block">{u.name}</strong>
                              <span className="text-xs text-gray-400 mt-0.5">{u.email}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-gray-950 p-3 rounded-lg border border-gray-800/80">
                              <div>
                                <span className="text-gray-500 block text-[9px] uppercase">PAN CARD NO:</span>
                                <strong className="text-white text-[11px]">ABCDE1234F</strong>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-[9px] uppercase">AADHAAR ID:</span>
                                <strong className="text-white text-[11px]">4567 8901 2345</strong>
                              </div>
                            </div>

                            {/* oEmbed view of uploaded KYC documents */}
                            <div className="space-y-1">
                              <span className="text-[9px] text-gray-500 uppercase block font-mono">Uploaded Document Copy:</span>
                              <div className="w-56 h-32 rounded-xl overflow-hidden border border-gray-800 bg-black">
                                <img 
                                  src="https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&auto=format&fit=crop&q=80" 
                                  alt="Identity Document" 
                                  className="w-full h-full object-cover opacity-80"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-3 self-stretch justify-between">
                            <span className="text-[10px] font-mono font-bold bg-[#142336] text-cyan-400 rounded px-2.5 py-0.5">
                              Onboarding Checklist: COMPLETE
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAdminKycAction(u.id, "Verified")}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                              >
                                <Check className="w-4 h-4" />
                                <span>Verify KYC</span>
                              </button>
                              <button
                                onClick={() => handleAdminKycAction(u.id, "Rejected")}
                                className="bg-rose-950 border border-rose-900 text-rose-300 text-xs px-4 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>Reject KYC</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUBTAB 4: All active campaigns */}
              {currentRoute === "/admin/campaigns" && (
                <div className="bg-[#111625] border border-gray-805 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white font-mono uppercase">Master Campaigns list</h2>
                    <p className="text-xs text-gray-400">Review all active campaigns created across the QUOR marketplace.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {adminCampaigns.map(camp => (
                      <div key={camp.id} className="bg-[#151b2a] border border-gray-850 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <strong className="text-xs text-white block">{camp.title}</strong>
                          <span className="text-[10px] text-gray-400 block font-mono">Created by: {camp.creatorName} | CPM: ₹{camp.cpm}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-xs text-gray-400 font-mono font-bold">Spent: ₹{camp.spent} / ₹{camp.budget}</span>
                          <span className="text-[9px] font-bold font-mono px-2 rounded-full uppercase bg-[#142336] text-cyan-400 capitalize">{camp.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUBTAB 5: Payouts requests settlements */}
              {currentRoute === "/admin/payouts" && (
                <div className="bg-[#111625] border border-gray-820 rounded-2xl p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white font-mono uppercase">Master Payout withdrawal queue</h2>
                    <p className="text-xs text-gray-400">Approve and credit requested withdrawals straight to clippers PhonePe/GPay addresses.</p>
                  </div>

                  {adminPayoutList.filter(p => p.status === "Processing").length === 0 ? (
                    <p className="text-xs text-gray-500 py-6 text-center">No pending withdrawal requests in processing.</p>
                  ) : (
                    <div className="space-y-4">
                      {adminPayoutList.filter(p => p.status === "Processing").map(p => (
                        <div key={p.id} className="bg-[#151b2a] border border-gray-850 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] text-gray-500 font-mono">REQUEST_ID: {p.id}</span>
                            <strong className="text-sm font-bold text-white block">Clipper Name: {p.clipperName}</strong>
                            <p className="text-xs font-mono text-cyan-400">UPI Address: {p.upiId}</p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="text-[10px] text-gray-500 block uppercase font-mono">Requested amount</span>
                              <strong className="text-base text-white font-black font-display">₹{p.amount}</strong>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAdminPayoutAction(p.id, "Completed")}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                              >
                                <Check className="w-4 h-4" />
                                <span>Disburse</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <Footer setRoute={setRoute} />

      {/* ESCROW WALLET TOP-UP MODAL OVERLAY */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111625] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-gray-950 to-[#121c2c] p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display text-white">Escrow wallet deposit</h3>
                <p className="text-xs text-gray-400">Add funds safely via Razorpay simulation.</p>
              </div>
              <button 
                onClick={() => setShowDepositModal(false)}
                className="text-gray-400 hover:text-white font-bold px-3 py-1 bg-[#1a2333] rounded-lg text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <form onSubmit={handleDepositFund} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono tracking-wider text-gray-400 uppercase block">SELECT DEPOSIT VALUE (₹ INR)</label>
                  
                  {/* Presets */}
                  <div className="grid grid-cols-3 gap-2">
                    {[5000, 10000, 20000].map(val => (
                      <button
                        type="button"
                        key={val}
                        onClick={() => setDepositAmount(String(val))}
                        className={`py-2 text-xs font-semibold rounded-lg font-mono transition-all uppercase border ${
                          depositAmount === String(val) 
                            ? "bg-cyan-500 border-cyan-400 text-black font-bold" 
                            : "bg-[#181f33] border-gray-800 text-gray-300 hover:text-white"
                        }`}
                      >
                        ₹{val.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <div className="relative pt-2">
                    <span className="absolute left-4 top-[65%] -track-y-1/2 -translate-y-1/2 text-gray-500 font-display text-sm font-bold">₹</span>
                    <input 
                      type="number" 
                      required
                      min="100"
                      value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)}
                      placeholder="Or enter custom size"
                      className="w-full bg-[#171e2e] border border-gray-800 rounded-xl pl-8 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="bg-[#131b2d] p-3 rounded-xl border border-gray-850/60 font-mono text-[10px] text-gray-400 leading-normal">
                  🔐 Gateways: Simulated RazorPay API interface configured. Funds are immediately debited to drive active campaigns escrow logs.
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-900 mt-4">
                  <button 
                    type="button"
                    onClick={() => setShowDepositModal(false)}
                    className="bg-gray-800 text-xs text-white px-4 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={depositing}
                    className="bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] text-xs font-black font-mono px-5 py-2 rounded-xl transition-all flex items-center space-x-1"
                  >
                    {depositing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-[#0c0f17] border-t-transparent rounded-full animate-spin"></div>
                        <span>Depositing...</span>
                      </>
                    ) : (
                      <span>Complete Deposit</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* USER DETAILS MODAL OVERLAY */}
      {selectedUserForDetails && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#111625] border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-gray-950 to-[#121c2d] p-6 md:p-8 border-b border-gray-800 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-md font-bold">
                    {selectedUserForDetails.role}
                  </span>
                  <span className="text-gray-500 font-mono text-[9px] uppercase tracking-wider font-semibold">
                    ID: {selectedUserForDetails.id}
                  </span>
                  {selectedUserForDetails.status && selectedUserForDetails.status !== "active" && (
                    <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-md font-bold border ${
                      selectedUserForDetails.status === "banned" 
                        ? "bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    }`}>
                      {selectedUserForDetails.status}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-black font-display text-white leading-none">
                  {selectedUserForDetails.name}
                </h3>
                <p className="text-xs text-gray-400 font-mono flex items-center space-x-1.5">
                  <span>Email:</span>
                  <strong className="text-white font-semibold">{selectedUserForDetails.email}</strong>
                </p>
                <p className="text-[10px] text-gray-500 font-mono">
                  Registered: {selectedUserForDetails.createdAt ? new Date(selectedUserForDetails.createdAt).toLocaleString("en-IN") : "N/A"}
                </p>
              </div>
              <button 
                onClick={() => setSelectedUserForDetails(null)}
                className="text-gray-400 hover:text-white font-bold p-2 bg-gray-900/80 hover:bg-gray-950 backdrop-blur rounded-full text-xs transition duration-205 cursor-pointer z-10 animate-scaleIn"
              >
                ✕
              </button>
            </div>

            {/* Warning banners if suspended or banned */}
            {selectedUserForDetails.status === "banned" && (
              <div className="bg-rose-950/40 border-b border-rose-800/60 px-6 py-3.5 flex items-center space-x-2 text-rose-400 text-xs">
                <span className="text-sm">🚨</span>
                <div>
                  <strong className="font-bold">Permanent Ban Imposed:</strong> {selectedUserForDetails.statusReason || "Violation of platform guidelines."}
                </div>
              </div>
            )}
            {selectedUserForDetails.status === "suspended" && (
              <div className="bg-amber-950/40 border-b border-amber-800/60 px-6 py-3.5 flex items-center space-x-2 text-amber-400 text-xs">
                <span className="text-sm">⚠️</span>
                <div>
                  <strong className="font-bold">Temporary Account Lock:</strong> Suspended until {selectedUserForDetails.statusUntil ? new Date(selectedUserForDetails.statusUntil).toLocaleString("en-IN") : "Indefinite"} {selectedUserForDetails.statusReason ? `(Reason: ${selectedUserForDetails.statusReason})` : ""}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="p-6 md:p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* IF ROLE IS CLIPPER */}
              {selectedUserForDetails.role === "clipper" && (() => {
                const numSubmissions = selectedUserForDetails.submissions?.length || 0;
                const approvedSubs = selectedUserForDetails.submissions?.filter(s => s.status === "Approved") || [];
                const numApproved = approvedSubs.length;
                const totalViews = approvedSubs.reduce((acc, curr) => acc + (curr.views || 0), 0);

                const ledger = selectedUserForDetails.walletHistory || [];
                const totalEarnedVal = ledger.filter(w => (w.type === "payment" || w.type === "commission") && w.status === "Completed").reduce((sum, item) => sum + item.amount, 0);
                const totalWithdrawnVal = ledger.filter(w => w.type === "withdrawal" && w.status === "Completed").reduce((sum, item) => sum + item.amount, 0);
                const pendingWithdrawVal = ledger.filter(w => w.type === "withdrawal" && w.status === "Pending").reduce((sum, item) => sum + item.amount, 0);
                const calcBalance = totalEarnedVal - totalWithdrawnVal - pendingWithdrawVal;
                const availableBalanceVal = calcBalance > 0 ? calcBalance : 0;

                return (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Aggregated Quick Metrics Bento */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">⚡ CLIPPER PERFORMANCE & PROFIT STACK</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">TOTAL REVENUE (LIFETIME)</span>
                          <strong className="text-emerald-400 font-black text-sm block mt-0.5">₹{totalEarnedVal.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">RETAINED IN WALLET</span>
                          <strong className="text-cyan-400 font-black text-sm block mt-0.5">₹{availableBalanceVal.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">PAID OUT TO UPI</span>
                          <strong className="text-gray-300 font-black text-sm block mt-0.5">₹{totalWithdrawnVal.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">CUMULATIVE VIEWS</span>
                          <strong className="text-fuchsia-400 font-black text-sm block mt-0.5">{totalViews.toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Profile & KYC settings */}
                    <div className="bg-[#161d2e]/45 border border-gray-850 rounded-2xl p-5 space-y-4">
                      <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">📋 GENERAL SPECIFICATIONS & KYC IDENTITY</h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                          <span className="text-[9px] text-gray-500 block font-mono">UPI DEPLOYED ADDRESS</span>
                          <strong className="text-white text-xs font-mono block truncate mt-1">
                            {selectedUserForDetails.clipperProfile?.upiId || "No UPI set"}
                          </strong>
                        </div>
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                          <span className="text-[9px] text-gray-500 block font-mono">KYC STAGE STATUS</span>
                          <strong className={`text-xs block mt-1 uppercase font-bold font-mono ${
                            selectedUserForDetails.clipperProfile?.kycStatus === "Verified" ? "text-emerald-400" :
                            selectedUserForDetails.clipperProfile?.kycStatus === "Pending" ? "text-amber-400" : "text-rose-400"
                          }`}>
                            {selectedUserForDetails.clipperProfile?.kycStatus || "Not Submitted"}
                          </strong>
                        </div>
                        
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                          <span className="text-[9px] text-gray-500 block font-mono">INSTAGRAM INSTANCE</span>
                          <strong className="text-white text-xs font-mono block mt-1">
                            {selectedUserForDetails.clipperProfile?.instagramHandle ? `@${selectedUserForDetails.clipperProfile.instagramHandle}` : "Not provided"}
                          </strong>
                        </div>
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                          <span className="text-[9px] text-gray-500 block font-mono">YOUTUBE SHORTS OUTLET</span>
                          <strong className="text-white text-xs font-mono block mt-1">
                            {selectedUserForDetails.clipperProfile?.youtubeHandle ? `@${selectedUserForDetails.clipperProfile.youtubeHandle}` : "Not provided"}
                          </strong>
                        </div>

                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850">
                          <span className="text-[9px] text-gray-500 block font-mono">AADHAAR SECURE CARD</span>
                          <strong className="text-white text-xs font-mono block mt-1">
                            {selectedUserForDetails.clipperProfile?.kycAadhaar || "Not uploaded"}
                          </strong>
                        </div>
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-855">
                          <span className="text-[9px] text-gray-500 block font-mono">PAN CARD SECURE ID</span>
                          <strong className="text-white text-xs font-mono block mt-1">
                            {selectedUserForDetails.clipperProfile?.kycPan || "Not uploaded"}
                          </strong>
                        </div>
                      </div>

                      {/* KYC DOC PREVIEW */}
                      {selectedUserForDetails.clipperProfile?.kycDocUrl && (
                        <div className="space-y-2 pt-2">
                          <span className="text-[9px] text-gray-550 font-mono uppercase block">Uploaded Identity Documentation Support Proof</span>
                          <div className="border border-gray-850 rounded-xl overflow-hidden bg-gray-900 max-h-48 flex justify-center items-center">
                            <img 
                              src={selectedUserForDetails.clipperProfile.kycDocUrl} 
                              alt="Clipper Identification KYC" 
                              className="max-h-48 object-contain w-full"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submission Statistics summary */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">📊 SUBMISSION FEED & CONSOLIDATED STATS ({numSubmissions})</h4>
                        <span className="text-[10px] font-mono text-gray-500">Approved: <strong className="text-emerald-400">{numApproved}</strong></span>
                      </div>
                      {(!selectedUserForDetails.submissions || selectedUserForDetails.submissions.length === 0) ? (
                        <p className="text-xs text-gray-500 italic bg-[#131926] p-4 rounded-xl text-center border border-gray-850">
                          No sub-clips are submitted yet by this clipper user.
                        </p>
                      ) : (
                        <div className="space-y-2.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                          {selectedUserForDetails.submissions.map((sub) => (
                            <div key={sub.id} className="bg-[#121824] border border-gray-850 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div className="space-y-1">
                                <span className="text-[9px] font-mono text-gray-550 bg-gray-900 px-1.5 py-0.5 rounded uppercase font-bold">SUBMISSION ID: {sub.id}</span>
                                <h5 className="text-xs font-bold text-white line-clamp-1 mt-1">{sub.campaignTitle}</h5>
                                <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-gray-500 font-mono">
                                  <span>Views: <strong className="text-cyan-400 font-bold">{sub.views.toLocaleString()}</strong></span>
                                  <span>•</span>
                                  <span>Approved: <strong className="text-white">{sub.approvedAt ? new Date(sub.approvedAt).toLocaleDateString("en-IN") : "N/A"}</strong></span>
                                  <span>•</span>
                                  <span>Link: <a href={sub.submittedUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300 font-semibold">{sub.submittedUrl}</a></span>
                                </div>
                              </div>
                              <span className={`text-[9px] uppercase font-mono font-black px-2 py-0.5 rounded ${
                                sub.status === "Approved" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                                sub.status === "Pending" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold pulse" :
                                "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              }`}>
                                {sub.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Financial ledger history */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black font-black">💰 TRANSACTIONS LEDGER & AUDITING HISTORIES</h4>
                      {(!selectedUserForDetails.walletHistory || selectedUserForDetails.walletHistory.length === 0) ? (
                        <p className="text-xs text-gray-500 italic bg-[#131926] p-4 rounded-xl text-center border border-gray-850">
                          No financial logs registered for this clipper yet.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {selectedUserForDetails.walletHistory.map((tx) => (
                            <div key={tx.id} className="bg-[#121824] border border-[#1b2234] p-3 rounded-xl flex items-center justify-between text-xs">
                              <div className="space-y-0.5">
                                <p className="font-bold text-white leading-normal">{tx.description}</p>
                                <p className="text-[9px] font-mono text-gray-500 uppercase">TXID: {tx.id} • {new Date(tx.createdAt).toLocaleString("en-IN")}</p>
                              </div>
                              <div className="text-right">
                                <span className={`font-mono font-bold font-display block ${
                                  tx.type === "withdrawal" ? "text-rose-400" : "text-emerald-400"
                                }`}>
                                  {tx.type === "withdrawal" ? "-" : "+"}₹{tx.amount.toLocaleString("en-IN")}
                                </span>
                                <span className="text-[8px] font-mono uppercase text-gray-400 block font-bold">{tx.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* IF ROLE IS CREATOR */}
              {selectedUserForDetails.role === "creator" && (() => {
                const numCampaigns = selectedUserForDetails.campaigns?.length || 0;
                const totalBudgets = selectedUserForDetails.campaigns?.reduce((sum, c) => sum + c.budget, 0) || 0;
                const totalSpentVal = selectedUserForDetails.campaigns?.reduce((sum, c) => sum + c.spent, 0) || 0;
                const balanceVal = selectedUserForDetails.creatorProfile?.walletBalance || 0;
                
                // Platforms count logic
                const campaignsList = selectedUserForDetails.campaigns || [];
                const activeCamps = campaignsList.filter(c => c.status === "Active");
                const completedCamps = campaignsList.filter(c => c.status === "Completed");

                return (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Aggregated Quick Metrics Bento */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">⚡ CREATOR CONSOLIDATED CAPITAL & PROFITS SUMMARY</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">CUMULATIVE ADVANCED</span>
                          <strong className="text-emerald-400 font-black text-sm block mt-0.5">₹{totalBudgets.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">CUMULATIVE OUTFLOW</span>
                          <strong className="text-rose-400 font-black text-sm block mt-0.5">₹{totalSpentVal.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">RETAINED IN RESERVES</span>
                          <strong className="text-cyan-400 font-black text-sm block mt-0.5">₹{balanceVal.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-[#121824] border border-gray-850 p-3 rounded-xl">
                          <span className="text-[9px] text-gray-500 font-mono block">RUNNING ESCROWS</span>
                          <strong className="text-fuchsia-400 font-black text-sm block mt-0.5">₹{(totalBudgets - totalSpentVal).toLocaleString("en-IN")}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Wallet details & channel */}
                    <div className="bg-[#161d2e]/45 border border-gray-800/80 rounded-2xl p-5 space-y-4">
                      <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">💻 GENERAL OVERVIEW & CHANNEL ENDPOINTS</h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-[#121824] px-4 py-3 rounded-xl border border-gray-850 col-span-1 sm:col-span-2 flex justify-between items-center">
                          <div>
                            <span className="text-[9px] text-gray-500 block font-mono">DEPLOYED WALLET BALANCE</span>
                            <strong className="text-emerald-400 text-xl font-black font-display block mt-0.5">
                              ₹{balanceVal.toLocaleString("en-IN")}
                            </strong>
                          </div>
                          <span className="text-[9px] font-mono text-gray-500 italic bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-md">
                            Escrow Reserves Fully Funded
                          </span>
                        </div>

                        <div className="bg-[#121824]/60 px-4 py-3 rounded-xl border border-gray-850 col-span-1 sm:col-span-2">
                          <span className="text-[9px] text-gray-500 block font-mono">CHANNEL OUTLET HOME</span>
                          <a 
                            href={selectedUserForDetails.creatorProfile?.channelUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-cyan-400 hover:underline text-xs font-mono block mt-1 truncate font-semibold"
                          >
                            {selectedUserForDetails.creatorProfile?.channelUrl || "Not verified yet"}
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Creator Campaigns list */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase font-black">📢 DYNAMIC CAMPAIGN SCHEDULER & DISBURSEMENTS</h4>
                        <span className="text-[10px] font-mono text-gray-500">Active: <strong className="text-cyan-400">{activeCamps.length}</strong> • Completed: <strong className="text-emerald-400">{completedCamps.length}</strong></span>
                      </div>
                      {(!selectedUserForDetails.campaigns || selectedUserForDetails.campaigns.length === 0) ? (
                        <p className="text-xs text-gray-500 italic bg-[#131926] p-4 rounded-xl text-center border border-gray-850 font-sans">
                          No active campaigns registered under this creator.
                        </p>
                      ) : (
                        <div className="space-y-3.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                          {selectedUserForDetails.campaigns.map((camp) => (
                            <div key={camp.id} className="bg-[#121824] border border-[#1b2234] rounded-xl p-4 space-y-3 relative overflow-hidden">
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <span className="text-[8px] font-mono text-gray-550 bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded uppercase font-bold block w-max">
                                    CAMPID: {camp.id}
                                  </span>
                                  <h5 className="text-xs font-bold text-white line-clamp-1 mt-1">{camp.title}</h5>
                                </div>
                                <span className={`text-[9px] uppercase font-mono font-semibold px-2 py-0.5 rounded ${
                                  camp.status === "Active" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" :
                                  camp.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                                  "bg-gray-800 text-gray-400 border border-gray-700"
                                }`}>
                                  {camp.status}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono bg-[#111622] p-2.5 rounded-lg border border-[#151c2a]">
                                <div>
                                  <span className="text-[8px] text-gray-500 block">BUDGET CAPITAL</span>
                                  <strong className="text-white">₹{camp.budget.toLocaleString("en-IN")}</strong>
                                </div>
                                <div>
                                  <span className="text-[8px] text-gray-500 block">CUMULATIVE SPENT</span>
                                  <strong className="text-emerald-400">₹{camp.spent.toLocaleString("en-IN")}</strong>
                                </div>
                                <div>
                                  <span className="text-[8px] text-gray-500 block">START CHRONO</span>
                                  <strong className="text-gray-400 font-semibold">{camp.createdAt ? camp.createdAt.substring(0, 10) : "N/A"}</strong>
                                </div>
                                <div>
                                  <span className="text-[8px] text-gray-500 block">DEADLINE CHRONO</span>
                                  <strong className="text-cyan-400 font-semibold">{camp.deadline ? camp.deadline.substring(0, 10) : "N/A"}</strong>
                                </div>
                              </div>

                              <div className="text-[9px] font-mono text-gray-400 flex items-center justify-between">
                                <span>Platform Outlet: <strong className="text-gray-300 uppercase">{camp.platform}</strong></span>
                                <span>CPM Reward Ratio: <strong className="text-cyan-400 font-bold">₹{camp.cpm} / 1K Views</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* IF ROLE IS ADMIN */}
              {selectedUserForDetails.role === "admin" && (
                <div className="bg-[#131926] border border-gray-850 rounded-xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
                    🛡️
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider">Privileged Administrator Level Security Access</h4>
                  <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed font-sans">
                    This account holds master level cryptographic clearance privileges. No external clipper or creator profile requirements exist for administrative roles. Includes access to approve KYC profiles, process payout UPIs, and monitor system-wide transaction flow logs.
                  </p>
                </div>
              )}

              {/* ACTION DISCIPLINARY OVERRIDE PANEL FOR ADMINS */}
              {selectedUserForDetails.role !== "admin" && (
                <div className="bg-[#1b2236]/80 border border-red-900/40 rounded-2xl p-5 space-y-4">
                  <h4 className="text-[10px] font-bold font-mono tracking-wider text-red-400 uppercase flex items-center gap-1.5 font-black">
                    🛡️ SECURITY CONTROL LOCKS & SUSPENSION/BAN TERMINALS
                  </h4>
                  
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-mono text-gray-400 block mb-1.5 font-bold uppercase">TARGETED SECURITY ACTION TYPE</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSuspendStatus("active")}
                          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                            suspendStatus === "active"
                              ? "bg-emerald-500 text-[#0c0f17] border border-emerald-400"
                              : "bg-gray-900 text-gray-400 hover:text-white border border-gray-800"
                          }`}
                        >
                          🟢 Active (Restore Platform Permissions)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspendStatus("suspended")}
                          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                            suspendStatus === "suspended"
                              ? "bg-amber-500 text-[#0c0f17] border border-amber-400"
                              : "bg-gray-900 text-gray-400 hover:text-white border border-gray-800"
                          }`}
                        >
                          🟡 Temporary Suspension (Cool-Off Lockout)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspendStatus("banned")}
                          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                            suspendStatus === "banned"
                              ? "bg-rose-500 text-white border border-rose-400"
                              : "bg-gray-900 text-gray-400 hover:text-white border border-gray-800"
                          }`}
                        >
                          🔴 Permanent Ban (Blacklist Profile)
                        </button>
                      </div>
                    </div>

                    {suspendStatus === "suspended" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#111624] p-4 rounded-xl border border-gray-850 animate-fadeIn">
                        <div>
                          <label className="text-[9px] font-mono text-gray-400 block mb-1 font-bold uppercase">SUSPENSION LOCKED PERIOD</label>
                          <select
                            value={suspendDuration}
                            onChange={(e) => setSuspendDuration(e.target.value)}
                            className="w-full bg-[#161d2f]/90 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono cursor-pointer"
                          >
                            <option value="1">1 Day</option>
                            <option value="3">3 Days</option>
                            <option value="7">7 Days (1 Week)</option>
                            <option value="15">15 Days (Half Month)</option>
                            <option value="30">30 Days (1 Month)</option>
                            <option value="90">90 Days (3 Months)</option>
                            <option value="180">180 Days (6 Months)</option>
                            <option value="365">365 Days (1 Year)</option>
                            <option value="1095">1095 Days (3 Years)</option>
                            <option value="permanent">Indefinite Profile Ban</option>
                          </select>
                        </div>
                        <div className="flex flex-col justify-end">
                          <span className="text-[10px] text-gray-400 font-mono leading-tight">
                            Suspended account access is locked across browser logins. On expiration, the core network auto-lifts the freeze on user's next request.
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[9px] font-mono text-gray-400 block mb-1 font-bold uppercase">OFFICIAL COMPLIANCE / OVERRIDE REASON</label>
                      <textarea
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        placeholder="Enter official reason (e.g. view count manipulation, fraudulent video link, incorrect UPI, inappropriate guidelines mismatch). Visible to the user upon login attempt."
                        rows={2}
                        className="w-full bg-[#111624] border border-gray-800 rounded-xl p-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 font-sans custom-scrollbar"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={updatingUserStatus}
                        onClick={() => {
                          const duration = suspendStatus === "suspended" ? suspendDuration : "0";
                          handleUpdateUserStatus(selectedUserForDetails.id, suspendStatus, duration, suspendReason);
                        }}
                        className="bg-red-500 hover:bg-red-400 text-[#0c0f17] text-[11px] font-black font-mono uppercase tracking-wider px-5 py-2.5 rounded-xl shadow transition duration-200 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer hover:shadow-red-500/10"
                      >
                        {updatingUserStatus ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-[#0c0f17] border-t-transparent rounded-full animate-spin"></div>
                            <span>UPDATING PRIVILEGES...</span>
                          </>
                        ) : (
                          <span>APPLY SECURITY OVERRIDE LOCK</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="bg-gradient-to-r from-gray-950 to-[#121c2d] px-6 py-4.5 border-t border-gray-800 flex items-center justify-end">
              <button 
                onClick={() => setSelectedUserForDetails(null)}
                className="bg-gray-850 hover:bg-gray-800 border border-gray-700 text-xs text-white px-5 py-2 rounded-xl transition cursor-pointer font-bold font-mono uppercase tracking-wider"
              >
                CLOSE PROFILE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
