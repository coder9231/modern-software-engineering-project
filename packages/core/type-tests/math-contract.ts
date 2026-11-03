import {
  generateWorksheet,
  generateWorksheetStream,
  normalizeOptions,
  gradeWorksheet,
} from '../src/math/core.mjs';
import type { Question, WorksheetGenerationSummary } from '../src/math/core.mjs';

const options = normalizeOptions({ operators: ['+', '/'], divisionMode: 'exact', count: 10 });
const worksheet = generateWorksheet(options);
const iterator = generateWorksheetStream(options, {
  onProgress: (progress) => progress.generated.toFixed(0),
});
const result = iterator.next();
if (result.done) {
  const summary: WorksheetGenerationSummary = result.value;
  summary.seed.toUpperCase();
} else {
  const question: Question = result.value;
  question.answer.toUpperCase();
}
gradeWorksheet({ questions: worksheet.questions, answers: ['1', '2'] });
// @ts-expect-error Operators are limited to the four supported symbols.
generateWorksheet({ operators: ['^'] });
// @ts-expect-error A worksheet count is a number, not text.
generateWorksheet({ count: '10' });
// @ts-expect-error Progress payloads are typed; a generated count is not a string.
generateWorksheetStream({}, { onProgress: (progress: { generated: string }) => void progress });
// @ts-expect-error Arbitrary non-string answers are rejected by the public contract.
gradeWorksheet({ questions: worksheet.questions, answers: [1] });
