import { describe, expect, it } from "vitest";
import {
  arrangePhotosByFilename,
  clearDuplicateAnalysis,
  createBrowserImportFingerprint,
  createDropReviewSession,
  consumeDropReviewPaths,
  arrangeSelectedPhotosByFilename,
  getDuplicateIndexes,
  mergeImportedPhotos,
  removeOtherDuplicates,
  toggleSelectedIndex,
} from "../lib/photoImport";

describe("mergeImportedPhotos", () => {
  it("appends imported photos and selects the new indexes", () => {
    const current = [{ originalPath: "a.jpg", thumbPath: "a-thumb.jpg", width: 100, height: 100 }];
    const selected = new Set([0]);
    const incoming = [
      { originalPath: "b.jpg", thumbPath: "b-thumb.jpg", width: 200, height: 100 },
      { originalPath: "c.jpg", thumbPath: "c-thumb.jpg", width: 100, height: 200 },
    ];

    const result = mergeImportedPhotos(current, selected, incoming);

    expect(result.photos.map((photo) => photo.originalPath)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect([...result.selected]).toEqual([0, 1, 2]);
  });
});

describe("createDropReviewSession", () => {
  it("increments the session key so a native drop remounts a fresh review modal", () => {
    expect(createDropReviewSession(3, ["new.jpg"])).toEqual({
      key: 4,
      paths: ["new.jpg"],
    });
  });
});

describe("consumeDropReviewPaths", () => {
  it("returns dropped paths only once per session key", () => {
    const consumedSessions = new Set<number>();

    expect(consumeDropReviewPaths(consumedSessions, 4, ["a.jpg", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
    expect(consumeDropReviewPaths(consumedSessions, 4, ["a.jpg", "b.jpg"])).toEqual([]);
  });
});

describe("arrangePhotosByFilename", () => {
  it("sorts by filename only and preserves selected photos", () => {
    const photos = [
      { originalPath: "D:\\z\\Bravo.jpg", thumbPath: "b-thumb.jpg", width: 100, height: 100 },
      { originalPath: "C:\\a\\alpha.jpg", thumbPath: "a-thumb.jpg", width: 100, height: 100 },
      { originalPath: "C:\\a\\charlie.jpg", thumbPath: "c-thumb.jpg", width: 100, height: 100 },
    ];

    const result = arrangePhotosByFilename(photos, new Set([0, 2]));

    expect(result.photos.map((photo) => photo.originalPath)).toEqual([
      "C:\\a\\alpha.jpg",
      "D:\\z\\Bravo.jpg",
      "C:\\a\\charlie.jpg",
    ]);
    expect([...result.selected]).toEqual([1, 2]);
  });

  it("prefers display names when present", () => {
    const photos = [
      { originalPath: "blob:one", displayName: "Zebra.jpg", thumbPath: "z.jpg", width: 100, height: 100 },
      { originalPath: "blob:two", displayName: "alpha.jpg", thumbPath: "a.jpg", width: 100, height: 100 },
    ];

    const result = arrangePhotosByFilename(photos, new Set([0]));

    expect(result.photos.map((photo) => photo.displayName)).toEqual(["alpha.jpg", "Zebra.jpg"]);
    expect([...result.selected]).toEqual([1]);
  });
});

describe("arrangeSelectedPhotosByFilename", () => {
  it("sorts only selected photos within their existing timeline slots", () => {
    const photos = [
      { id: "1", originalPath: "C:\\photos\\z.jpg", thumbPath: "1.jpg" },
      { id: "2", originalPath: "C:\\photos\\Charlie.jpg", thumbPath: "2.jpg" },
      { id: "3", originalPath: "C:\\photos\\a.jpg", thumbPath: "3.jpg" },
      { id: "4", originalPath: "C:\\photos\\bravo.jpg", thumbPath: "4.jpg" },
    ];

    const result = arrangeSelectedPhotosByFilename(photos, new Set(["2", "4"]));

    expect(result.map((photo) => photo.id)).toEqual(["1", "4", "3", "2"]);
  });
});

describe("duplicate review", () => {
  const photos = [
    { originalPath: "C:\\photos\\one.jpg", thumbPath: "one-a.jpg", width: 100, height: 100, normalizedPath: "c:\\photos\\one.jpg", contentHash: "aaa" },
    { originalPath: "C:\\PHOTOS\\one.jpg", thumbPath: "one-b.jpg", width: 100, height: 100, normalizedPath: "c:\\photos\\one.jpg", contentHash: "aaa" },
    { originalPath: "D:\\copies\\copy.jpg", thumbPath: "copy.jpg", width: 100, height: 100, normalizedPath: "d:\\copies\\copy.jpg", contentHash: "aaa" },
    { originalPath: "D:\\photos\\two.jpg", thumbPath: "two.jpg", width: 100, height: 100, normalizedPath: "d:\\photos\\two.jpg", contentHash: "bbb" },
  ];

  it("reports path and content duplicate siblings separately", () => {
    expect(getDuplicateIndexes(photos, 0, "path")).toEqual([1]);
    expect(getDuplicateIndexes(photos, 0, "content")).toEqual([1, 2]);
  });

  it("removes only the selected photo's other path duplicates", () => {
    const result = removeOtherDuplicates(photos, new Set([0, 1, 2, 3]), 0, "path");

    expect(result.photos.map((photo) => photo.originalPath)).toEqual([
      "C:\\photos\\one.jpg",
      "D:\\copies\\copy.jpg",
      "D:\\photos\\two.jpg",
    ]);
    expect([...result.selected]).toEqual([0, 1, 2]);
  });

  it("removes only the selected photo's other content duplicates", () => {
    const result = removeOtherDuplicates(photos, new Set([0, 1, 2, 3]), 0, "content");

    expect(result.photos.map((photo) => photo.originalPath)).toEqual([
      "C:\\photos\\one.jpg",
      "D:\\photos\\two.jpg",
    ]);
    expect([...result.selected]).toEqual([0, 1]);
  });

  it("clears stale analysis when more files are appended", () => {
    expect(clearDuplicateAnalysis(photos)[0]).toEqual({
      originalPath: "C:\\photos\\one.jpg",
      thumbPath: "one-a.jpg",
      width: 100,
      height: 100,
    });
  });
});

describe("toggleSelectedIndex", () => {
  it("clears focus when the final selected photo is deselected", () => {
    expect(toggleSelectedIndex(new Set([2]), 2)).toEqual({
      selected: new Set(),
      focusedIndex: null,
    });
  });

  it("focuses another selected photo after deselecting the current one", () => {
    expect(toggleSelectedIndex(new Set([1, 2]), 2)).toEqual({
      selected: new Set([1]),
      focusedIndex: 1,
    });
  });
});

describe("createBrowserImportFingerprint", () => {
  it("builds a stable metadata fingerprint from browser file attributes", () => {
    expect(createBrowserImportFingerprint({ name: "IMG_001.JPG", size: 1234, lastModified: 4567 })).toBe(
      "img_001.jpg|1234|4567"
    );
  });
});
