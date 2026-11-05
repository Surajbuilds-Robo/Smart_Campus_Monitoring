export default function PageHeader({
  title,
  description,
  icon: Icon,
  children,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6EDED] text-[#B26262] shadow-xs ring-1 ring-[#B26262]/20">
            <Icon size={22} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-[#3C1414]">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-xs text-[#806B6A]">
              {description}
            </p>
          )}
        </div>
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
