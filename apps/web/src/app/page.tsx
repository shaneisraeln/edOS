import Link from 'next/link';

const capabilities = [
  {
    title: 'It watches what you actually study',
    body: 'A desktop agent, browser extension and IDE extension record what you read and write — no manual logging.',
  },
  {
    title: 'It builds a map of what you know',
    body: 'Activity becomes a knowledge graph with a mastery score per concept, so gaps are visible instead of assumed.',
  },
  {
    title: 'It checks understanding while it is fresh',
    body: 'Short quizzes appear right after a study session, then return on a spaced schedule as recall decays.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <div className="animate-in">
        <p className="eyebrow">edOS</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-50">
          Measure mastery, not completion.
        </h1>
        <p className="mt-3 text-base muted">
          Learn from any resource. edOS verifies that you understood it.
        </p>

        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link href="/register" className="btn-primary">
            Create account
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
        </div>

        <div className="mt-14 space-y-7 border-t pt-10">
          {capabilities.map((item) => (
            <div key={item.title}>
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</h2>
              <p className="mt-1 text-sm muted">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
