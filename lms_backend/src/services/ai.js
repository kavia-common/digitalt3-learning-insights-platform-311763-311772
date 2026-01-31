const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 1024);

/**
 * Basic schema validation for quiz JSON coming back from the model.
 * We keep it permissive but ensure it is safe/consistent for downstream clients.
 * @param {any} quiz
 * @returns {Array<{question: string, options: string[], correctAnswer: string}>|null}
 */
function normalizeQuiz(quiz) {
  if (!Array.isArray(quiz)) {
    return null;
  }

  const normalized = [];
  for (const item of quiz) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    const options = Array.isArray(item.options)
      ? item.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
      : [];
    const correctAnswer = typeof item.correctAnswer === 'string' ? item.correctAnswer.trim() : '';

    if (!question || options.length < 2 || !correctAnswer) {
      return null;
    }

    // If the model returns a correctAnswer that isn't in options, keep it but append
    // to preserve correctness and avoid breaking clients.
    const optionSet = new Set(options.map((o) => o.toLowerCase()));
    if (!optionSet.has(correctAnswer.toLowerCase())) {
      options.push(correctAnswer);
    }

    normalized.push({ question, options, correctAnswer });
  }

  return normalized;
}

class AIService {
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      const err = new Error('ANTHROPIC_API_KEY is not configured');
      err.code = 'ANTHROPIC_API_KEY_MISSING';
      throw err;
    }

    this.client = new Anthropic({ apiKey });
  }

  // PUBLIC_INTERFACE
  async generateSummary(content) {
    /** Returns a concise 3-paragraph summary for the provided lesson content. */
    const input = typeof content === 'string' ? content.trim() : '';
    if (!input) {
      const err = new Error('content is required');
      err.code = 'AI_INPUT_INVALID';
      throw err;
    }

    const prompt = [
      'You are an assistant helping create learning content for an enterprise LMS.',
      'Write a concise summary of the lesson content below in exactly 3 paragraphs.',
      'Do not add a title. Do not use bullet points. Keep it clear and professional.',
      '',
      'LESSON CONTENT:',
      input,
    ].join('\n');

    const msg = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = Array.isArray(msg.content)
      ? msg.content
          .filter((c) => c && c.type === 'text')
          .map((c) => c.text)
          .join('\n')
      : '';

    return text.trim();
  }

  // PUBLIC_INTERFACE
  async generateQuiz(content) {
    /** Returns an array of 5 multiple choice questions in JSON format. */
    const input = typeof content === 'string' ? content.trim() : '';
    if (!input) {
      const err = new Error('content is required');
      err.code = 'AI_INPUT_INVALID';
      throw err;
    }

    const prompt = [
      'You are an assistant helping create quiz questions for an enterprise LMS.',
      'From the lesson content below, create exactly 5 multiple choice questions.',
      'Return ONLY valid JSON, with this exact shape:',
      '[',
      '  { "question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "..." },',
      '  ... (5 total)',
      ']',
      'Rules:',
      '- options must be an array of 4 strings',
      '- correctAnswer must be exactly one of the options',
      '- keep questions unambiguous and based strictly on the lesson content',
      '',
      'LESSON CONTENT:',
      input,
    ].join('\n');

    const msg = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = Array.isArray(msg.content)
      ? msg.content
          .filter((c) => c && c.type === 'text')
          .map((c) => c.text)
          .join('\n')
      : '';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Sometimes models wrap JSON in text. Try to extract the first JSON array.
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(text.slice(start, end + 1));
      } else {
        const err = new Error('AI quiz response was not valid JSON');
        err.code = 'AI_OUTPUT_INVALID_JSON';
        throw err;
      }
    }

    const normalized = normalizeQuiz(parsed);
    if (!normalized || normalized.length !== 5) {
      const err = new Error('AI quiz response did not match required schema (expected 5 questions)');
      err.code = 'AI_OUTPUT_INVALID_SCHEMA';
      throw err;
    }

    return normalized;
  }
}

// PUBLIC_INTERFACE
function createAIService() {
  /** Factory to create AIService; isolates env validation for easier call sites. */
  return new AIService();
}

module.exports = { createAIService };
