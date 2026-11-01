import "server-only";

// The discount service wired to this app's store. Actions and other modules'
// server code (placing an order with a promo code) import from here.

import { factoryStore } from "./adapters/factory/store";
import { DiscountService } from "./service";

export const discounts = new DiscountService(factoryStore);
