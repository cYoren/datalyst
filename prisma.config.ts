import { defineConfig } from "prisma/config";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file with explicit path
dotenv.config({ path: path.resolve(__dirname, ".env") });

console.log("DATABASE_URL loaded:", process.env.DATABASE_URL ? "Yes" : "No");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
