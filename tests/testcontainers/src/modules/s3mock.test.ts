import { S3MockContainer } from "@testcontainers/s3mock";
import { smokeTest } from "../helper";

smokeTest(
  "s3mock",
  "starts adobe/s3mock:4.12.2",
  () => new S3MockContainer("adobe/s3mock:4.12.2"),
);
