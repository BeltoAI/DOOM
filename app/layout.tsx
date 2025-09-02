import '@picocss/pico/css/pico.min.css';  // Guaranteed styling fallback
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Belto Grader',
  description: 'Professional rubric-based grading with a local LLM proxy.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
