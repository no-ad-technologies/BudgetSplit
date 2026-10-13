import "dotenv/config";
import { createDb } from "../src/db.ts";
import { seedDemo } from "../src/dev/seed.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to seed");

const db = createDb(url);
try {
  await seedDemo(db);
  console.log("Seeded demo group: Maple St House (Maya, Josh, Priya, Sam) + Riley (not a member).");
} finally {
  await db.$disconnect();
}
