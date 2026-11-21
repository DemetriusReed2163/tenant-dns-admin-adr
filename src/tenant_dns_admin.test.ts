import test from "node:test";
import assert from "node:assert/strict";
import { planTenantDns } from "./tenant_dns_admin.ts";

test("tenant onboarding plans TXT verification before the MX route", () => {
  const plan = planTenantDns({ tenantId: "northwind", domain: "northwind.example", accountId: "acct_7", verificationToken: "verify-7" });
  assert.deepEqual(plan.records, [
    { record_type: "TXT", name: "northwind.example", content: "verify-7" },
    { record_type: "MX", name: "northwind.example", content: "mail.northwind.example", priority: 10 }
  ]);
});

test("invalid tenant input is rejected at the request boundary", () => {
  assert.throws(() => planTenantDns({ tenantId: "", domain: "northwind.example", accountId: "acct_7", verificationToken: "verify-7" }));
});
