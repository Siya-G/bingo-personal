type ErrorMessageProps = Readonly<{
  message: string | null;
  title?: string;
}>;

export function ErrorMessage({ message, title }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-red-300/35 bg-red-500/10 p-4 text-sm font-semibold text-red-100"
      role="alert"
    >
      {title ? (
        <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200/90">
          {title}
        </p>
      ) : null}
      <p className={title ? "mt-2" : ""}>{message}</p>
    </div>
  );
}
