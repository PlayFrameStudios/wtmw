/** Site-wide names and links. */

export const SITE = {
  name: 'Where the Money Went',
  /** Compact form for tight spots: the mobile header, favicon, social handles. */
  short: 'WTMW',
  domain: 'wherethemoneywent.com',
  repo: 'https://github.com/PlayFrameStudios/wtmw',
  /** The copyright holder, named and linked in the footer. */
  publisher: { name: 'PlayFrame Studios', url: 'https://playframestudios.com/' },
  /** The tool the site is built with, credited in the footer. */
  madeWith: { name: 'Foundry', url: 'https://foundryworks.dev' },
} as const;

/**
 * "Report an error": a new GitHub issue from .github/ISSUE_TEMPLATE/report-an-error.yml,
 * with the page's URL already filled in.
 */
export function reportErrorUrl(pageUrl: URL): string {
  const params = new URLSearchParams({
    template: 'report-an-error.yml',
    title: `Error on ${pageUrl.pathname}`,
    page: pageUrl.href,
  });
  return `${SITE.repo}/issues/new?${params}`;
}
