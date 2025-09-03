import '@picocss/pico/css/pico.min.css'; // simple, reliable styling
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Belto Grader (Minimal)',
  description: 'Grades strictly by the pasted rubric and submission.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="container">{children}</body>
    </html>
  );
}
