# Test matrix — last run: 2026-04-18T17:02:50.211Z

**42/42 modules pass** (0 fail, 0 not run). Core pinned at `testcontainers@11.14.0`.

| Module | Package | Image | Core | Status | Notes |
|---|---|---|---|---|---|
| arangodb | `@testcontainers/arangodb@11.14.0` | `arangodb:3.12.8` | 11.14.0 | ✅ pass (5.0s) |  |
| azure-cosmosdb-emulator | `@testcontainers/azure-cosmosdb-emulator@11.14.0` | `mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-EN20250228` | 11.14.0 | ✅ pass (4.5s) | large image; slow first pull |
| azureservicebus | `@testcontainers/azureservicebus@11.14.0` | `mcr.microsoft.com/azure-messaging/servicebus-emulator:2.0.0` | 11.14.0 | ✅ pass (14.8s) | emulator wires sibling mssql container internally |
| azurite | `@testcontainers/azurite@11.14.0` | `mcr.microsoft.com/azure-storage/azurite:3.35.0` | 11.14.0 | ✅ pass (1.3s) |  |
| cassandra | `@testcontainers/cassandra@11.14.0` | `cassandra:5.0.7` | 11.14.0 | ✅ pass (5.4s) |  |
| chromadb | `@testcontainers/chromadb@11.14.0` | `chromadb/chroma:1.5.5` | 11.14.0 | ✅ pass (1.4s) |  |
| clickhouse | `@testcontainers/clickhouse@11.14.0` | `clickhouse/clickhouse-server:26.3-alpine` | 11.14.0 | ✅ pass (5.6s) |  |
| cockroachdb | `@testcontainers/cockroachdb@11.14.0` | `cockroachdb/cockroach:v26.1.1` | 11.14.0 | ✅ pass (3.0s) |  |
| couchbase | `@testcontainers/couchbase@11.14.0` | `couchbase/server:enterprise-8.0.1` | 11.14.0 | ✅ pass (10.5s) |  |
| couchdb | `@testcontainers/couchdb@11.14.0` | `couchdb:3.5` | 11.14.0 | ✅ pass (1.5s) |  |
| elasticsearch | `@testcontainers/elasticsearch@11.14.0` | `elasticsearch:9.3.2` | 11.14.0 | ✅ pass (17.7s) |  |
| etcd | `@testcontainers/etcd@11.14.0` | `quay.io/coreos/etcd:v3.6.10` | 11.14.0 | ✅ pass (0.9s) |  |
| eventstoredb | `@testcontainers/eventstoredb@10.28.0` | `eventstore/eventstore (module default)` | **10.28.0** ⚠ | ✅ pass (11.7s) | ⚠ **deprecated** — superseded by `kurrentdb`; pinned to core `10.28.0` (two majors behind current 11.14.0) |
| gcloud | `@testcontainers/gcloud@11.14.0` | `gcr.io/google.com/cloudsdktool/google-cloud-cli:563.0.0-emulators (PubSub)` | 11.14.0 | ✅ pass (1.9s) | exercises `PubSubEmulatorContainer` only; also exports BigQuery, CloudStorage, Datastore, Firestore, Spanner |
| hivemq | `@testcontainers/hivemq@11.14.0` | `hivemq/hivemq-ce:2025.5` | 11.14.0 | ✅ pass (1.6s) |  |
| k3s | `@testcontainers/k3s@11.14.0` | `rancher/k3s:v1.35.3-k3s1` | 11.14.0 | ✅ pass (13.3s) | needs privileged docker; works on Docker Desktop |
| kafka | `@testcontainers/kafka@11.14.0` | `confluentinc/cp-kafka:8.2.0` | 11.14.0 | ✅ pass (3.0s) |  |
| kurrentdb | `@testcontainers/kurrentdb@11.14.0` | `kurrentplatform/kurrentdb:26.0` | 11.14.0 | ✅ pass (6.6s) |  |
| localstack | `@testcontainers/localstack@11.14.0` | `localstack/localstack:4.14.0` | 11.14.0 | ✅ pass (1.7s) |  |
| mariadb | `@testcontainers/mariadb@11.14.0` | `mariadb:12.2.2` | 11.14.0 | ✅ pass (5.6s) |  |
| minio | `@testcontainers/minio@11.14.0` | `minio/minio:RELEASE.2024-12-13T22-19-12Z` | 11.14.0 | ✅ pass (1.5s) |  |
| mockserver | `@testcontainers/mockserver@11.14.0` | `mockserver/mockserver:5.15.0` | 11.14.0 | ✅ pass (1.7s) |  |
| mongodb | `@testcontainers/mongodb@11.14.0` | `mongo:8.2.6` | 11.14.0 | ✅ pass (6.0s) |  |
| mssqlserver | `@testcontainers/mssqlserver@11.14.0` | `mcr.microsoft.com/mssql/server:2022-CU13-ubuntu-22.04` | 11.14.0 | ✅ pass (7.0s) | `.acceptLicense()` required |
| mysql | `@testcontainers/mysql@11.14.0` | `mysql:9.6.0` | 11.14.0 | ✅ pass (6.8s) |  |
| nats | `@testcontainers/nats@11.14.0` | `nats:2.12.6-alpine` | 11.14.0 | ✅ pass (0.5s) |  |
| neo4j | `@testcontainers/neo4j@11.14.0` | `neo4j:5.26.24` | 11.14.0 | ✅ pass (5.9s) |  |
| ollama | `@testcontainers/ollama@11.14.0` | `ollama/ollama:0.20.2` | 11.14.0 | ✅ pass (0.5s) | server-only — no model pulled |
| opensearch | `@testcontainers/opensearch@11.14.0` | `opensearchproject/opensearch:3.5.0` | 11.14.0 | ✅ pass (14.1s) |  |
| oraclefree | `@testcontainers/oraclefree@11.14.0` | `gvenzl/oracle-free:23.26.1-slim-faststart` | 11.14.0 | ✅ pass (6.5s) | multi-GB first pull |
| postgresql | `@testcontainers/postgresql@11.14.0` | `postgres:18.3-alpine` | 11.14.0 | ✅ pass (1.7s) |  |
| qdrant | `@testcontainers/qdrant@11.14.0` | `qdrant/qdrant:v1.17.1` | 11.14.0 | ✅ pass (1.5s) |  |
| rabbitmq | `@testcontainers/rabbitmq@11.14.0` | `rabbitmq:4.2.5-management-alpine` | 11.14.0 | ✅ pass (3.7s) |  |
| redis | `@testcontainers/redis@11.14.0` | `redis:8.6` | 11.14.0 | ✅ pass (0.5s) |  |
| redpanda | `@testcontainers/redpanda@11.14.0` | `docker.redpanda.com/redpandadata/redpanda:v26.1.2` | 11.14.0 | ✅ pass (1.5s) |  |
| s3mock | `@testcontainers/s3mock@11.14.0` | `adobe/s3mock:4.12.2` | 11.14.0 | ✅ pass (2.6s) |  |
| scylladb | `@testcontainers/scylladb@11.14.0` | `scylladb/scylla:6.2.3` | 11.14.0 | ✅ pass (3.8s) |  |
| selenium | `@testcontainers/selenium@11.14.0` | `seleniarm/standalone-chromium:124.0 (arm64) / selenium/standalone-chrome:145.0 (amd64)` | 11.14.0 | ✅ pass (3.3s) | ⚠ `selenium/standalone-chrome` is amd64-only; `seleniarm` arm64 fallback lags upstream |
| toxiproxy | `@testcontainers/toxiproxy@11.14.0` | `ghcr.io/shopify/toxiproxy:2.12.0` | 11.14.0 | ✅ pass (4.0s) |  |
| valkey | `@testcontainers/valkey@11.14.0` | `valkey/valkey:9.0` | 11.14.0 | ✅ pass (0.4s) |  |
| vault | `@testcontainers/vault@11.14.0` | `hashicorp/vault:1.21.4` | 11.14.0 | ✅ pass (1.5s) |  |
| weaviate | `@testcontainers/weaviate@11.14.0` | `semitechnologies/weaviate:1.36.9` | 11.14.0 | ✅ pass (10.5s) |  |

## Flags

* `eventstoredb` — **deprecated**, superseded by `kurrentdb`. Install succeeds but core version is stale.

Regenerate this file with `node scripts/generate-results.mjs` after a full run.