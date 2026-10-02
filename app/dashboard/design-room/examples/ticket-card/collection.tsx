import { Button } from "@/components/ui/Button";
import { TicketCard } from "@/components/ui/TicketCard";

export default function TicketCardCollection() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <TicketCard
        code="ORD-0412"
        date="24/09/2026"
        eyebrow="Nakato Sarah"
        title="Photobook 12x12 Mat"
        status={{ label: "In production", tone: "info" }}
        amount="USh 65,000"
        actions={
          <>
            <Button variant="secondary">Pay</Button>
            <Button>View</Button>
          </>
        }
      />
      <TicketCard
        accent="green"
        code="ORD-0398"
        date="10/09/2026"
        eyebrow="Kampala Prints Ltd"
        title="A3 Posters × 200"
        status={{ label: "Ready", tone: "success" }}
        amount="USh 240,000"
        actions={<Button>View</Button>}
      />
      <TicketCard
        accent="yellow"
        code="ORD-0377"
        date="29/08/2026"
        eyebrow="Okello James"
        title="Wedding Album Deluxe"
        status={{ label: "Unpaid", tone: "warning" }}
        amount="USh 75,000"
        actions={<Button>View</Button>}
      />
      <TicketCard
        accent="pink"
        code="ORD-0351"
        date="10/08/2026"
        eyebrow="Trendsetters Collective"
        title="Packaging Boxes"
        status={{ label: "Collected", tone: "neutral" }}
        amount="USh 95,000"
        actions={<Button>View</Button>}
      />
    </div>
  );
}
