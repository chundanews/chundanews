const fs = require('fs');

const PROJECT_ID = 'chunda-news';
const DOMAIN = 'https://chundanewslive.in';
const COLLECTION = 'news_posts';
const PAGE_SIZE = 300;
const NEWS_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

async function listDocuments(pageToken = '') {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`);
  url.searchParams.set('pageSize', PAGE_SIZE);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Firestore API ${response.status}: ${await response.text()}`);
  return response.json();
}

function timestampToIso(value) {
  if (!value) return null;
  if (value.timestampValue) return new Date(value.timestampValue).toISOString();
  if (value.stringValue) {
    const d = new Date(value.stringValue);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

async function generateNewsSitemap(documents) {
  const cutoff = Date.now() - NEWS_MAX_AGE_MS;
  const recent = documents.map(doc => {
    const fields = doc.fields || {};
    const rawDate = fields.createdAt?.timestampValue || fields.publishedAt?.timestampValue;
    const publishedAt = rawDate ? new Date(rawDate) : null;
    const title = fields.title?.stringValue || fields.headline?.stringValue || '';
    return { id: doc.name.split('/').pop(), publishedAt, title };
  }).filter(x => x.publishedAt && !Number.isNaN(x.publishedAt.getTime()) && x.publishedAt.getTime() >= cutoff && x.title)
    .sort((a,b) => b.publishedAt - a.publishedAt).slice(0, 1000);
  const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
  for (const item of recent) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(`${DOMAIN}/article.html?id=${encodeURIComponent(item.id)}`)}</loc>\n`;
    xml += '    <news:news>\n      <news:publication>\n        <news:name>CHUNDA KSHETRA NEWS</news:name>\n        <news:language>hi</news:language>\n      </news:publication>\n';
    xml += `      <news:publication_date>${item.publishedAt.toISOString()}</news:publication_date>\n      <news:title>${escapeXml(item.title)}</news:title>\n    </news:news>\n  </url>\n`;
  }
  xml += '</urlset>\n';
  return { xml, count: recent.length };
}

async function generateSitemap() {
  const urls = [{
    loc: `${DOMAIN}/`,
    lastmod: new Date().toISOString(),
    changefreq: 'hourly',
    priority: '1.0'
  }];

  let pageToken = '';
  const documents = [];
  let total = 0;

  do {
    const page = await listDocuments(pageToken);
    documents.push(...(page.documents || []));
    for (const doc of page.documents || []) {
      const id = doc.name.split('/').pop();
      const fields = doc.fields || {};
      const updatedAt = timestampToIso(fields.updatedAt) || timestampToIso(fields.createdAt);
      urls.push({
        loc: `${DOMAIN}/article.html?id=${encodeURIComponent(id)}`,
        ...(updatedAt ? { lastmod: updatedAt } : {}),
        changefreq: 'daily',
        priority: '0.8'
      });
      total++;
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  const escapeXml = value => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const item of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(item.loc)}</loc>\n`;
    if (item.lastmod) xml += `    <lastmod>${item.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${item.changefreq}</changefreq>\n`;
    xml += `    <priority>${item.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>\n';

  fs.writeFileSync('./sitemap.xml', xml);
  const news = await generateNewsSitemap(documents);
  fs.writeFileSync('./news-sitemap.xml', news.xml);
  console.log(`Sitemaps generated: ${total} articles + homepage; ${news.count} recent news URLs`);
}

generateSitemap().catch(error => {
  console.error('Sitemap generation failed:', error);
  process.exit(1);
});
