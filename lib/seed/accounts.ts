import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { ROLE_LABEL } from "@/lib/auth/guards";
import type { AppRole } from "@/lib/domain/types";

/**
 * The three local teaching identities from the implementation spec:
 * admin, pilot, outsider. Passwords are generated, hashed into PostgreSQL,
 * and written once to a local file outside Git.
 */

export type TeachingAccount = {
  username: "admin" | "pilot" | "outsider";
  displayName: string;
  role: AppRole;
  password: string | null;
  created: boolean;
};

const ACCOUNTS: Array<{ username: TeachingAccount["username"]; displayName: string; role: AppRole }> = [
  { username: "admin", displayName: "ผู้ดูแลระบบ (สมมติ)", role: "admin" },
  { username: "pilot", displayName: "ผู้ใช้ทดลองนำร่อง", role: "pilot" },
  { username: "outsider", displayName: "ผู้ใช้ภายนอก", role: "outsider" },
];

export async function ensureAccounts(
  db: Database,
  namespace: string,
  options: { rotatePasswords?: boolean } = {},
): Promise<TeachingAccount[]> {
  const results: TeachingAccount[] = [];

  for (const account of ACCOUNTS) {
    const existing = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.namespace, namespace), eq(appUsers.username, account.username)))
      .limit(1);

    if (existing.length > 0 && !options.rotatePasswords) {
      results.push({ ...account, password: null, created: false });
      continue;
    }

    const password = generatePassword();
    const passwordHash = await hashPassword(password);

    if (existing.length > 0) {
      await db
        .update(appUsers)
        .set({ passwordHash, isActive: true })
        .where(eq(appUsers.id, existing[0].id));
      results.push({ ...account, password, created: false });
    } else {
      await db.insert(appUsers).values({
        namespace,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        passwordHash,
      });
      results.push({ ...account, password, created: true });
    }
  }

  return results;
}

/** The one-time account file. Gitignored through `local-accounts*`. */
export function renderAccountsFile(
  accounts: TeachingAccount[],
  namespace: string,
  environment: string,
): string {
  const lines = [
    "ถามคู่มือ — ศูนย์บริการตัวอย่าง / local teaching accounts",
    "ข้อมูลสมมติสำหรับการเรียน — fictional teaching data",
    "",
    `environment: ${environment}`,
    `namespace:   ${namespace}`,
    `written:     ${new Date().toISOString()}`,
    "",
    "These passwords are shown once. Keep this file out of Git and out of",
    "screen recordings. Re-run `npm run setup -- --rotate` to replace them.",
    "",
  ];

  for (const account of accounts) {
    lines.push(`${account.username}  (${ROLE_LABEL[account.role]})`);
    lines.push(`  display: ${account.displayName}`);
    if (account.password) {
      lines.push(`  password: ${account.password}`);
    } else {
      lines.push("  password: unchanged (not printed again)");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
