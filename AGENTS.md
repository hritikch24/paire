# Instructions for AI agents

Read [`CLAUDE.md`](CLAUDE.md) before doing anything. In short:

- **Web only for now.** Don't change Android or iOS (native folders, native config, store billing, native E2E, APK/AAB builds).
- **Log every web change** in [`docs/web-changes.md`](docs/web-changes.md): date, commit hash, summary, deploy status.
- **Nothing deploys on push.** Deploy only when the owner asks.
- Payments, presence and paid chat are behind switches that are off: read `docs/presence-and-paid-chat.md` first.
