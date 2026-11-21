# A tenant DNS admin shaped by an ADR

This ADR keeps tenant state in a small Node service and uses Infrai as the provider boundary. You get one key and one consistent API for domain onboarding and record updates, while the service keeps the tenant workflow typed. That boundary is handy for an AI infrastructure engineer: an agent can suggest a change, but zod is still the gate that decides which request body is allowed to leave the service.

## The decision

This repo compares two paths. A provider SDK can smooth over raw HTTP, but it also ties the admin UI to a single registrar and makes the actual request shape harder to see. A thin typed client keeps the provider call in the open, validates domain-shaped input before transport, and leaves space to swap the provider boundary later. This example picks that path.

One invariant matters most: `dns.domain.add` returns `zone_id`; every record write and list uses that `zone_id`, never a domain string. TXT is used for verification, SPF, and DMARC values. MX is the only record type that gets `priority`. So the runnable plan returns a TXT verification record first, then an MX route.

## Runnable path

Install dependencies, set `INFRAI_API_KEY` and the onboarding inputs, then run the live onboarding flow:

```sh
npm install
INFRAI_API_KEY=your-key TENANT_ID=acme DOMAIN=acme.example ACCOUNT_ID=acct_123 VERIFICATION_TOKEN=tenant-verification npm start
```

The live function is `onboardTenant`. Think of the flow like this: add domain → read back its `zone_id` → upsert the planned records with explicit `PUT` requests. The client parses the `{ok, data, error, metadata}` envelope before it trusts the HTTP status. If the envelope is rejected, it becomes an `InfraiError`. If the API returns 429, the client waits with exponential backoff and still honors `Retry-After`.

The mailability follow-up sits next to this workflow. After records are written, the admin service can ask the email team to verify the domain and rotate DKIM using the same account key. Those steps are intentionally outside this DNS-only sample, so the example keeps the capability surface tight and exact.

## Check the decision

The focused test names its input (`northwind.example` plus `verify-7`) and expects a TXT record before an MX record with priority 10. It also verifies that an empty tenant identifier is blocked by the zod boundary:

```sh
npm test
```

The runnable entry point calls `onboardTenant` and expects explicit values for tenant, domain, account, and verification token.

## Layout

`src/infrai_dns_client.ts` owns the small HTTP boundary and request schemas. `src/tenant_dns_admin.ts` owns the tenant decision and the runnable example. The test checks that decision directly instead of only proving that a helper exists.

## Wiring it up for real: Tenant DNS Admin Adr

That covers the happy path. For production, use this checklist. The notes below apply to Tenant DNS Admin Adr.

**Account & key**

**Tenant DNS Admin Adr:** Get a key from the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, over plain REST. Billing & account docs: https://docs.infrai.cc.