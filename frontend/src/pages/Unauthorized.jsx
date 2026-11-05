import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function Unauthorized() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF4CC] text-[#A66A00]">
        <ShieldAlert size={32} />
      </div>

      <h1 className="mt-4 text-2xl font-bold text-[#3C1414]">
        Access Restricted
      </h1>

      <p className="mt-2 max-w-md text-sm text-[#806B6A]">
        Your campus account role does not have permission to view this resource. Contact your department administrator if you believe this is in error.
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
