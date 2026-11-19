import { setupStrapi, stopStrapi } from "@strapi-community/dev-utils";
import type { DBAdapter } from "better-auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPluginService } from "../src/utils";

// Better Auth consumes single-use values (verification tokens, OTPs, magic
// links) through the adapter's `consumeOne`. These tests drive it through the
// playground's real Better Auth instance, so the rows carry Strapi's own fields
// (`documentId`, `publishedAt`, `locale`) exactly as they do in an app.

const VERIFICATION_UID = "plugin::better-auth.verification";

interface Verification {
  id: number;
  identifier: string;
  value: string;
  expiresAt: Date;
}

const getAdapter = async (): Promise<DBAdapter> => {
  const auth = getPluginService("auth-service").getAuth() as unknown as {
    $context: Promise<{ adapter: DBAdapter }>;
  };
  return (await auth.$context).adapter;
};

let counter = 0;

async function createVerification(adapter: DBAdapter) {
  const identifier = `consume-one-${Date.now()}-${counter++}`;
  const row = await adapter.create<Verification>({
    model: "verification",
    data: {
      identifier,
      value: "secret",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { identifier, row };
}

const consume = (adapter: DBAdapter, identifier: string) =>
  adapter.consumeOne<Verification>({
    model: "verification",
    where: [{ field: "identifier", value: identifier }],
  });

const remaining = (identifier: string) =>
  strapi.db.query(VERIFICATION_UID).count({ where: { identifier } });

beforeAll(async () => {
  await setupStrapi();
}, 120_000);

afterAll(async () => {
  await stopStrapi();
});

describe("consumeOne", () => {
  it("returns the row in Better Auth's shape and deletes it", async () => {
    const adapter = await getAdapter();
    const { identifier, row } = await createVerification(adapter);

    const consumed = await consume(adapter, identifier);

    expect(consumed).toMatchObject({
      id: row.id,
      identifier,
      value: "secret",
    });
    expect(consumed?.expiresAt).toBeInstanceOf(Date);
    expect(consumed).not.toHaveProperty("documentId");
    expect(await remaining(identifier)).toBe(0);
  });

  it("returns null when the value was already consumed", async () => {
    const adapter = await getAdapter();
    const { identifier } = await createVerification(adapter);

    await consume(adapter, identifier);

    expect(await consume(adapter, identifier)).toBeNull();
  });

  it("returns null and deletes nothing when no row matches", async () => {
    const adapter = await getAdapter();
    const { identifier } = await createVerification(adapter);

    expect(await consume(adapter, `${identifier}-other`)).toBeNull();
    expect(await remaining(identifier)).toBe(1);
  });

  it("hands a value to only one of two concurrent consumers", async () => {
    const adapter = await getAdapter();
    const { identifier } = await createVerification(adapter);

    const results = await Promise.all([
      consume(adapter, identifier),
      consume(adapter, identifier),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await remaining(identifier)).toBe(0);
  });
});
