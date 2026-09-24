import type { SkillId } from './types.ts';

export interface SkillDefinition {
  kind: SkillId;
  name: string;
  category: 'attack' | 'defense' | 'reaction';
  copies: number;
  description: string;
}

export const SKILLS: SkillDefinition[] = [
  { kind: 'hint', name: 'Gợi ý', category: 'defense', copies: 3, description: 'Mở dòng gợi ý của câu hỏi.' },
  { kind: 'narrow', name: 'Thu Hẹp', category: 'defense', copies: 2, description: 'Loại 4 thẻ sai hoặc 1 phương án ABC sai.' },
  { kind: 'second-chance', name: 'Cơ Hội Thứ Hai', category: 'defense', copies: 2, description: 'Được trả lời lại một lần trong thời gian còn lại.' },
  { kind: 'extra-time', name: 'Thêm Giờ', category: 'defense', copies: 3, description: 'Thêm 10 giây để trả lời.' },
  { kind: 'double-strike', name: 'Đòn Đôi', category: 'attack', copies: 2, description: 'Nếu trả lời sai, gây 120 HP.' },
  { kind: 'rush', name: 'Tốc Chiến', category: 'attack', copies: 2, description: 'Thời gian trả lời cơ bản còn 7 giây.' },
  { kind: 'confusion', name: 'Nhiễu Loạn', category: 'attack', copies: 2, description: 'Thêm 2 thẻ nhiễu vào bàn đáp án.' },
  { kind: 'pierce', name: 'Xuyên Giáp', category: 'attack', copies: 2, description: 'Trả lời đúng vẫn mất 30 HP.' },
  { kind: 'nullify', name: 'Vô Hiệu', category: 'reaction', copies: 1, description: 'Hủy kỹ năng vừa dùng của đối thủ.' },
  { kind: 'steal', name: 'Đánh Cắp', category: 'reaction', copies: 1, description: 'Lấy kỹ năng đối thủ vừa rút.' }
];

export const skillById = Object.fromEntries(SKILLS.map((s) => [s.kind, s])) as Record<SkillId, SkillDefinition>;
