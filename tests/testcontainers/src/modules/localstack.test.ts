import { LocalstackContainer } from "@testcontainers/localstack";
import { smokeTest } from "../helper";

smokeTest(
  "localstack",
  "starts localstack/localstack:4.14.0",
  () => new LocalstackContainer("localstack/localstack:4.14.0"),
);
