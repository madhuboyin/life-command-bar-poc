import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { fail } from "../utils/api-response";

export const healthRouter = Router();

const REQUIRED_TABLES = [
  "users",
  "obligations",
  "reminders",
  "feedback_events",
  "audit_events",
  "resolution_runs"
];

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const tableRows = await prisma.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
    `);

    const foundTables = new Set(tableRows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((tableName) => !foundTables.has(tableName));

    if (missingTables.length > 0) {
      return fail(res, "SERVICE_UNAVAILABLE", "Database schema is not ready", 503, {
        missingTables
      });
    }

    return res.json({
      success: true,
      data: {
        ok: true,
        service: "api",
        database: {
          ok: true,
          schemaReady: true
        }
      }
    });
  } catch (error) {
    console.error("[health] Database check failed", error);
    return fail(res, "SERVICE_UNAVAILABLE", "Database unavailable", 503);
  }
});
