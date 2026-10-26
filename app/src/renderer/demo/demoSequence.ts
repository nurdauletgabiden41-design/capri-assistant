export interface DemoStep {
  delay: number;
  event: Record<string, unknown>;
}

const TEXTS: Record<string, { prompt: string; explore: string; test: string; push: string; reply: string }> = {
  ru: {
    prompt: 'Добавь эндпоинт /gigs с пагинацией и тестами',
    explore: 'Проверить остальные маршруты',
    test: 'Запустить тесты gigs',
    push: 'Запушить в main',
    reply: 'Готово: **GET /gigs** с пагинацией по курсору, 6 тестов проходят. Пуш сделан.',
  },
  en: {
    prompt: 'Add a /gigs endpoint with pagination and tests',
    explore: 'Check the other routes',
    test: 'Run the gigs tests',
    push: 'Push to main',
    reply: 'I added **GET /gigs** with cursor pagination, and 6 tests pass. The push is done.',
  },
};

export function getDemoSteps(lang: string = 'ru'): DemoStep[] {
  const t = TEXTS[lang] || TEXTS.ru;

  return [
    { delay: 0, event: { type: 'session_start', version: '0.1.0', active_model: 'anthropic/claude-haiku-5.5' } },
    { delay: 1800, event: { type: 'transcript', text: t.prompt, is_final: true } },
    { delay: 800, event: { type: 'thinking_start' } },
    { delay: 1200, event: { type: 'thinking_tick', elapsed_sec: 2 } },
    { delay: 900, event: { type: 'thinking_end' } },
    { delay: 700, event: { type: 'tool_start', tool: 'list_dir', target: 'src/routes', ticker: 'LISTS src/routes' } },
    { delay: 1000, event: { type: 'tool_end', tool: 'list_dir', ok: true } },
    { delay: 800, event: { type: 'tool_start', tool: 'read_file', target: 'src/db/gigs.ts', ticker: 'READS gigs.ts' } },
    { delay: 1100, event: { type: 'tool_end', tool: 'read_file', ok: true } },
    {
      delay: 1200,
      event: {
        type: 'needs_approval',
        id: 'demo-appr-1',
        kind: 'write_file',
        summary: 'EDITS src/routes/gigs.ts',
        details: 'Создание нового обработчика пагинации для /gigs',
        diff: '--- src/routes/gigs.ts\n+++ src/routes/gigs.ts\n@@ -1,3 +1,12 @@\n+export async function getGigs(cursor?: string) {\n+  return db.gigs.paginate({ cursor, limit: 20 });\n+}',
      },
    },
    { delay: 4000, event: { type: 'approval_resolved', id: 'demo-appr-1', approved: true } },
    { delay: 600, event: { type: 'tool_start', tool: 'write_file', target: 'src/routes/gigs.ts', ticker: 'WRITES gigs.ts' } },
    { delay: 900, event: { type: 'tool_end', tool: 'write_file', ok: true } },
    { delay: 800, event: { type: 'tool_start', tool: 'run_python', target: 'pytest tests/test_gigs.py', ticker: 'RUNS tests' } },
    { delay: 1400, event: { type: 'tool_end', tool: 'run_python', ok: true } },
    {
      delay: 1000,
      event: {
        type: 'assistant_message',
        text: t.reply,
        face: 'smug',
        badge: 'DONE',
      },
    },
    {
      delay: 2000,
      event: {
        type: 'task_done',
        actions: 5,
        files_changed: 1,
        duration_ms: 8400,
        last_sentence: 'Всё сделано чисто. 6 тестов проходят.',
      },
    },
  ];
}
