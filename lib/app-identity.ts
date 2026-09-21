import "server-only";

import { headers } from "next/headers";

// The site is one app served on two hosts (see proxy.ts), and each is
// installed to the home screen as its own PWA: "AMING Client" from client.*,
// "AMING" (the factory/staff app) from everywhere else.
export interface AppIdentity {
  id: string;
  name: string;
  shortName: string;
  description: string;
}

const CLIENT: AppIdentity = {
  id: "/client",
  name: "AMING Client",
  shortName: "AMING Client",
  description: "Browse the showroom, place orders and track them to delivery.",
};

const FACTORY: AppIdentity = {
  id: "/factory",
  name: "AMING",
  shortName: "AMING",
  description: "Internal production tracking for the print factory.",
};

export async function getAppIdentity(): Promise<AppIdentity> {
  const host = (await headers()).get("host") ?? "";
  return /^client\./i.test(host) ? CLIENT : FACTORY;
}
