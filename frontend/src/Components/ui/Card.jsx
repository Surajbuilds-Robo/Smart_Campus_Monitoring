export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`rounded-2xl border border-[#E5D6D6] bg-white text-[#3C1414] shadow-xs transition-colors ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "", ...props }) {
  return (
    <div
      className={`flex flex-col gap-1 border-b border-[#E5D6D6]/80 p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "", ...props }) {
  return (
    <h3
      className={`text-base font-semibold text-[#3C1414] ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = "", ...props }) {
  return (
    <p
      className={`text-xs text-[#806B6A] ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ children, className = "", ...props }) {
  return (
    <div className={`p-5 text-[#3C1414] ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "", ...props }) {
  return (
    <div
      className={`flex items-center justify-between border-t border-[#E5D6D6]/80 p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
