import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">edOS</h1>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            Measure mastery, not completion.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            className="btn-primary w-full block"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="btn-secondary w-full block"
          >
            Create Account
          </Link>
        </div>

        <p className="text-sm text-gray-400">
          Learn from any resource. We verify understanding.
        </p>
      </div>
    </main>
  );
}
