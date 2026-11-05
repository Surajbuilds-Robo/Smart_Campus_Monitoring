import { Download, Share2, X, Smartphone } from "lucide-react";
import usePWAInstall from "../hooks/usePWAInstall";
import { Button } from "../components/ui";

export default function PWAInstallBanner() {
  const { canInstall, isIOS, promptInstall, dismiss } = usePWAInstall();

  if (!canInstall && !isIOS) return null;

  return (
    <div
      role="region"
      aria-label="App installation banner"
      className="border-b border-blue-200/80 bg-blue-50/95 px-4 py-2.5 backdrop-blur-xs transition-all dark:border-blue-900/50 dark:bg-blue-950/70"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-blue-950 dark:text-blue-200">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <Smartphone size={18} />
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-white">
              Install Smart Campus Web App
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {isIOS
                ? "On iOS: Tap the Share button in Safari, then tap 'Add to Home Screen'."
                : "Add to home screen for offline shell access, instant launch, and full-screen telemetry."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canInstall && (
            <Button
              size="sm"
              onClick={promptInstall}
              icon={Download}
              className="min-h-[44px] px-3.5 text-xs shadow-xs"
            >
              Install App
            </Button>
          )}

          {isIOS && (
            <div className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white/80 px-2.5 py-1.5 font-medium text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
              <Share2 size={13} />
              <span>Safari Share → Add to Home Screen</span>
            </div>
          )}

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install banner"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-blue-900/40 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
