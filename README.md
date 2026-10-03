# Private W Desk — Local AI Agent Lab

v0.3.0 focuses on one question: can a 0.5B local language model become a useful phone-side agent?

## Agent architecture

- Qwen2.5 0.5B: planner / reasoning / tool router
- Whisper Tiny: speech-to-text skill
- MediaPipe: face / hand / gesture / pose sensing
- SmolVLM 256M: image understanding
- Browser APIs: actual tools and storage
- IndexedDB: tasks and persistent Agent execution logs

## Agent loop

User goal → Qwen selects one tool → tool executes → result returns to Qwen → Qwen chooses the next step → finish or stop at 6 steps.

## Main UI

- Agent
- Skills
- Tasks
- Logs
- Models

The browser-specific demos remain implementation details rather than primary navigation.
