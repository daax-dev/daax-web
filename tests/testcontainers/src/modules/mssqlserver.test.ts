import { MSSQLServerContainer } from "@testcontainers/mssqlserver";
import { smokeTest } from "../helper";

smokeTest("mssqlserver", "starts mssql/server:2022-CU13-ubuntu-22.04", () =>
  new MSSQLServerContainer(
    "mcr.microsoft.com/mssql/server:2022-CU13-ubuntu-22.04",
  ).acceptLicense(),
);
