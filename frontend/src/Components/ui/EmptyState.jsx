import { Inbox } from "lucide-react";

export default function EmptyState({
  title = "No data available",
  description = "There are no records to display at this time.",
  icon: Icon = Inbox,
  action,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5D6D6] bg-[#FBF3F3]/50 p-8 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6EDED] text-[#806B6A]">
        <Icon size={24} />
      </div>

      <h4 className="mt-3 text-sm font-semibold text-[#3C1414]">
        {title}
      </h4>

      {description && (
        <p className="mt-1 max-w-sm text-xs text-[#806B6A]">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
