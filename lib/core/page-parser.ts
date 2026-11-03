import type { MediaPost } from './media';

/**
 * Parsing data the page has already received (method C).
 *
 * Runs in the page context (MAIN world), so it must be pure:
 * no `browser.*`/`chrome.*` APIs and no state. This makes it easy to test
 * on saved JSON.
 */
export interface PageDataParser {
  /** Whether to parse the response from this URL. Called on every XHR/fetch, so it must be cheap. */
  shouldParse(url: string): boolean;
  /** Find all posts in JSON: an XHR/fetch response or an embedded `<script type="application/json">`. */
  parse(json: unknown): MediaPost[];
}
