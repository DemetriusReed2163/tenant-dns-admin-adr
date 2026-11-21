import { z } from "zod";
import { InfraiDnsClient } from "./infrai_dns_client.ts";

const onboardingSchema = z.object({
  tenantId: z.string().min(1),
  domain: z.string().min(1),
  accountId: z.string().min(1),
  verificationToken: z.string().min(1)
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export function planTenantDns(input: OnboardingInput) {
  const value = onboardingSchema.parse(input);
  return {
    tenantId: value.tenantId,
    domain: value.domain,
    records: [
      { record_type: "TXT" as const, name: value.domain, content: value.verificationToken },
      { record_type: "MX" as const, name: value.domain, content: `mail.${value.domain}`, priority: 10 }
    ]
  };
}

export async function onboardTenant(input: OnboardingInput, client = new InfraiDnsClient()) {
  const plan = planTenantDns(input);
  const domain = await client.addDomain(input.domain, input.accountId) as { zone_id: string };
  const records = [];
  for (const record of plan.records) {
    records.push(await client.upsertRecord({ zone_id: domain.zone_id, name: record.name ?? input.domain, content: record.content, record_type: record.record_type, ...(record.priority ? { priority: record.priority } : {}) }));
  }
  return { tenantId: plan.tenantId, zone_id: domain.zone_id, records };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const input = {
    tenantId: required("TENANT_ID"),
    domain: required("DOMAIN"),
    accountId: required("ACCOUNT_ID"),
    verificationToken: required("VERIFICATION_TOKEN")
  };
  onboardTenant(input).then((result) => console.log(JSON.stringify(result, null, 2)));
}
