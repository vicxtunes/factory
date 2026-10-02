import { Popover } from "@/components/ui/Popover";

export default function PopoverBasic() {
  return (
    <Popover label="Filters">
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked /> Express only
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" /> Delayed only
        </label>
      </div>
    </Popover>
  );
}
