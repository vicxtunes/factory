import "server-only";

// Accounts wired to this app's data. Pages import from here; tests or another
// host build their own with createAccountingService(theirSource).

import { factorySource } from "./adapters/factory/source";
import { createAccountingService } from "./service";

export const accounting = createAccountingService(factorySource);

export { requireAccountsAccess } from "./access";
export type { CustomerAccountView, CustomerAccountsView, OverviewView, PeriodInput, SalesView } from "./service";
