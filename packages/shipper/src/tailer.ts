import * as fs from "fs";
import * as readline from "readline";
import { EventEmitter } from "events";

export interface TailerOptions {
  fromBeginning?: boolean;
  pollIntervalMs?: number;
}

/**
 * File & Stream Tailer that reads files as they are written or streams from STDIN.
 */
export class FileTailer extends EventEmitter {
  private filePath: string;
  private options: TailerOptions;
  private currentOffset = 0;
  private watcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(filePath: string, options: TailerOptions = {}) {
    super();
    this.filePath = filePath;
    this.options = {
      fromBeginning: options.fromBeginning ?? false,
      pollIntervalMs: options.pollIntervalMs ?? 1000,
    };
  }

  public start(): void {
    if (!fs.existsSync(this.filePath)) {
      this.emit("error", new Error(`File does not exist: ${this.filePath}`));
      return;
    }

    const stat = fs.statSync(this.filePath);
    this.currentOffset = this.options.fromBeginning ? 0 : stat.size;

    // Process any initial content if starting from beginning
    if (this.options.fromBeginning && this.currentOffset < stat.size) {
      this.readNewData();
    }

    try {
      this.watcher = fs.watch(this.filePath, () => {
        this.readNewData();
      });
    } catch {
      // Fallback to polling if fs.watch fails (e.g. NFS / mounted volumes)
    }

    this.pollTimer = setInterval(() => {
      this.readNewData();
    }, this.options.pollIntervalMs);

    if (
      this.pollTimer &&
      typeof this.pollTimer === "object" &&
      "unref" in this.pollTimer &&
      typeof (this.pollTimer as { unref?: () => void }).unref === "function"
    ) {
      (this.pollTimer as { unref: () => void }).unref();
    }
  }

  private readNewData(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const stat = fs.statSync(this.filePath);
      // Handle file truncation / log rotation
      if (stat.size < this.currentOffset) {
        this.currentOffset = 0;
      }

      if (stat.size > this.currentOffset) {
        const stream = fs.createReadStream(this.filePath, {
          start: this.currentOffset,
          end: stat.size,
          encoding: "utf-8",
        });

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        rl.on("line", (line) => {
          if (line.trim().length > 0) {
            this.emit("line", line);
          }
        });

        rl.on("close", () => {
          this.currentOffset = stat.size;
          this.isProcessing = false;
        });

        stream.on("error", (err) => {
          this.emit("error", err);
          this.isProcessing = false;
        });
      } else {
        this.isProcessing = false;
      }
    } catch (err) {
      this.emit("error", err);
      this.isProcessing = false;
    }
  }

  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/**
 * Tail standard input (for piping: `node app.js | obs-shipper`)
 */
export function streamStdin(onLine: (line: string) => void): () => void {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", (line) => {
    if (line.trim().length > 0) {
      onLine(line);
    }
  });

  return () => {
    rl.close();
  };
}
