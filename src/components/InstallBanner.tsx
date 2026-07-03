import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallBanner() {
  const { canPrompt, promptInstall, dismiss } = useInstallPrompt();

  if (!canPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-blue-200 bg-blue-50 p-4 shadow-lg safe-bottom">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div>
          <p className="font-medium text-gray-900">AccuBolt App</p>
          <p className="text-xs text-gray-500">
            Add AccuBolt to Home Screen
          </p>
          <p className="text-xs text-gray-600">
            Quick access — works like a native app
          </p>
        </div>
        <button
          onClick={async () => {
            await promptInstall();
          }}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
