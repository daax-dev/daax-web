import { AzuriteContainer } from "@testcontainers/azurite";
import { smokeTest } from "../helper";

smokeTest(
  "azurite",
  "starts azurite:3.35.0",
  () => new AzuriteContainer("mcr.microsoft.com/azure-storage/azurite:3.35.0"),
);
