import { LiveBoard } from '@/features/game/components/live-board';

export default async function LivePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ display?: string }> }) {
  const [{ code }, search] = await Promise.all([params, searchParams]);
  return <LiveBoard code={code.toUpperCase()} display={search.display} />;
}
