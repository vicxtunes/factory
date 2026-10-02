import { InfoTip } from "@repo/ui/InfoTip";

export default function InfoTipBasic() {
  return (
    <p className="flex items-center gap-1 text-sm">
      Photobook 12x12 Mat
      <InfoTip label="About Photobook 12x12 Mat">Matte laminated pages, 20 sheets, hard cover.</InfoTip>
    </p>
  );
}
