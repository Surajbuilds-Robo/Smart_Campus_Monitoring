import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "./Button";

export default function ErrorState({
  title = "Failed to load data",
  description = "An error occurred while fetching information from the campus server.",
  error = null,
  onRetry = null,
  retryLabel = "Try Again",
  className = "",
}) {
  const errorMessage =
    typeof error === "string" ? error : error?.message || null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex flex-col items-center justify-center rounded-2xl border border-[#C62828]/25 bg-[#FDECEC]/60 p-8 text-center backdrop-blur-xs ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDECEC] text-[#C62828]">
        <AlertTriangle size={24} />
      </div>

      <h3 className="mt-3.5 text-base font-semibold text-[#3C1414]">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-xs text-[#806B6A]">
        {description}
      </p>

      {errorMessage && (
        <div className="mt-3 max-w-md rounded-xl border border-[#C62828]/30 bg-white px-3.5 py-2 font-mono text-[11px] text-[#C62828]">
          {errorMessage}
        </div>
      )}

      {typeof onRetry === "function" && (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            icon={RefreshCw}
            className="border-[#C62828]/40 text-[#C62828] hover:bg-[#FDECEC]"
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
