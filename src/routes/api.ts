import { AppSchema, ApiResponse, UploadResponse } from "@/lib/appSchema";
import { storageStats, upload } from "@/lib/storage";
import { Hono } from "hono";

const fallbackStats = {
  usedBytes: 0,
  limitBytes: 1,
  usedPercent: 0,
};

export const api = new Hono<AppSchema>().basePath('/api')

api.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const id = typeof body.id === 'string' ? body.id : '';
  const file = body.file as File;

  if (!id.trim()) {
    c.status(400);
    return c.json<ApiResponse>({
      success: false,
      error: 'Please provide an ID for this file.',
    });
  }

  if (!file) {
    c.status(400);
    return c.json<ApiResponse>({
      success: false,
      error: 'Please choose a file before uploading.',
    });
  }

  const stats = await storageStats(c.env.STORAGE_KEY).catch(
    () => fallbackStats,
  );
  if (stats.usedBytes + file.size > stats.limitBytes) {
    c.status(400);
    return c.json<ApiResponse>({
      success: false,
      error: 'Upload exceeds your remaining storage quota.',
    });
  }

  const response = await upload(c.env.STORAGE_KEY, file).catch(() => null);

  if (!response?.url) {
    c.status(500);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to upload file. Please try again.',
    });
  }

  await c.env.db.put(id.trim(), response.url);

  return c.json<ApiResponse<UploadResponse>>({
    success: true,
    data: {
      id: id.trim(),
      url: response.url,
    },
  });
});
