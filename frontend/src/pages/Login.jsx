import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../services/apiClient";

export default function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const videoRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const isSubmittingRef = useRef(false);

  const rawFrom = location.state?.from?.pathname;
  const destination = (rawFrom && rawFrom !== "/login") ? rawFrom : "/dashboard";

  // Redirect immediately if already authenticated
  useEffect(() => {
    if (auth.isAuthenticated && !auth.loading) {
      navigate(destination, { replace: true });
    }
  }, [auth.isAuthenticated, auth.loading, navigate, destination]);

  // Handle browser Back/Forward Cache (BFCache) restoration cleanly
  useEffect(() => {
    const handlePageShow = () => {
      setLoading(false);
      isSubmittingRef.current = false;
      if (auth.isAuthenticated && !auth.loading) {
        navigate(destination, { replace: true });
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [auth.isAuthenticated, auth.loading, navigate, destination]);

  // Check prefers-reduced-motion preference
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);

      const handleChange = (e) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener?.("change", handleChange);
      return () => mediaQuery.removeEventListener?.("change", handleChange);
    }
  }, []);

  // Ensure muted autoplay succeeds across browsers
  useEffect(() => {
    if (videoRef.current && !prefersReducedMotion && !videoError) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        // Autoplay may be deferred or blocked by browser power-saver; poster remains visible
      });
    }
  }, [prefersReducedMotion, videoError]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      const { user } = await auth.login(email, password);

      if (typeof onLoginSuccess === "function") {
        onLoginSuccess(user);
      }

      navigate(destination, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed. Please verify your credentials."));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen min-h-dvh items-center justify-center overflow-x-hidden bg-[#FBF3F3] p-3 sm:p-4">
      {/* Background Video & Fallback Asset (Behind all interactive content) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        {prefersReducedMotion || videoError ? (
          <img
            src="/images/campus-poster.jpg"
            alt=""
            className="h-full w-full object-cover object-center opacity-40"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="/images/campus-poster.jpg"
            onError={() => setVideoError(true)}
            tabIndex={-1}
            className="h-full w-full object-cover object-center opacity-40"
          >
            <source src="/videos/campus-bg.mp4" type="video/mp4" />
            <source src="/videos/campus-bg.webm" type="video/webm" />
          </video>
        )}

        {/* Ambient Subtle Tinted Overlay for Login Card Contrast (bg-slate-900 retained for contract) */}
        <div className="absolute inset-0 bg-[#FBF3F3]/80 bg-slate-900/10 backdrop-blur-[2px]" />
      </div>
      {/* Main Login Card (Preserving existing structure, styling, and fields) */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#E5D6D6] bg-white/95 p-6 shadow-2xl shadow-[#3C1414]/10 backdrop-blur-md sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B26262] text-white shadow-md shadow-[#B26262]/30">
            <ShieldCheck size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#3C1414]">
            Smart Campus
          </h1>
          <p className="mt-1 text-sm text-[#806B6A]">
            Sign in to access monitoring services
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#C62828]/30 bg-[#FDECEC] p-3.5 text-sm text-[#C62828]"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[#3C1414]"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@campus.edu"
              disabled={loading}
              className="mt-1.5 w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2.5 text-sm text-[#3C1414] placeholder-[#806B6A] transition focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#3C1414]"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={loading}
              className="mt-1.5 w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2.5 text-sm text-[#3C1414] placeholder-[#806B6A] transition focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
            />
          </div>
          <button
            type="submit"
            id="login-submit-btn"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#B26262] py-2.5 text-sm font-semibold text-white transition hover:bg-[#9E5252] focus:outline-none focus:ring-2 focus:ring-[#B26262]/30 disabled:opacity-60"
          >
            <LogIn size={18} />
            <span>{loading ? "Signing in..." : "Sign in"}</span>
          </button>
        </form>
      </div>
    </main>
  );
}

