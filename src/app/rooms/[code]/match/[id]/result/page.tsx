import { MatchResult } from '@/features/game/components/match-result';

export default async function ResultPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ display?: string }> }) {
  const [{ code, id }, search] = await Promise.all([params, searchParams]);
  return <MatchResult code={code.toUpperCase()} matchId={id} display={search.display} />;
}
