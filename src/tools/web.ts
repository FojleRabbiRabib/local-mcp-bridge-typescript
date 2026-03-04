import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as cheerio from 'cheerio';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search using DuckDuckGo HTML version (no API key required)
 */
async function webSearch(query: string, limit: number = 10): Promise<string> {
  const params = new URLSearchParams({
    q: query,
  });
  const url = `https://html.duckduckgo.com/html/?${params}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.web-result').each((_, element) => {
    if (results.length >= limit) return false;

    const $el = $(element);
    const $anchor = $el.find('.result__a');
    const title = $anchor.text().trim();
    const url = $anchor.attr('href') || '';
    const snippet = $el.find('.result__snippet').text().trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  });

  if (results.length === 0) {
    return 'No results found.';
  }

  return results
    .map((r, i) => `## ${i + 1}. ${r.title}\n**URL:** ${r.url}\n${r.snippet}`)
    .join('\n\n');
}

/**
 * Fetch a web page and convert to markdown
 */
async function webFetch(url: string, maxLength: number = 100000): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Parse with cheerio
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer elements
  $('script, style, nav, footer, header, .ad, .advertisement, .sidebar').remove();

  // Try to find main content
  let content = '';
  const mainContent =
    $('main').first().text() ||
    $('article').first().text() ||
    $('.content').first().text() ||
    $('#content').first().text() ||
    $('body').text();

  content = mainContent;

  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();

  // Truncate if too long
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n...(content truncated)';
  }

  return content;
}

export function registerWebTools(server: McpServer): void {
  server.registerTool(
    'web_search',
    {
      description: 'Search the web for current information using DuckDuckGo',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe('Number of results (1-50, default: 10)'),
      }),
    },
    async ({ query, limit = 10 }) => {
      try {
        const results = await webSearch(query, limit);
        return {
          content: [{ type: 'text', text: results }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error performing web search: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'web_fetch',
    {
      description: 'Fetch a web page and extract readable text content',
      inputSchema: z.object({
        url: z.string().url().describe('URL to fetch'),
        maxLength: z
          .number()
          .min(1000)
          .max(500000)
          .optional()
          .default(100000)
          .describe('Maximum characters to return (default: 100000)'),
      }),
    },
    async ({ url, maxLength = 100000 }) => {
      try {
        const content = await webFetch(url, maxLength);
        return {
          content: [
            {
              type: 'text',
              text: `# Content from ${url}\n\n${content}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching ${url}: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
