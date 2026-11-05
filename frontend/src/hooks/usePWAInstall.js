import { useState, useEffect, useCallback } from "react";

function checkIsStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
  );
}

/**
 * Hook to manage PWA installation prompt and platform detection,
 * including iOS "Add to Home Screen" instructions.
 */
export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(checkIsStandalone);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pwa_install_dismissed") === "true";
    } catch {
      return false;
    }
  });

  const isIOS =
    typeof window !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !window.MSStream;

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem("pwa_install_dismissed", "true");
    } catch {
      // Ignore localStorage failure in restricted contexts
    }
  }, []);

  return {
    canInstall: Boolean(deferredPrompt && !isInstalled && !dismissed),
    isInstalled,
    isIOS: Boolean(isIOS && !isInstalled && !dismissed),
    promptInstall,
    dismiss,
  };
}
