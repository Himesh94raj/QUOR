const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // If running in the AI Studio preview container (*.run.app) or local development on port 3000,
    // use relative paths to route requests to the co-located Express server.
    if (hostname.includes("run.app") || hostname === "localhost" || hostname === "127.0.0.1") {
      return "";
    }
  }

  // Default to the Railway production backend for external deployments like Vercel
  return "https://quor-production-f440.up.railway.app";
};

export const API_BASE = getApiBase();
