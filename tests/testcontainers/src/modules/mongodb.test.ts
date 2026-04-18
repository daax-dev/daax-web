import { MongoDBContainer } from "@testcontainers/mongodb";
import { smokeTest } from "../helper";

smokeTest("mongodb", "starts mongo:8.2.6", () => new MongoDBContainer("mongo:8.2.6"));
