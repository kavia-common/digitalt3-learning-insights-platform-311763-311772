#!/bin/bash
cd /home/kavia/workspace/code-generation/digitalt3-learning-insights-platform-311763-311772/lms_backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

