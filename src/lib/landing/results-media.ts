import fs from "node:fs";
import path from "node:path";

import {
  chatSources,
  landingCases,
  publicSrc,
  reviewSources,
  type LandingCaseMedia,
  type LandingReview,
} from "@/lib/landing/results";

const IMAGE_EXT = /\.(webp|jpe?g|png)$/i;

function listImages(folder: string): string[] {
  const dir = path.join(process.cwd(), "public", "images", "landing", folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => IMAGE_EXT.test(name));
}

export function loadLandingResults(): {
  cases: LandingCaseMedia[];
  reviews: LandingReview[];
} {
  const studentFiles = listImages("students");
  const chatFiles = listImages("case-messages");
  const reviewFiles = listImages("testimonials");
  return {
    cases: landingCases.map((item) => {
      const photoName = studentFiles.find((name) =>
        new RegExp(`^${item.id}\\.(webp|jpe?g|png)$`, "i").test(name)
      );
      return {
        ...item,
        photo: photoName ? publicSrc("students", photoName) : null,
        chats: chatSources("case-messages", chatFiles, `${item.id}-chat`),
      };
    }),
    reviews: reviewSources(reviewFiles),
  };
}
