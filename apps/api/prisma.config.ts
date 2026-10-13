import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma ORM 7 reads the connection string from here, not from schema.prisma.
// `prisma generate` doesn't need a database, so a placeholder keeps it working in CI and Docker builds.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
