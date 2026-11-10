import { describe, expect, it } from "vitest";
import { edgeCacheable, edgeCacheKey } from "./edge-cache";

const req = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request(`https://www.datalyst.one${path}`, { method, headers });

describe("edgeCacheable", () => {
  it("caches anonymous public pages", () => {
    expect(edgeCacheable(req("/"))).toBe(true);
    expect(edgeCacheable(req("/login", { cookie: "theme=dark" }))).toBe(true);
  });

  it("never caches a request with a session", () => {
    expect(edgeCacheable(req("/", { cookie: "sb-abc-auth-token=x" }))).toBe(false);
    expect(edgeCacheable(req("/login", { cookie: "theme=dark; sb-abc-auth-token=x" }))).toBe(false);
    expect(edgeCacheable(req("/", { authorization: "Bearer x" }))).toBe(false);
  });

  it("skips app routes, RSC, markdown and non-GET", () => {
    expect(edgeCacheable(req("/dashboard"))).toBe(false);
    expect(edgeCacheable(req("/api/v1/protocols"))).toBe(false);
    expect(edgeCacheable(req("/", { rsc: "1" }))).toBe(false);
    expect(edgeCacheable(req("/?_rsc=abc"))).toBe(false);
    expect(edgeCacheable(req("/", { accept: "text/markdown" }))).toBe(false);
    expect(edgeCacheable(req("/", {}, "POST"))).toBe(false);
  });
});

describe("edgeCacheKey", () => {
  it("changes with the version and ignores tracking params", () => {
    expect(edgeCacheKey(req("/?utm=x"), "v1").url).toBe(edgeCacheKey(req("/"), "v1").url);
    expect(edgeCacheKey(req("/"), "v1").url).not.toBe(edgeCacheKey(req("/"), "v2").url);
  });
});
