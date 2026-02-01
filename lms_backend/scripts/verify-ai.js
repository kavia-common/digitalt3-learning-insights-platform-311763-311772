/* eslint-disable no-console */
'use strict';

require('dotenv').config();

const { createAIService } = require('../src/services/ai');

/**
 * PUBLIC_INTERFACE
 * Runs a minimal verification call against Anthropic Claude using a sample lesson.
 * Logs the generated summary to stdout.
 *
 * Usage:
 *   node scripts/verify-ai.js
 */
async function main() {
  const sampleLesson = [
    'React Hooks allow function components to use state and lifecycle features without writing classes.',
    'The most common hooks are useState and useEffect.',
    'useState returns a state variable and a setter function; calling the setter schedules a re-render.',
    'useEffect runs side effects after render; you can control when it runs by specifying a dependency array.',
    'Custom hooks extract reusable logic that can be shared across components.',
    'Hook rules: only call hooks at the top level (not inside loops/conditions), and only call hooks from React functions.',
  ].join('\n\n');

  const ai = createAIService();
  const summary = await ai.generateSummary(sampleLesson);

  console.log('--- AI SUMMARY (React Hooks sample) ---');
  console.log(summary);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('verify-ai failed:', err && err.message ? err.message : err);
      process.exit(1);
    });
}

module.exports = { main };
