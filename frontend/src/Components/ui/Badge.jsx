const variantStyles = {
  high:
    "bg-[#FDECEC] text-[#C62828] border-[#C62828]/30 font-semibold",
  medium:
    "bg-[#FFF4CC] text-[#A66A00] border-[#A66A00]/30 font-semibold",
  low:
    "bg-[#E7F5EA] text-[#287A43] border-[#287A43]/30 font-semibold",
  neutral:
    "bg-[#F6EDED] text-[#806B6A] border-[#E5D6D6]",
  primary:
    "bg-[#F6EDED] text-[#B26262] border-[#B26262]/30",
  cerulean:
    "bg-[#F6EDED] text-[#B26262] border-[#B26262]/30",
  accent:
    "bg-[#F0E3E3] text-[#8C8C7C] border-[#8C8C7C]/30",
  rose:
    "bg-[#F6EDED] text-[#B26262] border-[#B26262]/30",
  secondary:
    "bg-[#F0E3E3] text-[#8C8C7C] border-[#8C8C7C]/30",
  success:
    "bg-[#E7F5EA] text-[#287A43] border-[#287A43]/30",
  warning:
    "bg-[#FFF4CC] text-[#A66A00] border-[#A66A00]/30",
  danger:
    "bg-[#FDECEC] text-[#C62828] border-[#C62828]/30",
  info:
    "bg-[#F6EDED] text-[#B26262] border-[#B26262]/30",
};

const dotStyles = {
  high: "bg-[#C62828]",
  medium: "bg-[#A66A00]",
  low: "bg-[#287A43]",
  neutral: "bg-[#806B6A]",
  primary: "bg-[#B26262]",
  cerulean: "bg-[#B26262]",
  accent: "bg-[#8C8C7C]",
  rose: "bg-[#B26262]",
  secondary: "bg-[#8C8C7C]",
  success: "bg-[#287A43]",
  warning: "bg-[#A66A00]",
  danger: "bg-[#C62828]",
  info: "bg-[#B26262]",
};

export default function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
  ...props
}) {
  const chosenVariant = variantStyles[variant] || variantStyles.neutral;
  const chosenDot = dotStyles[variant] || dotStyles.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${chosenVariant} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${chosenDot}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
