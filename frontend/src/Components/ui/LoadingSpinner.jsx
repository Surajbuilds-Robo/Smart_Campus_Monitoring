const sizeStyles = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-3",
  lg: "h-12 w-12 border-4",
};

export default function LoadingSpinner({
  size = "md",
  className = "",
  label = "Loading...",
}) {
  const chosenSize = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center justify-center"
    >
      <span
        className={`animate-spin rounded-full border-[#B26262] border-t-transparent ${chosenSize} ${className}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
