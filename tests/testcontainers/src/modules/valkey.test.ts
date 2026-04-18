import { ValkeyContainer } from "@testcontainers/valkey";
import { smokeTest } from "../helper";

smokeTest("valkey", "starts valkey/valkey:9.0", () => new ValkeyContainer("valkey/valkey:9.0"));
