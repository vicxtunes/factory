import "server-only";

// Production wired to this app's store. Pages and actions import from here.

import { factoryStore } from "./adapters/factory/store";
import { createMoneyWeOwe, createUsage } from "./service";

export const production = factoryStore;
export const moneyWeOwe = createMoneyWeOwe(factoryStore);
export const usage = createUsage(factoryStore);
