import { KurrentDbContainer } from "@testcontainers/kurrentdb";
import { smokeTest } from "../helper";

smokeTest(
  "kurrentdb",
  "starts kurrentplatform/kurrentdb:26.0",
  () => new KurrentDbContainer("kurrentplatform/kurrentdb:26.0"),
);
