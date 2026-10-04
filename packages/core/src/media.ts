const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

export function extnameLower(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXT.has(extnameLower(filePath));
}

export function imageMimeType(filePath: string): string | null {
  const ext = extnameLower(filePath);
  return MIME[ext] ?? null;
}
