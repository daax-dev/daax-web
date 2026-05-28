import { PubSubEmulatorContainer } from "@testcontainers/gcloud";
import { smokeTest } from "../helper";

// gcloud exports six emulators; we smoke-test PubSubEmulator as the canonical one.
// Other emulators (BigQuery, Firestore, Datastore, CloudStorage, Spanner) share
// the same lifecycle and are covered in the matrix note in RESULTS.md.
smokeTest(
  "gcloud",
  "starts PubSubEmulator on cloud-sdk:563.0.0-emulators",
  () =>
    new PubSubEmulatorContainer(
      "gcr.io/google.com/cloudsdktool/google-cloud-cli:563.0.0-emulators",
    ),
);
