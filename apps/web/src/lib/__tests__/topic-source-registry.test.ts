import assert from "node:assert/strict";
import test from "node:test";

import {
  getRegisteredTopicSourceByName,
  getVerifiedSystemTopicSources,
  resolveTopicVerticalsForTopicItem,
} from "../topic-source-registry";

test("verified system topic sources only keep structured sources aligned to target verticals", () => {
  const names = getVerifiedSystemTopicSources().map((item) => item.name);
  assert.ok(names.includes("Side Hustle Nation Feed"));
  assert.ok(names.includes("V2EX Hot Topics"));
  assert.ok(names.includes("Location Rebel Feed"));
  assert.ok(names.includes("Ahrefs Blog Feed"));
  assert.ok(names.includes("Backlinko Feed"));
  assert.ok(names.includes("Niche Pursuits Feed"));
  assert.ok(names.includes("Social Media Examiner Feed"));
  assert.ok(names.includes("HubSpot Marketing Feed"));
  assert.ok(names.includes("Lenny's Newsletter Feed"));
  assert.equal(names.includes("36Kr"), false);
  assert.equal(names.includes("晚点 LatePost"), false);
});

test("resolveTopicVerticalsForTopicItem reuses registered source verticals", () => {
  const verticals = resolveTopicVerticalsForTopicItem({
    sourceName: "Backlinko Feed",
    title: "How affiliate marketers can grow SEO revenue",
    summary: "A deep dive into affiliate traffic and conversion.",
  });

  assert.deepEqual(verticals, ["affiliate_marketing"]);
});

test("resolveTopicVerticalsForTopicItem keeps multi-vertical mapping for overseas-income feeds", () => {
  const verticals = resolveTopicVerticalsForTopicItem({
    sourceName: "Location Rebel Feed",
    title: "How to find remote clients and build a location-free income",
    summary: "Freelance systems for side income and long-term career optionality.",
  });

  assert.deepEqual(verticals, ["overseas_income", "side_hustles", "career"]);
});

test("resolveTopicVerticalsForTopicItem maps V2EX as a multi-vertical community source", () => {
  const registered = getRegisteredTopicSourceByName("V2EX Hot Topics");
  assert.equal(registered?.sourceType, "community");

  const verticals = resolveTopicVerticalsForTopicItem({
    sourceName: "V2EX Hot Topics",
    title: "AI 内容工具和副业项目的真实使用反馈",
    summary: "社区讨论里有人比较自动化、接单和远程职业机会。",
  });

  assert.deepEqual(verticals, ["ai_products", "career", "side_hustles", "overseas_income"]);
});

test("resolveTopicVerticalsForTopicItem can infer verticals from content when source is generic", () => {
  const verticals = resolveTopicVerticalsForTopicItem({
    sourceName: "Custom Feed",
    title: "Remote job playbook for earning your first US dollar online",
    summary: "Freelance clients, remote work and side hustle systems.",
  });

  assert.deepEqual(verticals, ["overseas_income", "career", "side_hustles"]);
});

test("getRegisteredTopicSourceByName returns null for retired legacy sources", () => {
  assert.equal(getRegisteredTopicSourceByName("36Kr"), null);
});
