"use client";

import { useEffect } from "react";

const scripts = [
  "/shared/runtime.js",
  "/features/dashboard/dashboard.js",
  "/features/users/users.js",
  "/features/customers/customers.js",
  "/features/products/products.js",
  "/features/plans/plans.js",
  "/features/kong/kong.js",
  "/features/billing/billing.js",
  "/features/support/support.js",
  "/features/usage/usage.js",
  "/features/reports/reports.js",
  "/features/audit/audit.js",
  "/features/health/health.js",
  "/app.js",
];

export default function LegacyPortalPage() {
  useEffect(() => {
    let cancelled = false;

    async function loadScript(src, index) {
      if (document.querySelector(`script[data-legacy-src="${src}"]`)) return;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.defer = true;
        script.dataset.legacySrc = src;
        script.dataset.order = String(index);
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }

    async function loadPortal() {
      for (let index = 0; index < scripts.length; index += 1) {
        if (cancelled) return;
        await loadScript(scripts[index], index);
      }
    }

    loadPortal().catch((error) => {
      console.error("Failed to load Pepiko portal scripts", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div id="legacy-portal-root" suppressHydrationWarning />;
}
