import { EtcdContainer } from "@testcontainers/etcd";
import { smokeTest } from "../helper";

smokeTest("etcd", "starts quay.io/coreos/etcd:v3.6.10", () => new EtcdContainer("quay.io/coreos/etcd:v3.6.10"));
