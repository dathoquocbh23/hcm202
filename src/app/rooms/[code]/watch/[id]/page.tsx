import { MatchScreen } from '@/features/game/components/match-screen';

export default async function WatchPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ display?: string }> }) {
  const [{ code, id }, search] = await Promise.all([params, searchParams]);
  return <MatchScreen code={code.toUpperCase()} matchId={id} display={search.display} spectator />;
}
