import { Field } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";

export default function PasswordInputBasic() {
  return (
    <div className="max-w-xs">
      <Field label="PIN">
        <PasswordInput inputMode="numeric" defaultValue="1234" />
      </Field>
    </div>
  );
}
