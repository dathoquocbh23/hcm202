import type { Metadata } from 'next';
import { DemoFlow } from '@/features/game/components/demo-flow';

export const metadata: Metadata = {
  title: 'Xem thử luồng bàn học | Đấu Trường Tri Thức',
  description: 'Bản xem thử tương tác: hai góc nhìn đội chơi trên cùng một bàn học 2.5D.'
};

export default function DeskFlowDemoPage() {
  return <DemoFlow />;
}
