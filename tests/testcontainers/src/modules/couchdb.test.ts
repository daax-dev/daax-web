import { CouchDBContainer } from "@testcontainers/couchdb";
import { smokeTest } from "../helper";

smokeTest("couchdb", "starts couchdb:3.5", () => new CouchDBContainer("couchdb:3.5"));
