import "server-only";

import { v2 as cloudinary } from "cloudinary";

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudinary isn't configured yet. Set CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
    this.name = "CloudinaryNotConfiguredError";
  }
}

export function cloudinaryEnv(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new CloudinaryNotConfiguredError();
  return { cloudName, apiKey, apiSecret };
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };
