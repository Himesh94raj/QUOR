import React from "react";
import { User, CreatorProfile } from "../types";
import { QuorLogo } from "./QuorLogo";
import { Film, User as UserIcon, LogOut, Wallet, LayoutDashboard, Shield, Play } from "lucide-react";

interface NavbarProps {
  user: User | null;
  creatorProfile: CreatorProfile | null;
  currentRoute: string;
  setRoute: (route: string) => void;
  onLogout: () => void;
  onOpenDeposit: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  creatorProfile,
  currentRoute,
  setRoute,
  onLogout,
  onOpenDeposit
}) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0c0f17]/90 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div 
            onClick={() => setRoute("/")} 
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center p-1.5 shadow-md group-hover:border-cyan-500/50 transition-colors">
              <QuorLogo size={24} className="group-hover:scale-110 transition-transform duration-250 animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-bold font-display uppercase tracking-wider bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                QUOR
              </span>
              <span className="text-[9px] block text-cyan-400 font-mono tracking-widest mt-[-2px]">MARKETPLACE</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
            <button 
              onClick={() => setRoute("/")} 
              className={`transition-colors ${currentRoute === "/" ? "text-cyan-400" : "text-gray-400 hover:text-white"}`}
            >
              Home
            </button>
            <button 
              onClick={() => setRoute("/about")} 
              className={`transition-colors ${currentRoute === "/about" ? "text-cyan-400" : "text-gray-400 hover:text-white"}`}
            >
              How It Works
            </button>
            <button 
              onClick={() => setRoute("/contact")} 
              className={`transition-colors ${currentRoute === "/contact" ? "text-cyan-400" : "text-gray-400 hover:text-white"}`}
            >
              Contact
            </button>
            <button 
              onClick={() => setRoute("/legal")} 
              className={`transition-colors ${currentRoute === "/legal" ? "text-cyan-400" : "text-gray-400 hover:text-white"}`}
            >
              Legal Pages
            </button>
          </nav>

          {/* Right Area (Auth state) */}
          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3 sm:space-x-4">
                {/* Creator Wallet Shortcut */}
                {user.role === "creator" && creatorProfile !== null && (
                  <div className="hidden sm:flex items-center space-x-2 bg-gradient-to-r from-gray-950 to-[#121c2c] border border-cyan-900/40 rounded-full py-1.5 px-3.5 text-xs text-cyan-400 shadow-md">
                    <Wallet className="w-3.5 h-3.5" />
                    <span className="font-medium text-gray-200">₹{creatorProfile.walletBalance.toLocaleString("en-IN")}</span>
                    <button 
                      onClick={onOpenDeposit}
                      className="ml-1 bg-cyan-500 hover:bg-cyan-400 text-[#0c0f17] font-semibold rounded-full px-2 py-0.5 text-[10px] transition-all hover:scale-105 active:scale-95"
                    >
                      + Top Up
                    </button>
                  </div>
                )}

                {/* Dashboard Hub button */}
                <button
                  onClick={() => {
                    if (user.role === "admin" && user.isOwnerAdmin) setRoute("/admin");
                    else if (user.role === "creator") setRoute("/dashboard/creator");
                    else setRoute("/dashboard/clipper");
                  }}
                  className="flex items-center space-x-1.5 bg-[#171e2e] hover:bg-[#20293c] text-white border border-gray-800 rounded-lg py-1.5 px-3 text-xs transition-all pointer-events-auto cursor-pointer"
                >
                  {user.role === "admin" && user.isOwnerAdmin ? (
                    <Shield className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  <span className="hidden sm:inline font-medium">Dashboard</span>
                </button>

                {/* Logged in User Dropdown card */}
                <div className="relative group/user">
                  <div className="flex items-center space-x-2 bg-gradient-to-b from-[#131926] to-[#0d121f] text-gray-300 border border-gray-800 rounded-lg p-1.5 pl-2.5 cursor-pointer hover:border-cyan-500/50 transition-colors">
                    <div className="w-5.1 h-5 bg-gradient-to-tr from-cyan-500 to-indigo-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold uppercase select-none p-1">
                      {user.name.substring(0, 2)}
                    </div>
                    <span className="hidden leading-tight text-left text-xs font-medium sm:block max-w-[80px] truncate">
                      {user.name}
                    </span>
                  </div>

                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-48 bg-[#0f172a] border border-gray-800 rounded-xl shadow-2xl p-1 opacity-0 translate-y-2 pointer-events-none group-hover/user:opacity-100 group-hover/user:translate-y-0 group-hover/user:pointer-events-auto transition-all duration-200 z-50">
                    <div className="px-3 py-2 text-[11px] text-gray-500 border-b border-gray-800">
                      Logged in as <strong className="text-gray-300 font-medium block truncate mt-0.5">{user.email}</strong>
                    </div>
                    
                    <button
                      onClick={() => setRoute(user.role === "clipper" ? "/dashboard/clipper/profile" : "/dashboard/creator/profile")}
                      className="w-full text-left flex items-center space-x-2 px-3 py-2 hover:bg-[#1e293b] rounded-lg text-xs font-normal text-gray-300 hover:text-white transition-colors"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-gray-500" />
                      <span>Edit Profile</span>
                    </button>

                    <button
                      onClick={onLogout}
                      className="w-full text-left flex items-center space-x-2 px-3 py-2 hover:bg-rose-950/40 hover:text-rose-400 rounded-lg text-xs font-normal text-rose-300 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400/80" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 sm:space-x-3 text-xs sm:text-sm">
                <button
                  onClick={() => setRoute("/auth/login")}
                  className="text-gray-400 hover:text-white font-medium transition-colors px-3 py-1.5"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setRoute("/auth/signup")}
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 text-white font-medium rounded-lg px-4 py-1.5 transition-all hover:brightness-110 active:scale-95 shadow-lg shadow-indigo-500/10 cursor-pointer"
                >
                  Join QUOR
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
