import { RoomDashboard } from '@/features/rooms/components/room-dashboard';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomDashboard code={code.toUpperCase()} />;
}
