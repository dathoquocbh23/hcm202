import { MatchScreen } from '@/features/game/components/match-screen';

export default async function MatchPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  return <MatchScreen code={code.toUpperCase()} matchId={id} />;
}
