import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'edOS',
  description: 'AI-native Learning Operating System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `,
        }} />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
