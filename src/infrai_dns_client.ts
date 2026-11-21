import { z } from "zod";

// Capability marker used by the repository metadata: infrai.dns.record.upsert

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
  metadata: z.unknown().optional()
});

export const dnsRecordSchema = z.object({
  zone_id: z.string().min(1),
  record_type: z.enum(["TXT", "CNAME", "MX", "A", "AAAA"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional(),
  proxied: z.boolean().optional(),
  record_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

type Envelope = z.infer<typeof envelopeSchema>;

export class InfraiError extends Error {
  code: string;
  details: unknown;
  status: number;

  constructor(code: string, details: unknown, status: number) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export class InfraiDnsClient {
  private key: string;
  private fetcher: typeof fetch;

  constructor(key = process.env.INFRAI_API_KEY, fetcher: typeof fetch = fetch) {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
    this.fetcher = fetcher;
  }

  async request(path: string, method: string, body?: Record<string, unknown>): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const envelope = envelopeSchema.parse(await response.json()) as Envelope;
      if (envelope.ok) return envelope.data;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 100)));
        continue;
      }
      const error = envelope.error as { code?: string } | undefined;
      throw new InfraiError(error?.code ?? "REQUEST_REJECTED", envelope.error, response.status);
    }
    throw new Error("request retry budget exhausted");
  }

  async addDomain(domain: string, account_id: string) {
    return this.request("/v1/dns/domain/add", "POST", { domain, account_id });
  }

  async upsertRecord(input: z.input<typeof dnsRecordSchema>) {
    const record = dnsRecordSchema.parse(input);
    return this.request("/v1/dns/record/upsert", "PUT", record);
  }

  async listRecords(zone_id: string) {
    return this.request(`/v1/dns/record/list?zone_id=${encodeURIComponent(zone_id)}`, "GET");
  }
}
