export default function Skeleton({
  className = "",
  ...props
}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[#F0E3E3] ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}
