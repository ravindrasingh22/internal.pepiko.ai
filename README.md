# internal-frontend

Internal operations frontend for `internal.pepiko.ai`.

Features:

- Customer management
- Customer account support
- Product management and publish status
- Plan/pricing management
- Billing operations
- Credit adjustments
- Enterprise custom pricing
- Support ticket workflow
- Usage/risk reports
- Internal audit logs
- System health

The app calls `/api/internal/*`. In Docker, nginx proxies those paths to `platform-core-service`.

Frontend code is organized by feature under `src/features/*`; see `src/ARCHITECTURE.md`.
