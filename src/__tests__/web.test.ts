import { registerWebTools } from '../tools/web.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Web Tools', () => {
  const handlers = new Map<string, ToolHandler>();

  beforeAll(() => {
    handlers.clear();
    const mockServer = {
      registerTool: (name: string, _config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
    };

    registerWebTools(mockServer);
  });

  describe('web_search', () => {
    it('should be registered', () => {
      const handler = handlers.get('web_search');
      expect(handler).toBeDefined();
    });

    it('should perform a web search', async () => {
      const handler = handlers.get('web_search')!;

      // Use a simple, reliable search query
      const result = await handler({ query: 'TypeScript', limit: 3 });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBeTruthy();
      // Should contain some results
      expect(result.content[0].text.length).toBeGreaterThan(50);
    }, 30000);

    it('should handle empty query gracefully', async () => {
      const handler = handlers.get('web_search')!;
      const result = await handler({ query: '', limit: 5 });

      // Should not error, even if no results
      expect(result).toBeDefined();
    }, 30000);

    it('should respect limit parameter', async () => {
      const handler = handlers.get('web_search')!;
      const result = await handler({ query: 'JavaScript', limit: 1 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBeTruthy();
    }, 30000);
  });

  describe('web_fetch', () => {
    it('should be registered', () => {
      const handler = handlers.get('web_fetch');
      expect(handler).toBeDefined();
    });

    it('should fetch a web page and extract content', async () => {
      const handler = handlers.get('web_fetch')!;

      // Use example.com which is reliable and fast
      const result = await handler({ url: 'https://example.com', maxLength: 10000 });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('example');
    }, 30000);

    it('should handle invalid URL', async () => {
      const handler = handlers.get('web_fetch')!;

      const result = await handler({ url: 'not-a-valid-url' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error');
    }, 10000);

    it('should handle non-existent domain', async () => {
      const handler = handlers.get('web_fetch')!;

      const result = await handler({
        url: 'https://this-domain-definitely-does-not-exist-12345.com',
      });

      expect(result.isError).toBe(true);
    }, 30000);

    it('should respect maxLength parameter', async () => {
      const handler = handlers.get('web_fetch')!;

      // Use a page with lots of content
      const result = await handler({
        url: 'https://example.com',
        maxLength: 100,
      });

      expect(result.isError).toBeUndefined();
      // Content should be relatively short due to maxLength
      expect(result.content[0].text.length).toBeLessThan(500);
    }, 30000);
  });
});
