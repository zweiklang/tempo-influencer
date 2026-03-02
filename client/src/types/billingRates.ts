export interface BillingRatesResponse {
  projectDefaultRate: number | null;
  globalRates: Array<{ account?: { id: string; type: string }; rate: number }>;
  overrides: Array<{ account_id: string; billing_rate: number }>;
}
