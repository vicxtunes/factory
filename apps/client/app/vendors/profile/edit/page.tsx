import { VendorFrame } from "../../frame";
import { requireVendor } from "../../vendor";
import { EditProfileForm } from "./edit-profile-form";

export const metadata = { title: "Edit profile" };

export default async function EditVendorProfilePage() {
  const { vendor } = await requireVendor();
  return (
    <VendorFrame vendor={vendor} page="profile">
      <EditProfileForm vendor={vendor} />
    </VendorFrame>
  );
}
