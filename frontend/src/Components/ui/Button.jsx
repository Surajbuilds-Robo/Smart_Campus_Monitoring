const variantStyles = {
  primary:
    "bg-[#B26262] text-white shadow-xs hover:bg-[#9E5353] focus:ring-[#B26262]/40 active:scale-[0.98]",
  accent:
    "bg-[#8C8C7C] text-white shadow-xs hover:bg-[#79796B] focus:ring-[#8C8C7C]/40 active:scale-[0.98]",
  rose:
    "bg-[#B26262] text-white shadow-xs hover:bg-[#9E5353] focus:ring-[#B26262]/40 active:scale-[0.98]",
  secondary:
    "bg-[#F6EDED] text-[#3C1414] hover:bg-[#F0E3E3] border border-[#E5D6D6] focus:ring-[#B26262]/30 active:scale-[0.98]",
  outline:
    "border border-[#E5D6D6] bg-white text-[#3C1414] hover:bg-[#F6EDED] hover:border-[#B26262] focus:ring-[#B26262]/30 active:scale-[0.98]",
  ghost:
    "bg-transparent text-[#806B6A] hover:bg-[#F6EDED] hover:text-[#3C1414] focus:ring-[#B26262]/30",
  danger:
    "bg-[#C62828] text-white shadow-xs hover:bg-[#B71C1C] focus:ring-[#C62828]/40 active:scale-[0.98]",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2 text-sm rounded-xl gap-2",
  lg: "px-5 py-2.5 text-base rounded-xl gap-2.5",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className = "",
  icon: Icon,
  ...props
}) {
  const chosenVariant = variantStyles[variant] || variantStyles.primary;
  const chosenSize = sizeStyles[size] || sizeStyles.md;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${chosenVariant} ${chosenSize} ${className}`}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
