import type { JwtVariables } from 'hono/jwt';

interface Bindings extends CloudflareBindings {
  BASE_PATH: string;

  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;

  ADMIN_API_KEY?: string;

  STORAGE_KEY: string;
}

export type AppSchema = { Bindings: Bindings; Variables: JwtVariables }

export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }

export type UploadResponse = {
  id: string;
  url: string;
}
