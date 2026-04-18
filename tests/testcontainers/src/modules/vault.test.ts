import { VaultContainer } from "@testcontainers/vault";
import { smokeTest } from "../helper";

smokeTest("vault", "starts hashicorp/vault:1.21.4", () => new VaultContainer("hashicorp/vault:1.21.4"));
