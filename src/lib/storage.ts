interface UploadResponse {
  "id": string,
  "filename": string,
  "size": number,
  "content_type": string,
  "url": string,
  "created_at": string
}

export async function upload(apiSecret: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://cdn.hackclub.com/api/v4/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiSecret}` },
    body: formData
  });

  return await response.json() as UploadResponse;
}

interface StorageApiResponse {
  storage_used: number;
  storage_limit: number;
}

export interface StorageStats {
  usedBytes: number;
  limitBytes: number;
  usedPercent: number;
}

export async function storageStats(apiSecret: string): Promise<StorageStats> {
  const response = await fetch('https://cdn.hackclub.com/api/v4/me', {
    headers: { 'Authorization': `Bearer ${apiSecret}` }
  }).then(res => res.json()) as StorageApiResponse;

  const usedBytes = Number.isFinite(response.storage_used) ? response.storage_used : 0;
  const limitBytes = Number.isFinite(response.storage_limit) && response.storage_limit > 0
    ? response.storage_limit
    : 1;

  return {
    usedBytes,
    limitBytes,
    usedPercent: (usedBytes / limitBytes) * 100,
  };
}

export async function storageUsage(apiSecret: string) {
  const stats = await storageStats(apiSecret);
  return stats.usedPercent;
}
