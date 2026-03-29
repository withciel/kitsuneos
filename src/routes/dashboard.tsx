import { AppSchema } from "@/lib/appSchema";
import { authMiddleware } from "@/lib/auth";
import { storageStats } from "@/lib/storage";
import Dashboard from "@/pages/Dashboard";
import { Hono } from "hono";

export const dashboard = new Hono<AppSchema>().basePath('/dashboard');

dashboard.use(authMiddleware);
dashboard.get('/', async (
  c,
) => {
  return c.render(
    <Dashboard c={c} />,
  );
});
