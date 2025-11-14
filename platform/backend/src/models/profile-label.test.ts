import { describe, expect, test } from "@/test";
import ProfileLabelModel from "./profile-label";

describe("ProfileLabelModel", () => {
  describe("getOrCreateKey", () => {
    test("creates a new key when it does not exist", async () => {
      const keyId = await ProfileLabelModel.getOrCreateKey("environment");

      expect(keyId).toBeDefined();

      const keys = await ProfileLabelModel.getAllKeys();
      expect(keys).toContain("environment");
    });

    test("returns existing key ID when key already exists", async () => {
      const keyId1 = await ProfileLabelModel.getOrCreateKey("region");
      const keyId2 = await ProfileLabelModel.getOrCreateKey("region");

      expect(keyId1).toBe(keyId2);

      const keys = await ProfileLabelModel.getAllKeys();
      expect(keys.filter((k) => k === "region")).toHaveLength(1);
    });
  });

  describe("getOrCreateValue", () => {
    test("creates a new value when it does not exist", async () => {
      const valueId = await ProfileLabelModel.getOrCreateValue("production");

      expect(valueId).toBeDefined();

      const values = await ProfileLabelModel.getAllValues();
      expect(values).toContain("production");
    });

    test("returns existing value ID when value already exists", async () => {
      const valueId1 = await ProfileLabelModel.getOrCreateValue("staging");
      const valueId2 = await ProfileLabelModel.getOrCreateValue("staging");

      expect(valueId1).toBe(valueId2);

      const values = await ProfileLabelModel.getAllValues();
      expect(values.filter((v) => v === "staging")).toHaveLength(1);
    });
  });

  describe("syncAgentLabels", () => {
    test("syncs labels for an agent", async ({ makeAgent }) => {
      const agent = await makeAgent();

      await ProfileLabelModel.syncAgentLabels(agent.id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
        { key: "region", value: "us-west-2", keyId: "", valueId: "" },
      ]);

      const labels = await ProfileLabelModel.getLabelsForAgent(agent.id);

      expect(labels).toHaveLength(2);
      expect(labels[0].key).toBe("environment");
      expect(labels[0].value).toBe("production");
      expect(labels[1].key).toBe("region");
      expect(labels[1].value).toBe("us-west-2");
    });

    test("replaces existing labels when syncing", async ({ makeAgent }) => {
      const agent = await makeAgent();

      await ProfileLabelModel.syncAgentLabels(agent.id, [
        { key: "environment", value: "staging", keyId: "", valueId: "" },
      ]);

      await ProfileLabelModel.syncAgentLabels(agent.id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
        { key: "team", value: "engineering", keyId: "", valueId: "" },
      ]);

      const labels = await ProfileLabelModel.getLabelsForAgent(agent.id);

      expect(labels).toHaveLength(2);
      expect(labels[0].key).toBe("environment");
      expect(labels[0].value).toBe("production");
      expect(labels[1].key).toBe("team");
      expect(labels[1].value).toBe("engineering");
    });

    test("clears all labels when syncing with empty array", async ({
      makeAgent,
    }) => {
      const agent = await makeAgent();

      await ProfileLabelModel.syncAgentLabels(agent.id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
      ]);

      await ProfileLabelModel.syncAgentLabels(agent.id, []);

      const labels = await ProfileLabelModel.getLabelsForAgent(agent.id);
      expect(labels).toHaveLength(0);
    });
  });

  describe("pruneKeysAndValues", () => {
    test("removes orphaned keys and values", async ({ makeAgent }) => {
      const agent = await makeAgent();

      // Create labels
      await ProfileLabelModel.syncAgentLabels(agent.id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
        { key: "region", value: "us-west-2", keyId: "", valueId: "" },
      ]);

      // Verify keys and values exist
      let keys = await ProfileLabelModel.getAllKeys();
      let values = await ProfileLabelModel.getAllValues();
      expect(keys).toContain("environment");
      expect(keys).toContain("region");
      expect(values).toContain("production");
      expect(values).toContain("us-west-2");

      // Remove all labels, which should make keys and values orphaned
      await ProfileLabelModel.syncAgentLabels(agent.id, []);

      // Verify orphaned keys and values were pruned
      keys = await ProfileLabelModel.getAllKeys();
      values = await ProfileLabelModel.getAllValues();
      expect(keys).not.toContain("environment");
      expect(keys).not.toContain("region");
      expect(values).not.toContain("production");
      expect(values).not.toContain("us-west-2");
    });

    test("keeps keys and values that are still in use", async ({
      makeAgent,
    }) => {
      const { id: agent1Id } = await makeAgent();
      const { id: agent2Id } = await makeAgent();

      // Create labels for two agents with shared key/value
      await ProfileLabelModel.syncAgentLabels(agent1Id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
      ]);

      await ProfileLabelModel.syncAgentLabels(agent2Id, [
        { key: "environment", value: "staging", keyId: "", valueId: "" },
      ]);

      // Remove labels from agent1
      await ProfileLabelModel.syncAgentLabels(agent1Id, []);

      // Verify "environment" key is still present (used by agent2)
      const keys = await ProfileLabelModel.getAllKeys();
      expect(keys).toContain("environment");

      // Verify "staging" value is still present but "production" is removed
      const values = await ProfileLabelModel.getAllValues();
      expect(values).toContain("staging");
      expect(values).not.toContain("production");
    });
  });

  describe("getAllKeys", () => {
    test("returns all unique keys", async ({ makeAgent }) => {
      const { id: agent1Id } = await makeAgent();
      const { id: agent2Id } = await makeAgent();

      await ProfileLabelModel.syncAgentLabels(agent1Id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
      ]);

      await ProfileLabelModel.syncAgentLabels(agent2Id, [
        { key: "region", value: "us-west-2", keyId: "", valueId: "" },
      ]);

      const keys = await ProfileLabelModel.getAllKeys();

      expect(keys).toContain("environment");
      expect(keys).toContain("region");
    });
  });

  describe("getAllValues", () => {
    test("returns all unique values", async ({ makeAgent }) => {
      const { id: agent1Id } = await makeAgent();
      const { id: agent2Id } = await makeAgent();

      await ProfileLabelModel.syncAgentLabels(agent1Id, [
        { key: "environment", value: "production", keyId: "", valueId: "" },
      ]);

      await ProfileLabelModel.syncAgentLabels(agent2Id, [
        { key: "environment", value: "staging", keyId: "", valueId: "" },
      ]);

      const values = await ProfileLabelModel.getAllValues();

      expect(values).toContain("production");
      expect(values).toContain("staging");
    });
  });
});
