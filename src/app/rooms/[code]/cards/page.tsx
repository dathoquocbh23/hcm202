import { CardLibrary } from '@/features/rooms/components/card-library';

export default async function CardsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CardLibrary code={code.toUpperCase()} />;
}
