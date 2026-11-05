import { Link } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F6EDED] text-[#806B6A]">
        <Compass size={32} />
      </div>

      <h1 className="mt-4 text-2xl font-bold text-[#3C1414]">
        Page Not Found
      </h1>

      <p className="mt-2 max-w-md text-sm text-[#806B6A]">
        The requested URL was not found on this campus monitoring node. Please verify the address or return to the overview dashboard.
      </p>

      <div className="mt-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-[#B26262] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#9E5252] focus:outline-none focus:ring-2 focus:ring-[#B26262]/30"
        >
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </main>
  );
}
