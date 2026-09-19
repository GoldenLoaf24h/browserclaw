export interface MediaAssetEntry {
  filePath?: string;
  buffer?: Buffer;
  mimeType: string;
  fileName: string;
  createdAt?: number;
}

export const mediaAssetStore = new Map<string, MediaAssetEntry>();
