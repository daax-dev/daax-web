import { OracleDbContainer } from "@testcontainers/oraclefree";
import { smokeTest } from "../helper";

// Oracle Free image is multi-gigabyte; first pull may dominate matrix runtime.
smokeTest(
  "oraclefree",
  "starts gvenzl/oracle-free:23.26.1-slim-faststart",
  () => new OracleDbContainer("gvenzl/oracle-free:23.26.1-slim-faststart"),
);
