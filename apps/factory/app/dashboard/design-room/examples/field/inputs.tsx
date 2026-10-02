import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";

export default function FieldInputs() {
  return (
    <div className="grid max-w-md gap-4">
      <Field label="Client name">
        <TextInput placeholder="e.g. Nakato Sarah" />
      </Field>
      <Field label="Quantity" hint="Pieces, not boxes.">
        <TextInput type="number" defaultValue={50} />
      </Field>
      <Field label="Finish">
        <Select defaultValue="matte">
          <option value="matte">Matte</option>
          <option value="gloss">Gloss</option>
        </Select>
      </Field>
      <Field label="Notes">
        <TextArea placeholder="Anything the factory should know" />
      </Field>
    </div>
  );
}
