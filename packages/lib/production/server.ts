import "server-only";

// Production wired to this app's store. Pages and actions import from here.

import { factoryStore } from "./adapters/factory/store";

export const production = factoryStore;
