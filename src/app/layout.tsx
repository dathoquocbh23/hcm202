import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Đấu Trường Tri Thức',
  description: 'Trò chơi thẻ bài kiến thức đối kháng theo đội.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
