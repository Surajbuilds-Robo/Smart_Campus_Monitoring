import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

const variantStyles = {
  info: {
    container:
      "border-[#E5D6D6] bg-[#F6EDED] text-[#3C1414]",
    icon: Info,
    iconColor: "text-[#B26262]",
  },
  success: {
    container:
      "border-[#287A43]/30 bg-[#E7F5EA] text-[#287A43]",
    icon: CheckCircle2,
    iconColor: "text-[#287A43]",
  },
  warning: {
    container:
      "border-[#A66A00]/30 bg-[#FFF4CC] text-[#A66A00]",
    icon: AlertTriangle,
    iconColor: "text-[#A66A00]",
  },
  danger: {
    container:
      "border-[#C62828]/30 bg-[#FDECEC] text-[#C62828]",
    icon: AlertCircle,
    iconColor: "text-[#C62828]",
  },
};

export default function Alert({
  variant = "info",
  title,
  children,
  onClose,
  className = "",
}) {
  const chosen = variantStyles[variant] || variantStyles.info;
  const Icon = chosen.icon;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${chosen.container} ${className}`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${chosen.iconColor}`} />

      <div className="flex-1">
        {title && <h5 className="font-semibold">{title}</h5>}
        {children && <div className={title ? "mt-1 text-xs" : ""}>{children}</div>}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className="rounded-md p-1 transition hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-current"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
