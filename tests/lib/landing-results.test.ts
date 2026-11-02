import { describe, expect, it } from "vitest";

import { loadLandingResults } from "@/lib/landing/results-media";
import {
  chatSources,
  landingAverageScore,
  landingCases,
  landingScoreYears,
  reviewSources,
} from "@/lib/landing/results";

describe("landing results", () => {
  it("publishes the given average and yearly scores", () => {
    expect(landingAverageScore).toBe(82);
    expect(landingScoreYears.map((group) => [group.year, [...group.scores]])).toEqual([
      [2025, [96, 92, 88, 86, 84, 84, 80, 80, 79, 77, 76, 74, 65, 61]],
      [2026, [98, 98, 96, 94, 94, 92, 90, 90, 86, 86, 84, 82, 79, 77, 74, 73, 68]],
    ]);
    expect(landingCases.map((item) => [item.name, item.result])).toEqual([
      ["Алиса", 98],
      ["Арина", 84],
      ["Соня", 71],
    ]);
  });

  it("prefers a numbered chat series and otherwise uses a single file", () => {
    expect(
      chatSources("case-messages", ["alisa-chat-02.jpg", "alisa-chat-01.webp"], "alisa-chat")
    ).toEqual([
      "/images/landing/case-messages/alisa-chat-01.webp",
      "/images/landing/case-messages/alisa-chat-02.jpg",
    ]);
    expect(chatSources("case-messages", ["alisa-chat.jpg"], "alisa-chat")).toEqual([
      "/images/landing/case-messages/alisa-chat.jpg",
    ]);
  });

  it("lists numbered reviews first and does not invent a role", () => {
    const reviews = reviewSources(
      ["review-02.png", "note.jpg", "review-01.jpg"],
      { "review-01.jpg": "parent" }
    );
    expect(reviews.map((item) => item.id)).toEqual([
      "review-01.jpg",
      "review-02.png",
      "note.jpg",
    ]);
    expect(reviews[0]?.role).toBe("parent");
    expect(reviews[1]?.role).toBeNull();
  });

  it("finds the photos, chats and reviews that are in the project", () => {
    const media = loadLandingResults();
    expect(media.cases.map((item) => item.photo)).toEqual([
      "/images/landing/students/alisa.png",
      "/images/landing/students/arina.png",
      "/images/landing/students/sonya.png",
    ]);
    expect(media.cases.map((item) => item.chats)).toEqual([
      ["/images/landing/case-messages/alisa-chat.jpg"],
      ["/images/landing/case-messages/arina-chat.jpg"],
      ["/images/landing/case-messages/sonya-chat.jpg"],
    ]);
    expect(media.reviews.map((item) => item.id)).toContain("review-01.jpg");
    expect(media.reviews.map((item) => item.id)).toContain("review-15.jpg");
    expect(media.reviews.every((item) => item.role === "student" || item.role === "parent" || item.role === null)).toBe(true);
  });
});
