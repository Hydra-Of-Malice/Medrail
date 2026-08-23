export default function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[6px] border border-danger/30 bg-danger-soft p-8 text-center">
      <p className="font-display text-lg text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-text-muted">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-[6px] border border-line-strong px-3 py-1.5 text-sm text-text-muted transition hover:border-danger/40 hover:text-danger"
        >
          Try again
        </button>
      )}
    </div>
  );
}
