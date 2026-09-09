
function validateQuestions(questions) {
  return questions.filter(q => {
    const hasFourOptions = Array.isArray(q.options) && q.options.length === 4;
    const uniqueOptions = new Set(q.options).size === 4;
    const validIndex = Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3;
    const hasText = q.question && q.explanation;

    return hasFourOptions && uniqueOptions && validIndex && hasText;
  });
}