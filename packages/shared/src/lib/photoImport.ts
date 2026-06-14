export interface ImportedPhoto {
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
  displayName?: string;
  importId?: string;
  normalizedPath?: string;
  contentHash?: string;
}

export type DuplicateKind = "path" | "content";

export function mergeImportedPhotos(
  current: ImportedPhoto[],
  selected: Set<number>,
  incoming: ImportedPhoto[]
) {
  const photos = [...current, ...incoming];
  const nextSelected = new Set(selected);
  incoming.forEach((_, index) => nextSelected.add(current.length + index));
  return { photos, selected: nextSelected };
}

export function createDropReviewSession(key: number, paths: string[]) {
  return { key: key + 1, paths };
}

export function consumeDropReviewPaths(consumedSessions: Set<number>, sessionKey: number, paths: string[]) {
  if (consumedSessions.has(sessionKey)) return [];
  consumedSessions.add(sessionKey);
  return paths;
}

export function clearDuplicateAnalysis(photos: ImportedPhoto[]) {
  return photos.map(({ normalizedPath: _normalizedPath, contentHash: _contentHash, ...photo }) => photo);
}

export function toggleSelectedIndex(selected: Set<number>, index: number) {
  const nextSelected = new Set(selected);
  nextSelected.has(index) ? nextSelected.delete(index) : nextSelected.add(index);
  return {
    selected: nextSelected,
    focusedIndex: nextSelected.has(index) ? index : (nextSelected.values().next().value ?? null),
  };
}

function filename(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export function photoSortName(photo: Pick<ImportedPhoto, "originalPath" | "displayName">) {
  return photo.displayName ?? filename(photo.originalPath);
}

export function arrangePhotosByFilename(photos: ImportedPhoto[], selected: Set<number>) {
  const selectedPhotos = new Set([...selected].map((index) => photos[index]));
  const arranged = [...photos].sort((a, b) =>
    photoSortName(a).localeCompare(photoSortName(b), undefined, { sensitivity: "base" })
  );
  return {
    photos: arranged,
    selected: new Set(arranged.flatMap((photo, index) => selectedPhotos.has(photo) ? [index] : [])),
  };
}

export function arrangeSelectedPhotosByFilename<T extends { id: string; originalPath: string }>(
  photos: T[],
  selectedIds: Set<string>
) {
  const selectedPhotos = photos
    .filter((photo) => selectedIds.has(photo.id))
    .sort((a, b) => filename(a.originalPath).localeCompare(filename(b.originalPath), undefined, { sensitivity: "base" }));

  let selectedIndex = 0;
  return photos.map((photo) => {
    if (!selectedIds.has(photo.id)) return photo;
    const nextPhoto = selectedPhotos[selectedIndex];
    selectedIndex += 1;
    return nextPhoto;
  });
}

export function getDuplicateIndexes(photos: ImportedPhoto[], index: number, kind: DuplicateKind) {
  const photo = photos[index];
  const value = kind === "path" ? photo?.normalizedPath : photo?.contentHash;
  if (!value) return [];

  return photos.flatMap((candidate, candidateIndex) => {
    const candidateValue = kind === "path" ? candidate.normalizedPath : candidate.contentHash;
    return candidateIndex !== index && candidateValue === value ? [candidateIndex] : [];
  });
}

export function removeOtherDuplicates(
  photos: ImportedPhoto[],
  selected: Set<number>,
  index: number,
  kind: DuplicateKind
) {
  const indexesToRemove = new Set(getDuplicateIndexes(photos, index, kind));
  const keptOriginalIndexes = photos.flatMap((_, originalIndex) =>
    indexesToRemove.has(originalIndex) ? [] : [originalIndex]
  );
  return {
    photos: keptOriginalIndexes.map((originalIndex) => photos[originalIndex]),
    selected: new Set(keptOriginalIndexes.flatMap((originalIndex, nextIndex) =>
      selected.has(originalIndex) ? [nextIndex] : []
    )),
  };
}

export function createBrowserImportFingerprint(file: Pick<File, "name" | "size" | "lastModified">) {
  return `${file.name.toLowerCase()}|${file.size}|${file.lastModified}`;
}

export function revokeImportedPhotoThumb(photo: Pick<ImportedPhoto, "thumbPath">) {
  if (photo.thumbPath.startsWith("blob:")) {
    URL.revokeObjectURL(photo.thumbPath);
  }
}

export function revokeImportedPhotoThumbs(photos: Pick<ImportedPhoto, "thumbPath">[]) {
  photos.forEach(revokeImportedPhotoThumb);
}
