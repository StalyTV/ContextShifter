/*
 * artefactText
 * ------------
 * Turns an artefact's available metadata (title / URL / file path / app name)
 * into a short natural-language string to embed for semantic relevance. Titles
 * are the richest signal; URLs and paths are tokenised into words so the
 * embedding model sees "questions jwt refresh" rather than one opaque slug.
 */

import { ArtifactKind } from '../entity/ArtifactUsage';

export type ArtefactTextInput = {
  kind: ArtifactKind;
  name?: string | null;
  path?: string | null;
  url?: string | null;
  title?: string | null;
};

/** Split a URL into host + meaningful path/query words. */
function urlWords(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    const path = `${u.pathname} ${u.searchParams.toString()}`;
    const words = path
      .split(/[/?=&._#%+-]+/)
      .filter((w) => w.length > 1 && !/^\d+$/.test(w))
      .slice(0, 12)
      .join(' ');
    return `${host} ${words}`.trim();
  } catch {
    return rawUrl;
  }
}

/** Split a file/folder path into its last few segments as words. */
function pathWords(rawPath: string): string {
  const segments = rawPath.split(/[/\\]+/).filter(Boolean);
  const tail = segments.slice(-4).join(' ');
  const ext = /\.([a-z0-9]+)$/i.exec(rawPath)?.[1] ?? '';
  const lang = EXT_TO_LANG[ext.toLowerCase()] ?? '';
  return `${tail} ${lang}`.trim();
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript react',
  js: 'javascript',
  jsx: 'javascript react',
  py: 'python',
  java: 'java',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  c: 'c',
  cpp: 'c++',
  cs: 'c#',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  md: 'markdown',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'css',
  sql: 'sql',
};

/**
 * Build the text to embed for one artefact. Returns '' when there's nothing
 * meaningful (the caller then treats semantic similarity as neutral).
 */
export default function artefactText(input: ArtefactTextInput): string {
  const parts: string[] = [];
  const title = (input.title ?? '').trim();
  const name = (input.name ?? '').trim();

  switch (input.kind) {
    case 'tab': {
      if (title) parts.push(title);
      if (input.url) parts.push(urlWords(input.url));
      break;
    }
    case 'ide':
    case 'file': {
      if (input.path) parts.push(pathWords(input.path));
      else if (name) parts.push(name);
      if (title && title !== name) parts.push(title);
      break;
    }
    case 'app':
    default: {
      if (name) parts.push(name);
      // Window titles often carry the document/subject.
      if (title && title !== name) parts.push(title);
      if (!name && input.path) parts.push(pathWords(input.path));
      break;
    }
  }

  return parts.join(' — ').replace(/\s+/g, ' ').trim();
}
