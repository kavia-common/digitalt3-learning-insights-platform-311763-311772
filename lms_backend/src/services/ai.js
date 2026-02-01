const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 1024);
const DEFAULT_ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';

/**
 * Normalize and validate the quiz schema mandated by product requirements:
 * - JSON array of exactly 5 questions
 * - each question has: questionText (string), options (array of 4 strings), correctAnswerIndex (0..3)
 *
 * @param {any} quiz
 * @returns {Array<{questionText: string, options: string[], correctAnswerIndex: number}>|null}
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

    const questionText = typeof item.questionText === 'string' ? item.questionText.trim() : '';
    const options = Array.isArray(item.options)
      ? item.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
      : [];

    const idxRaw = item.correctAnswerIndex;
    const correctAnswerIndex = Number.isFinite(Number(idxRaw)) ? Number(idxRaw) : NaN;

    if (!questionText) {
      return null;
    }
    if (options.length !== 4) {
      return null;
    }
    if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
      return null;
    }

    normalized.push({ questionText, options, correctAnswerIndex });
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

    /**
     * We configure the official SDK with required defaults:
     * - anthropic-version header via SDK option `defaultHeaders`
     */
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: {
        'anthropic-version': DEFAULT_ANTHROPIC_VERSION,
      },
    });
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
    /** Returns an array of 5 multiple choice questions in the mandated JSON schema. */
    const input = typeof content === 'string' ? content.trim() : '';
    if (!input) {
      const err = new Error('content is required');
      err.code = 'AI_INPUT_INVALID';
      throw err;
    }

    // Mandated: use a system prompt that requires the JSON schema.
    const systemPrompt = [
      'You are an enterprise LMS quiz generator.',
      'You MUST respond with ONLY a valid JSON array (no markdown, no code fences, no commentary).',
      'The JSON array MUST contain exactly 5 objects.',
      'Each object MUST have exactly these fields:',
      '- questionText: string',
      '- options: array of exactly 4 strings',
      '- correctAnswerIndex: integer 0-3 (index into options)',
      'Do not include any other keys.',
      'Questions MUST be based strictly on the lesson content.',
      'Options MUST be plausible and non-overlapping.',
    ].join('\n');

    const userPrompt = ['LESSON CONTENT:', input].join('\n');

    const msg = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
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
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch (err) {
          const e = new Error('AI quiz response was not valid JSON');
          e.code = 'AI_OUTPUT_INVALID_JSON';
          throw e;
        }
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
