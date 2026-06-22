# Documentation Index

Use this folder when you want to understand the game beyond the top-level README.

## Recommended Reading Order

1. [Player Guide](player-guide.md)  
   How to play the game and understand the UI.

2. [Game Systems](game-systems.md)  
   How demand, inventory, perishability, khata, marketing, and scoring work.

3. [Architecture](architecture.md)  
   How the frontend, backend, SQLite database, sessions, and simulation modules fit together.

4. [AI Arena](ai-arena.md)  
   How LLMs and heuristic agents can play full 30-day runs through JSON observations and actions.

5. [AI Day Record](ai-day-record.md)
   Day-level replay and analysis schema for previous environment, prediction, AI action, actual result, reward, and full state variables.

6. [AI Arena Engineering and Vision](kirana-ai-arena-engineering-vision.adoc)
   Standalone AsciiDoc context for the game vision, simulation design, backend architecture, AI day record, state model, and replay frontend direction.

7. [AI Arena Game UI Implementation](ai-arena-game-ui-implementation.md)
   Implementation contract for the displayable Phaser-powered AI Arena replay UI.

8. [AI Model Performance Ledger](ai-model-performance.md)
   Saved benchmark results for LLM arena runs, including model settings, scores, latency, and service rates.

9. [API Reference](api-reference.md)
   REST endpoints, player sessions, run APIs, AI replay APIs, OpenEnv APIs, and common errors.

10. [Deployment](deployment.md)
   Local development, production service shape, current GCP VM setup, and update flow.

11. [Glossary](glossary.md)
   Short definitions for gameplay and technical terms.

## Historical Planning Documents

These are still useful for design intent, but the current source of truth is the documentation above plus the code.

- [Case Simulator Architecture](case-simulator-architecture.md)
- [Backend, Database, Marketing, and AI Players Plan](kirana-backend-ai-marketing-plan.md)
- [UI Mockup HTML](ui-mockups/kirana-gameplay-sections.html)
