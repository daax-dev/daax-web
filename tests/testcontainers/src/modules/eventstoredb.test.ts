/**
 * Deprecated: EventStoreDB was renamed to KurrentDB. This module is pinned to
 * testcontainers@10.28.0 (two majors behind core 11.x) and is expected to be
 * removed upstream. Retained here so the matrix shows it still installs and,
 * where the engine still boots, starts correctly.
 */
import { EventStoreDBContainer } from "@testcontainers/eventstoredb";
import { smokeTest } from "../helper";

smokeTest(
  "eventstoredb",
  "starts deprecated eventstoredb image (superseded by kurrentdb)",
  () => new EventStoreDBContainer(),
);
