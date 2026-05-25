import { AzureCosmosDbEmulatorContainer } from "@testcontainers/azure-cosmosdb-emulator";
import { smokeTest } from "../helper";

smokeTest(
  "azure-cosmosdb-emulator",
  "starts cosmos emulator vnext-EN20250228",
  () =>
    new AzureCosmosDbEmulatorContainer(
      "mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-EN20250228",
    ),
);
