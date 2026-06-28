const scripts = [
  "/shared/runtime.js",
  "/features/dashboard/dashboard.js",
  "/features/users/users.js",
  "/features/customers/customers.js",
  "/features/products/products.js",
  "/features/plans/plans.js",
  "/features/billing/billing.js",
  "/features/support/support.js",
  "/features/usage/usage.js",
  "/features/reports/reports.js",
  "/features/audit/audit.js",
  "/features/health/health.js",
  "/app.js",
];

export default function LegacyPortalPage() {
  return (
    <>
      <div id="legacy-portal-root" suppressHydrationWarning />
      {scripts.map((src, index) => (
        <script key={src} src={src} defer data-order={index} />
      ))}
    </>
  );
}
