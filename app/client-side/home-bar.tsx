"use client";

import { HomeBar } from "@/components/ui/HomeBar";

import { logoutClient } from "./actions";

// Client portal: the four places clients live in (Dashboard, Orders,
// Showroom, Support); placing an order, history and payment details are
// occasional, so they sit under "more".
export function ClientHomeBar() {
  return (
    <HomeBar
      tabs={[
        { href: "/client-side", label: "Dashboard", icon: "dashboard", exact: true },
        { href: "/client-side/orders", label: "Orders", icon: "orders" },
        { href: "/client-side/showroom", label: "Showroom", icon: "showroom" },
        { href: "/support", label: "Support", icon: "support" },
      ]}
      more={[
        { href: "/chat", label: "Chat", icon: "chat" },
        { href: "/client-side/new", label: "Place Order", icon: "placeOrder" },
        { href: "/client-side/history", label: "History", icon: "history" },
        { href: "/client-side/payment", label: "Payment", icon: "payment" },
      ]}
      logout={logoutClient}
      afterLogout="/client-side"
    />
  );
}
