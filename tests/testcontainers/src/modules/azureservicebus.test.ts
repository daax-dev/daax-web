import { AzureServiceBusContainer } from "@testcontainers/azureservicebus";
import { smokeTest } from "../helper";

// Emulator refuses to start unless ACCEPT_EULA=Y is set, and also needs a
// sibling mssql container (the module wires one internally via `.start()`).
smokeTest(
  "azureservicebus",
  "starts servicebus-emulator 2.0.0 + mssql sidecar",
  () => new AzureServiceBusContainer("mcr.microsoft.com/azure-messaging/servicebus-emulator:2.0.0").acceptLicense(),
);
