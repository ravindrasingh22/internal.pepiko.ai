# Internal Frontend Architecture

This portal uses a feature-based colocated structure.

```text
app.js                 Bootstrap only
shared/runtime.js      Shared state, API helper, shell, router, formatting helpers
features/
  dashboard/           Internal overview
  users/               Internal users and roles
  customers/           Customer account management
  products/            Product configuration
  plans/               Plans and pricing
  billing/             Billing operations
  support/             Ticket management
  usage/               Usage monitoring
  reports/             Risk reports
  audit/               Internal audit logs
  health/              System health
```

Keep new page logic inside the matching `features/<feature>/` folder. Shared helpers belong in `shared/runtime.js` only when multiple features use them.
