import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildS3ObjectTarget,
  describeS3WriteFailure,
  normalizeS3Endpoint,
  parseS3ErrorBody,
  s3Put,
} from "@/server/media/s3";

describe("s3 addressing and write errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds path-style Timeweb URLs without embedding the bucket in the host", () => {
    const target = buildS3ObjectTarget(
      {
        endpoint: "https://s3.twcstorage.ru/",
        bucket: "my-bucket",
        forcePathStyle: true,
      },
      "teachers/t1.png"
    );
    expect(target.host).toBe("s3.twcstorage.ru");
    expect(target.canonicalPath).toBe("/my-bucket/teachers/t1.png");
    expect(target.url.pathname).toBe("/my-bucket/teachers/t1.png");
  });

  it("discards accidental bucket path from S3_ENDPOINT when building URLs", () => {
    const normalized = normalizeS3Endpoint(
      "https://s3.twcstorage.ru/wrong-in-path"
    );
    expect(normalized.origin).toBe("https://s3.twcstorage.ru");
    expect(normalized.discardedPathSegments).toBe(1);

    const target = buildS3ObjectTarget(
      {
        endpoint: "https://s3.twcstorage.ru/wrong-in-path",
        bucket: "real-bucket",
        forcePathStyle: true,
      },
      "questions/org/hw/q/file.png"
    );
    expect(target.canonicalPath).toBe("/real-bucket/questions/org/hw/q/file.png");
  });

  it("does not treat HTTP 404 as a write-permission error", () => {
    const noBucket = parseS3ErrorBody(
      `<?xml version="1.0"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>`,
      404
    );
    expect(noBucket.code).toBe("NoSuchBucket");
    expect(describeS3WriteFailure(noBucket)).toMatch(/не найден|NoSuchBucket/i);
    expect(describeS3WriteFailure(noBucket)).not.toMatch(/Проверьте права ключа/i);

    const bare404 = parseS3ErrorBody("Not Found", 404);
    expect(describeS3WriteFailure(bare404)).toMatch(/S3_BUCKET|S3_ENDPOINT/);
    expect(describeS3WriteFailure(bare404)).not.toMatch(/Проверьте права ключа/i);

    const denied = parseS3ErrorBody(
      `<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>`,
      403
    );
    expect(describeS3WriteFailure(denied)).toMatch(/AccessDenied|запрещ/i);
  });

  it("surfaces NoSuchBucket from s3Put instead of a generic permissions hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          `<Error><Code>NoSuchBucket</Code><Message>missing</Message></Error>`,
          { status: 404, headers: { "content-type": "application/xml" } }
        )
      )
    );

    await expect(
      s3Put(
        {
          endpoint: "https://s3.twcstorage.ru",
          region: "ru-1",
          bucket: "missing-bucket",
          accessKeyId: "key",
          secretAccessKey: "secret",
          forcePathStyle: true,
        },
        "teachers/t1.png",
        Buffer.from("x"),
        "image/png"
      )
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/NoSuchBucket|не найден/i),
    });
  });
});
