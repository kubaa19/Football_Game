function validateQuestions(input, options = {}) {
  const result = {
    validQuestions: [], invalidQuestions: [], warnings: [], errors: [],
    summary: { total: 0, valid: 0, invalid: 0 }
  };
  if (!Array.isArray(input)) {
    result.errors.push({ code: 'INPUT_NOT_ARRAY', path: '$', message: 'Expected an array.' });
    return result;
  }
  result.summary.total = input.length;
  const expectedCount = options?.expectedCount;
  if (expectedCount !== undefined) {
    if (!Number.isInteger(expectedCount) || expectedCount < 0) {
      result.errors.push({ code: 'EXPECTED_COUNT_INVALID', path: 'expectedCount', message: 'Expected a non-negative integer.' });
    } else if (input.length !== expectedCount) {
      result.errors.push({ code: 'COUNT_MISMATCH', path: '$', message: `Expected ${expectedCount} questions, received ${input.length}.` });
    }
  }
  const fields = ['category', 'difficulty', 'question', 'options', 'correct_index', 'explanation', 'tags'];
  const categories = ['transfers', 'records', 'champions_league', 'world_cup', 'tactics_and_rules'];
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const normalize = value => value.trim().toLowerCase();
  const tokens = value => new Set(value.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/u).filter(Boolean));
  const rows = [];
  const groups = new Map();

  for (let index = 0; index < input.length; index++) {
    const question = input[index];
    const reasons = [];
    const add = (code, path, message, relatedIndex) => {
      const reason = { code, path, message };
      if (relatedIndex !== undefined) reason.relatedIndex = relatedIndex;
      reasons.push(reason);
    };
    const row = { index, question, reasons, add };
    rows.push(row);
    if (question === null || typeof question !== 'object' ||
        (Object.getPrototypeOf(question) !== Object.prototype && Object.getPrototypeOf(question) !== null)) {
      add('QUESTION_NOT_OBJECT', '$', 'Expected a plain object.');
      continue;
    }
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(question, field)) add('FIELD_MISSING', field, 'Required field is missing.');
    }
    for (const field of Reflect.ownKeys(question)) {
      if (!fields.includes(field)) add('FIELD_UNEXPECTED', String(field), 'Unexpected field.');
    }
    if (!categories.includes(question.category)) add('CATEGORY_INVALID', 'category', 'Category is not allowed.');
    if (!Number.isInteger(question.difficulty) || question.difficulty < 1 || question.difficulty > 3) add('DIFFICULTY_INVALID', 'difficulty', 'Expected an integer from 1 to 3.');
    if (!nonempty(question.question)) add('QUESTION_TEXT_INVALID', 'question', 'Expected a non-empty string.');
    if (!Array.isArray(question.options)) {
      add('OPTIONS_NOT_ARRAY', 'options', 'Expected an array.');
    } else {
      if (question.options.length !== 4) add('OPTIONS_COUNT', 'options', 'Expected exactly four options.');
      const seen = new Map();
      for (let i = 0; i < question.options.length; i++) {
        const option = question.options[i];
        if (!nonempty(option)) {
          add('OPTION_INVALID', `options[${i}]`, 'Expected a non-empty string.');
        } else {
          const key = normalize(option);
          if (seen.has(key)) add('OPTION_DUPLICATE', `options[${i}]`, 'Duplicate option after trim and lowercase.', seen.get(key));
          else seen.set(key, i);
        }
      }
    }
    if (!Number.isInteger(question.correct_index) || question.correct_index < 0 || question.correct_index > 3) add('CORRECT_INDEX_INVALID', 'correct_index', 'Expected an integer from 0 to 3.');
    if (!nonempty(question.explanation)) add('EXPLANATION_INVALID', 'explanation', 'Expected a non-empty string.');
    if (!Array.isArray(question.tags)) {
      add('TAGS_NOT_ARRAY', 'tags', 'Expected an array.');
    } else {
      if (!question.tags.length) add('TAGS_EMPTY', 'tags', 'Expected at least one tag.');
      for (let i = 0; i < question.tags.length; i++) {
        if (!nonempty(question.tags[i])) add('TAG_INVALID', `tags[${i}]`, 'Expected a non-empty string.');
      }
    }
    if (nonempty(question.question)) {
      row.key = normalize(question.question);
      row.tokens = tokens(question.question);
      if (!groups.has(row.key)) groups.set(row.key, []);
      groups.get(row.key).push(index);
    }
  }
  for (const indexes of groups.values()) {
    if (indexes.length > 1) {
      for (const index of indexes) {
        for (const other of indexes) {
          if (other !== index) rows[index].add('QUESTION_DUPLICATE', 'question', 'Duplicate question after trim and lowercase.', other);
        }
      }
    }
  }
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!a.tokens || !b.tokens || a.key === b.key) continue;
      const union = new Set([...a.tokens, ...b.tokens]).size;
      if (!union) continue;
      const intersection = [...a.tokens].filter(token => b.tokens.has(token)).length;
      const similarity = intersection / union;
      if (similarity >= 0.85) result.warnings.push({
        code: 'QUESTION_SIMILAR', indexes: [i, j], similarity,
        message: 'Questions may test the same fact.'
      });
    }
  }
  for (const { index, question, reasons } of rows) {
    if (reasons.length) result.invalidQuestions.push({ index, question, reasons });
    else result.validQuestions.push(question);
  }
  result.summary.valid = result.validQuestions.length;
  result.summary.invalid = result.invalidQuestions.length;
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateQuestions };
}
