import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-6xl">🔍</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mb-6 text-sm text-gray-500">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
