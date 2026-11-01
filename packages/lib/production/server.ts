import "server-only";

// Production wired to this app's store. Pages and actions import from here.

import { factoryStore } from "./adapters/factory/store";
import { createMoneyWeOwe } from "./service";

export const production = factoryStore;
export const moneyWeOwe = createMoneyWeOwe(factoryStore);
