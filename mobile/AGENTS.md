# AGENTS.md - YourPrinter-Mobile

Guidelines and rules for AI agents working in this repository.

## Git Branching & Multi-Phase Workflow
1. **Feature Branches for Multi-Phase Efforts**:
   - For any multi-phase plan, substantial feature work, or refactoring, always create and work off a dedicated feature branch:
     ```bash
     git checkout -b feature/<descriptive-name>
     ```
   - Commit and test iterative phase milestones on the feature branch.
2. **Master Branch Protection & Releases**:
   - Every push to `master` automatically triggers CI to increment the app version by 0.0.1 and publish a new production release.
   - Do **not** push intermediate or incomplete phases directly to `master`.
   - Merge or PR feature branches into `master` only when all phases are complete, tests pass (100%), and functionality is verified.
