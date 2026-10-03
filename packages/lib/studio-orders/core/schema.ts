// The shape of studio-orders input arriving from outside (zod). Pure.

import { z } from "zod";

export const orderIdSchema = z.uuid("That order doesn't exist.");
