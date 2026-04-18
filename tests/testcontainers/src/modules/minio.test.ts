import { MinioContainer } from "@testcontainers/minio";
import { smokeTest } from "../helper";

smokeTest(
  "minio",
  "starts minio/minio:RELEASE.2024-12-13T22-19-12Z",
  () => new MinioContainer("minio/minio:RELEASE.2024-12-13T22-19-12Z"),
);
