'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, Icon, Spinner } from '@/components/ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const PROMPTS = [
  'What should I focus on this week?',
  'Explain my weakest concept simply',
  'Quiz me on something I keep forgetting',
];

export default function MentorPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    api
      .request<Message[]>('/mentor/history')
      .then(setMessages)
      .catch((err: any) => {
        if (err.message?.includes('401')) router.push('/login');
      })
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput('');
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'user', content, createdAt: new Date().toISOString() },
    ]);

    try {
      const result = await api.request<{ reply: string }>('/mentor/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: 'assistant',
          content: result.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'I could not reach the server just then. Try sending that again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Grow the textarea with content, up to a ceiling.
  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  if (initialLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b px-6 py-4 md:px-10">
        <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mentor</h1>
        <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
          Knows your knowledge graph, so answers are grounded in what you actually know.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-900 dark:text-gray-100">
                Ask about anything you are learning
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
                The mentor can see which concepts are weak and tailor its answers.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-full border px-3 py-1.5 text-2xs text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-100"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <Bubble key={msg.id} message={msg} />)
          )}

          {loading && (
            <div className="flex gap-1.5 px-1" aria-label="Mentor is typing">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t px-6 py-4 md:px-10">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={onInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question"
            rows={1}
            aria-label="Message"
            className="max-h-40 flex-1 resize-none rounded-lg border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:bg-dark-surface dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <Button
            variant="primary"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="h-9 w-9 px-0"
          >
            <Icon name="send" className="h-4 w-4" />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-[10px] text-gray-400 dark:text-gray-500">
          Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  // Assistant replies read as prose, not chat bubbles — closer to a document.
  if (!isUser) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-gray-100 px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 dark:bg-dark-tertiary dark:text-gray-100">
        {message.content}
      </div>
    </div>
  );
}
