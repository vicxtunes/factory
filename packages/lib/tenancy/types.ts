// The tenant a request acts for, and how that tenant's money and dates are
// shown. Pure; safe on client and server. Every tenant-aware module takes a
// TenantScope instead of reading tenancy itself (see ./README.md).

export interface TenantScope {
  tenantId: string;
  /** ISO 4217, e.g. "UGX". Amounts are whole units of this currency. */
  currency: string;
  /** BCP 47, e.g. "en-UG". */
  locale: string;
  /** IANA zone, e.g. "Africa/Kampala"; decides where a day or month starts. */
  timeZone: string;
}
