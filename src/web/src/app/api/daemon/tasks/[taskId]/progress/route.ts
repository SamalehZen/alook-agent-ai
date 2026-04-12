import { withAuth } from "@/lib/middleware/auth";
import { writeJSON } from "@/lib/middleware/helpers";

export const POST = withAuth(async () => {
  return writeJSON({ status: "ok" });
});
