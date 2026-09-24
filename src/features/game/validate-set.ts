import type { QuestionSet } from './types.ts';

export function validateQuestionSet(input: unknown): { value?: QuestionSet; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { errors: ['Bộ câu hỏi phải là một đối tượng JSON.'] };
  const value = input as Partial<QuestionSet>;
  if (!value.id || typeof value.id !== 'string') errors.push('Thiếu id bộ câu hỏi.');
  if (!value.title || typeof value.title !== 'string') errors.push('Thiếu tên bộ câu hỏi.');
  if (!Array.isArray(value.questions) || value.questions.length !== 20) errors.push('Cần đúng 20 câu hỏi.');
  if (!Array.isArray(value.answers) || value.answers.length !== 12) errors.push('Cần đúng 12 thẻ đáp án.');
  if (!Array.isArray(value.decoys) || value.decoys.length !== 6) errors.push('Cần đúng 6 thẻ nhiễu.');
  if (errors.length) return { errors };
  const set = value as QuestionSet;
  const allIds = [...set.questions.map((q) => q.id), ...set.answers.map((a) => a.id), ...set.decoys.map((d) => d.id)];
  if (new Set(allIds).size !== allIds.length) errors.push('ID câu hỏi hoặc thẻ bị trùng.');
  const usage = new Map(set.answers.map((a) => [a.id, 0]));
  if (set.questions.filter((q) => q.kind === 'fill').length !== 14) errors.push('Cần đúng 14 câu điền khuyết.');
  if (set.questions.filter((q) => q.kind === 'abc').length !== 6) errors.push('Cần đúng 6 câu trắc nghiệm ABC.');
  for (const [index, q] of set.questions.entries()) {
    if (!q.id || !q.text?.trim() || !q.hint?.trim()) errors.push(`Câu ${index + 1}: thiếu id, nội dung hoặc gợi ý.`);
    if (q.kind === 'fill') {
      if (!usage.has(q.answerId)) errors.push(`${q.id}: thẻ đáp án ${q.answerId} không tồn tại.`);
      else usage.set(q.answerId, (usage.get(q.answerId) ?? 0) + 1);
    } else if (q.kind === 'abc') {
      if (!['A', 'B', 'C'].includes(q.correctOption) || !q.options || !['A', 'B', 'C'].every((key) => typeof q.options[key as 'A' | 'B' | 'C'] === 'string' && q.options[key as 'A' | 'B' | 'C'].trim())) errors.push(`${q.id}: cần đủ ba phương án A/B/C và đáp án hợp lệ.`);
    } else errors.push(`Câu ${index + 1}: loại câu hỏi không hợp lệ.`);
  }
  for (const [id, count] of usage) if (count < 1 || count > 2) errors.push(`Thẻ ${id} phải được dùng trong 1–2 câu.`);
  const labels = new Set<string>();
  for (const a of set.answers) {
    if (!a.id || !a.text?.trim() || !a.code?.trim()) errors.push(`Thẻ đáp án ${a.id || '?'} thiếu dữ liệu.`);
    labels.add(a.text?.trim().toLocaleLowerCase('vi') ?? '');
  }
  for (const d of set.decoys) {
    if (!d.id || !d.text?.trim() || labels.has(d.text.trim().toLocaleLowerCase('vi'))) errors.push(`Thẻ nhiễu ${d.id || '?'} rỗng hoặc trùng đáp án thật.`);
  }
  return errors.length ? { errors } : { value: set, errors };
}
