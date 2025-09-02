
// src/base/storage/db.storage.ts

export class DbStorage {
  private db: any; // Replace with actual D1 database type

  constructor(db: any) {
    this.db = db;
  }

  async execute(query: string, bindings: any[] = []): Promise<any> {
    return this.db.prepare(query).bind(...bindings).all();
  }

  async getUsage(keyHash: string, model: string, minuteStart: number, dayStart: number): Promise<{ rpm: number, rpd: number }> {
    const query = `
      SELECT 
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as rpm_count,
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as rpd_count
      FROM request_logs 
      WHERE api_key_hash = ? 
        AND model = ? 
        AND timestamp >= ?
    `;
    const result = await this.db.prepare(query).bind(minuteStart, dayStart, keyHash, model, dayStart).first();
    return {
      rpm: result?.rpm_count || 0,
      rpd: result?.rpd_count || 0,
    };
  }

  async recordUsage(data: { keyHash: string, model: string, inputTokens: number, outputTokens: number, totalTokens: number, statusCode: number }): Promise<void> {
    const query = `
      INSERT INTO request_logs (id, timestamp, api_key_hash, model, input_tokens, output_tokens, total_tokens, status_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const id = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    
    await this.db.prepare(query).bind(
      id,
      timestamp,
      data.keyHash,
      data.model,
      data.inputTokens,
      data.outputTokens,
      data.totalTokens,
      data.statusCode
    ).run();
  }
}
