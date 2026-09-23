import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** Only the bundled synthetic examples. User uploads remain in the browser. */
export async function GET() {
  try {
    const directory = path.join(process.cwd(), "data", "source");
    const [employees, events, skills, history] = await Promise.all(
      ["employees.json", "events.json", "skills.json", "activity_history.csv"].map((file) => readFile(path.join(directory, file), "utf8")),
    );
    return Response.json({ employees, events, skills, history });
  } catch {
    return Response.json({ error: "Демо-набор недоступен. Загрузите файлы из data/source." }, { status: 503 });
  }
}
