#!/usr/bin/env tsx
import { closeDbFlowDatabase, runPendingMigrations } from "./db-flow";

async function main() {
  const result = await runPendingMigrations();

  if (result.adoptedExisting.length > 0) {
    console.log(`db:migrate: adopted existing baseline schema for ${result.adoptedExisting.join(", ")}`);
  }

  if (result.executed.length > 0) {
    console.log(`db:migrate: applied ${result.executed.length} migration(s): ${result.executed.join(", ")}`);
    return;
  }

  console.log(`db:migrate: ${result.type} schema already up to date`);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbFlowDatabase();
  });
