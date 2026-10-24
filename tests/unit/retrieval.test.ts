import { describe, expect, it } from "vitest";
import docsV1 from "@/fixtures/documents/docs-v1.json";
import docsV2 from "@/fixtures/documents/docs-v2.json";
import evaluationCases from "@/fixtures/evaluation-cases.json";
import { buildIndex, type CanonicalDocument } from "@/lib/retrieval/index-build";
import { MAX_SECTIONS, retrieve } from "@/lib/retrieval/retrieve";

/**
 * Retrieval is generated from document text. These tests pin the behaviour the
 * evaluation suite depends on, and guard against the index being special-cased
 * to evaluation question IDs.
 */

const documents: CanonicalDocument[] = [
  docsV1 as CanonicalDocument,
  docsV2 as CanonicalDocument,
];

describe.each(documents)("retrieval over $id", (document) => {
  const built = buildIndex(document);

  it("retrieves the expected section for every evaluation case", () => {
    for (const testCase of evaluationCases.cases) {
      const result = retrieve({
        entries: built.entries,
        aliasMap: built.aliasMap,
        question: testCase.question,
        outOfScope: document.out_of_scope,
      });

      if (testCase.expected_section === null) {
        expect(result.hits, testCase.id).toHaveLength(0);
      } else {
        expect(result.hits[0]?.sectionId, testCase.id).toBe(testCase.expected_section);
      }
    }
  });

  it("returns no evidence for out-of-scope questions", () => {
    const result = retrieve({
      entries: built.entries,
      aliasMap: built.aliasMap,
      question: "แนะนำสินเชื่อให้หน่อย",
      outOfScope: document.out_of_scope,
    });
    expect(result.outOfScopeTerm).toBe("สินเชื่อ");
    expect(result.hits).toHaveLength(0);
  });

  it("returns no evidence for an unrelated question", () => {
    for (const question of ["มีที่จอดรถไหม", "ชำระเงินผ่านบัตรได้ไหม", "มีอาหารกลางวันไหม"]) {
      const result = retrieve({
        entries: built.entries,
        aliasMap: built.aliasMap,
        question,
        outOfScope: document.out_of_scope,
      });
      expect(result.hits, question).toHaveLength(0);
    }
  });

  it("returns at most three sections", () => {
    const result = retrieve({
      entries: built.entries,
      aliasMap: built.aliasMap,
      question: "ห้องประชุมกับเวลาทำการและค่าธรรมเนียมและติดต่อเจ้าหน้าที่",
      outOfScope: document.out_of_scope,
    });
    expect(result.hits.length).toBeLessThanOrEqual(MAX_SECTIONS);
  });

  it("is deterministic", () => {
    const question = "ศูนย์เปิดกี่โมง";
    const first = retrieve({
      entries: built.entries,
      aliasMap: built.aliasMap,
      question,
      outOfScope: document.out_of_scope,
    });
    const second = retrieve({
      entries: built.entries,
      aliasMap: built.aliasMap,
      question,
      outOfScope: document.out_of_scope,
    });
    expect(second).toEqual(first);
  });

  it("stores section identifiers and the alias map in the index", () => {
    expect(Object.keys(built.aliasMap).length).toBeGreaterThan(0);
    expect(built.entries.sections.map((section) => section.sectionId)).toEqual(
      document.sections.map((section) => section.id),
    );
    expect(built.entries.sections.every((section) => Object.keys(section.grams).length > 0)).toBe(true);
  });
});

describe("index integrity", () => {
  it("builds identical entries and hash from the same document", () => {
    const first = buildIndex(docsV2 as CanonicalDocument);
    const second = buildIndex(docsV2 as CanonicalDocument);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.entries).toEqual(first.entries);
  });

  it("does not embed evaluation case identifiers or questions", () => {
    const built = buildIndex(docsV2 as CanonicalDocument);
    const serialized = JSON.stringify(built.entries) + JSON.stringify(built.aliasMap);
    for (const testCase of evaluationCases.cases) {
      expect(serialized).not.toContain(testCase.id);
      expect(serialized).not.toContain(testCase.question);
    }
  });

  it("keeps the two document versions distinct", () => {
    const v1 = buildIndex(docsV1 as CanonicalDocument);
    const v2 = buildIndex(docsV2 as CanonicalDocument);
    expect(v1.contentHash).not.toBe(v2.contentHash);
    expect(v1.entries.sections[0].text).toContain("09:00");
    expect(v2.entries.sections[0].text).toContain("08:30");
  });

  it("answers from the older index with the older hours", () => {
    const built = buildIndex(docsV1 as CanonicalDocument);
    const result = retrieve({
      entries: built.entries,
      aliasMap: built.aliasMap,
      question: "ศูนย์เปิดกี่โมง",
      outOfScope: (docsV1 as CanonicalDocument).out_of_scope,
    });
    const top = result.hits[0];
    expect(top?.sectionId).toBe("2.1");
    const section = built.entries.sections.find((entry) => entry.sectionId === "2.1");
    expect(section?.text).toContain("09:00–16:00");
  });
});
