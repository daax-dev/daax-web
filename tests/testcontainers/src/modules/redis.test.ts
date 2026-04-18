import { RedisContainer } from "@testcontainers/redis";
import { smokeTest } from "../helper";

smokeTest("redis", "starts redis:8.6", () => new RedisContainer("redis:8.6"));
