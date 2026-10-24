/**
 * Purpose: run a PostgreSQL 17 cluster inside the project directory for
 * development and tests on a machine without Docker.
 *
 * Usage:
 *   npm run db:local:start    # initdb if needed, start, create databases
 *   npm run db:local:stop
 *   npm run db:local:status
 *
 * The documented team path is `docker compose up -d` (see docker-compose.yml).
 * This helper exists so tests can run on a laptop where Docker is unavailable,
 * and it writes only inside the repository (.pgdata/, .pgsocket/).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".pgdata");
const SOCKET_DIR = path.join(ROOT, ".pgsocket");
const LOG_FILE = path.join(ROOT, ".pgdata", "server.log");
const PORT = process.env.LOCAL_PG_PORT ?? "5432";
const USER = "postgres";
const DATABASES = ["aipass_local", "aipass_test"];

function findBin(name: string): string {
  const explicit = process.env.PG_BIN;
  if (explicit && existsSync(path.join(explicit, name))) return path.join(explicit, name);

  const candidates: string[] = [];
  for (const base of ["/opt/homebrew/opt", "/usr/local/opt", "/usr/lib/postgresql"]) {
    if (!existsSync(base)) continue;
    try {
      for (const entry of readdirSync(base)) {
        if (!entry.startsWith("postgresql")) continue;
        candidates.push(path.join(base, entry, "bin", name));
      }
    } catch {
      // ignore unreadable directories
    }
  }
  const found = candidates.sort().reverse().find((candidate) => existsSync(candidate));
  if (found) return found;

  const inPath = spawnSync("which", [name], { encoding: "utf8" });
  if (inPath.status === 0 && inPath.stdout.trim()) return inPath.stdout.trim();
  throw new Error(
    `${name} not found. Install PostgreSQL 17 or Docker, or set PG_BIN to its bin directory.`,
  );
}

function run(bin: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    env: { ...process.env, PGDATA: DATA_DIR, LC_ALL: "C" },
  });
  if (result.status !== 0) {
    if (options.allowFailure) return result.stderr ?? "";
    throw new Error(`${path.basename(bin)} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout ?? "";
}

function isRunning(): boolean {
  const pgCtl = findBin("pg_ctl");
  const result = spawnSync(pgCtl, ["status"], { encoding: "utf8", env: { ...process.env, PGDATA: DATA_DIR } });
  return result.status === 0;
}

function ensureCluster() {
  if (existsSync(path.join(DATA_DIR, "PG_VERSION"))) return;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(SOCKET_DIR, { recursive: true });
  console.log(`initdb: ${DATA_DIR}`);
  run(findBin("initdb"), [
    "-D",
    DATA_DIR,
    "-U",
    USER,
    "--auth=trust",
    "--encoding=UTF8",
    "--locale=C",
  ]);
}

function ensureDatabases() {
  const psql = findBin("psql");
  for (const database of DATABASES) {
    const check = spawnSync(
      psql,
      ["-h", SOCKET_DIR, "-p", PORT, "-U", USER, "-d", "postgres", "-tAc", `select 1 from pg_database where datname='${database}'`],
      { encoding: "utf8" },
    );
    if (check.stdout.trim() !== "1") {
      run(psql, ["-h", SOCKET_DIR, "-p", PORT, "-U", USER, "-d", "postgres", "-c", `create database ${database}`]);
      console.log(`created database ${database}`);
    }
  }
}

async function start() {
  ensureCluster();
  mkdirSync(SOCKET_DIR, { recursive: true });
  if (isRunning()) {
    console.log(`postgres already running (port ${PORT})`);
  } else {
    console.log(`starting postgres on 127.0.0.1:${PORT} (socket ${SOCKET_DIR})`);
    run(findBin("pg_ctl"), [
      "-D",
      DATA_DIR,
      "-l",
      LOG_FILE,
      "-o",
      `-p ${PORT} -k ${SOCKET_DIR} -c listen_addresses=127.0.0.1`,
      "start",
      "-w",
    ]);
  }
  // Wait for the TCP port as well; pg_ctl waits for the socket only.
  const ready = spawnSync(findBin("pg_isready"), ["-h", "127.0.0.1", "-p", PORT], {
    encoding: "utf8",
  });
  if (ready.status !== 0) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  ensureDatabases();
  console.log(`ready: postgresql://${USER}@127.0.0.1:${PORT}/aipass_local`);
}

function stop() {
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("no local cluster; nothing to stop");
    return;
  }
  if (!isRunning()) {
    console.log("postgres is not running");
    return;
  }
  run(findBin("pg_ctl"), ["-D", DATA_DIR, "stop", "-m", "fast", "-w"]);
  console.log("stopped");
}

function status() {
  console.log(`data: ${DATA_DIR}`);
  console.log(`port: ${PORT}`);
  console.log(isRunning() ? "status: running" : "status: stopped");
}

const command = process.argv[2] ?? "status";

async function main() {
  if (command === "start") return start();
  if (command === "stop") return stop();
  if (command === "status") return status();
  throw new Error(`unknown command ${command}; use start, stop, or status`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export {};
