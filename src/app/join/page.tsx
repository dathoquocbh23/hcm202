import { JoinForm } from '@/features/rooms/components/join-form';

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams;
  return <JoinForm initialCode={typeof code === 'string' ? code.trim().toUpperCase().slice(0, 6) : ''} />;
}
