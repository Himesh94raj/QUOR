export type SocialPlatform = "youtube" | "instagram" | "tiktok";

export interface SocialDetails {
  platform: SocialPlatform;
  contentId: string;
  normalizedUrl: string;
}

export function detectPlatform(url: string): SocialPlatform | null {
  const lowercase = url.toLowerCase();
  if (lowercase.includes("youtube.com") || lowercase.includes("youtu.be")) {
    return "youtube";
  }
  if (lowercase.includes("instagram.com")) {
    return "instagram";
  }
  if (lowercase.includes("tiktok.com")) {
    return "tiktok";
  }
  return null;
}

export function extractContentId(url: string): string | null {
  try {
    const platform = detectPlatform(url);
    if (!platform) return null;

    // Remove query params first for easier matching
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    if (platform === "youtube") {
      // youtube.com/shorts/:id
      const shortsMatch = pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch && shortsMatch[1]) {
        return shortsMatch[1];
      }
      // youtube.com/watch?v=:id
      const vParam = urlObj.searchParams.get("v");
      if (vParam) {
        return vParam;
      }
      // youtu.be/:id
      if (urlObj.hostname.includes("youtu.be")) {
        const pathId = pathname.replace("/", "");
        if (pathId) return pathId;
      }
    } else if (platform === "instagram") {
      // instagram.com/reel/:id or instagram.com/reels/:id or instagram.com/p/:id
      const reelMatch = pathname.match(/\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/);
      if (reelMatch && reelMatch[1]) {
        return reelMatch[1];
      }
    } else if (platform === "tiktok") {
      // tiktok.com/@username/video/:id
      const videoMatch = pathname.match(/\/video\/([0-9]+)/);
      if (videoMatch && videoMatch[1]) {
        return videoMatch[1];
      }
      // vm.tiktok.com/:id or tiktok.com/t/:id
      const shortMatch = pathname.match(/\/(?:t|v|vm)?\/([a-zA-Z0-9_-]+)/);
      if (shortMatch && shortMatch[1] && shortMatch[1] !== "video") {
        return shortMatch[1];
      }
      // fallback matching any trailing path segment if it's long enough
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last && last.match(/^[a-zA-Z0-9_-]+$/)) {
          return last;
        }
      }
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return null;
}

export function normalizeSocialUrl(url: string): string | null {
  const platform = detectPlatform(url);
  const contentId = extractContentId(url);
  if (!platform || !contentId) return null;

  if (platform === "youtube") {
    return `https://www.youtube.com/shorts/${contentId}`;
  } else if (platform === "instagram") {
    return `https://www.instagram.com/reel/${contentId}/`;
  } else if (platform === "tiktok") {
    return `https://www.tiktok.com/video/${contentId}`;
  }
  return null;
}

export function validateSubmissionUrl(url: string): {
  isValid: boolean;
  platform?: SocialPlatform;
  contentId?: string;
  normalizedUrl?: string;
  error?: string;
} {
  try {
    // Basic structure validation
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { isValid: false, error: "URL must start with http:// or https://" };
    }

    const platform = detectPlatform(url);
    if (!platform) {
      return { isValid: false, error: "Unsupported domain. Only YouTube Shorts, Instagram Reels, and TikTok URLs are allowed." };
    }

    const contentId = extractContentId(url);
    if (!contentId) {
      return { isValid: false, error: "Could not extract a valid video content ID from the URL." };
    }

    const normalizedUrl = normalizeSocialUrl(url);
    if (!normalizedUrl) {
      return { isValid: false, error: "Failed to normalize social media URL." };
    }

    return {
      isValid: true,
      platform,
      contentId,
      normalizedUrl
    };
  } catch (e) {
    return { isValid: false, error: "Invalid URL format." };
  }
}
