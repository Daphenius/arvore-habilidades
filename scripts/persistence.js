// Serializa gravações deste editor. Erros mantêm a última edição disponível.
export class SaveQueue {
  constructor(write, onError) { this.write = write; this.onError = onError; this.pending = null; this.running = null; }
  stage(value) { this.pending = structuredClone(value); }
  async flush() {
    if (this.running) { await this.running; if (this.pending) return this.flush(); return; }
    if (!this.pending) return;
    const run = async () => {
      while (this.pending) {
        const value = this.pending; this.pending = null;
        try { await this.write(value); }
        catch (error) { this.pending ??= value; this.onError?.(error); throw error; }
      }
    };
    this.running = run();
    try { await this.running; } finally { this.running = null; }
  }
  get dirty() { return !!(this.pending || this.running); }
}
