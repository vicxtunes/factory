import { studioInitials } from "@repo/lib/studios/core";
import { vendors } from "@repo/lib/vendors/server";

import { VendorFrame } from "../../frame";
import { requireVendor } from "../../vendor";
import { EditProfileForm } from "./edit-profile-form";
import { PicturePicker } from "./picture-picker";

export const metadata = { title: "Edit profile" };

export default async function EditVendorProfilePage() {
  const { vendor } = await requireVendor();
  const [photoUrl, coverUrl] = await Promise.all([vendors.pictureUrl(vendor.photoKey), vendors.pictureUrl(vendor.coverKey)]);
  return (
    <VendorFrame vendor={vendor} page="profile">
      <EditProfileForm vendor={vendor} pictures={<PicturePicker photoUrl={photoUrl} coverUrl={coverUrl} initials={studioInitials(vendor.name)} />} />
    </VendorFrame>
  );
}
